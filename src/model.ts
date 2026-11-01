import { createHash } from "node:crypto";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { z } from "zod";
import schema from "../references/policy.schema.json" with { type: "json" };

export class DomainError extends Error {}
export function fail(code: string): never {
  throw new DomainError(code);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const ajv = new Ajv2020({ allErrors: false, strict: true });
addFormats.default(ajv);
const validate = ajv.compile(schema);
export type Agent = {
  id: string;
  name: string;
  description: string;
  instructions?: string;
  model: string;
  effort: string;
  environment?: string;
};
export type Configuration = {
  schemaVersion: 2;
  profileId: string;
  effectiveAt: string;
  active: boolean;
  fixtureOnly: boolean;
  executionEnabled: boolean;
  ownerRef: string;
  timezone: string;
  bindings: {
    linear: { workspaceRef: string; teamRef: string };
    github: { repositories: string[] };
    erpnext: { connectionRef: string };
  };
  capacity: {
    preferredMin: number;
    preferredMax: number;
    activeMax: number;
    urgentIncidentMax: number;
  };
  selection: {
    administrativeHours: { start: string; end: string };
    lowActivityPreference: boolean;
  };
  agents: Agent[];
};
export function configuration(input: unknown): Configuration {
  if (
    Buffer.byteLength(JSON.stringify(input) ?? "") > 256 * 1024 ||
    !validate(input)
  )
    fail("INVALID_CONFIGURATION");
  const c = input as Configuration;
  try {
    new Intl.DateTimeFormat("en", { timeZone: c.timezone });
  } catch {
    fail("INVALID_TIMEZONE");
  }
  if (
    c.effectiveAt.endsWith("-00:00") ||
    !Number.isFinite(Date.parse(c.effectiveAt))
  )
    fail("INVALID_TIMESTAMP");
  const cap = c.capacity;
  if (
    !(
      cap.preferredMin <= cap.preferredMax &&
      cap.preferredMax <= cap.activeMax &&
      cap.urgentIncidentMax === cap.activeMax + 1
    )
  )
    fail("INVALID_CAPACITY");
  if (new Set(c.agents.map((a) => a.id)).size !== c.agents.length)
    fail("DUPLICATE_AGENT_ID");
  if (c.active && c.executionEnabled && !c.agents.length)
    fail("AGENTS_REQUIRED");
  if (c.selection.administrativeHours.start >= c.selection.administrativeHours.end)
    fail("INVALID_WINDOW");
  // Closed schema: references only, no credential bags or arbitrary settings.
  if (
    /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|https?:\/\/[^\s/]+:[^\s/]+@/i.test(
      JSON.stringify(c),
    )
  )
    fail("CREDENTIAL_MATERIAL_FORBIDDEN");
  return structuredClone(c);
}
export const identifier = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const actionSchema = z.enum([
  "planning",
  "selection",
  "delegation",
  "execution",
  "release-plan",
  "publication",
  "handoff",
  "validation",
  "incident",
  "administration",
  "configuration",
  "correction",
]);
export const scopeTypeSchema = z.enum([
  "issue",
  "project",
  "configuration",
  "incident",
]);
const timestamp = z.iso
  .datetime({ offset: true })
  .refine(
    (v) => !v.endsWith("-00:00") && Number.isFinite(Date.parse(v)),
    "Invalid timestamp",
  )
  .transform((v) => new Date(v).toISOString());
export const eventSchema = z
  .object({
    action: actionSchema,
    scope: z.object({ type: scopeTypeSchema, id: identifier }).strict(),
    issueId: identifier.optional(),
    phase: z.enum(["implementation", "release", "validation"]).optional(),
    reason: z.string().trim().min(1).max(1000),
    result: z.string().trim().min(1).max(2000),
    outcome: z.enum([
      "planned",
      "confirmed",
      "failed",
      "uncertain",
      "blocked",
      "deferred",
    ]),
    observedAt: timestamp,
    evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(30),
    threadId: identifier.optional(),
    turnId: identifier.optional(),
    correlationId: identifier.optional(),
    correctsEventId: z.uuid().optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    const problem = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (e.turnId && !e.threadId) problem("Turn ID requires thread ID");
    if (e.scope.type === "issue" && e.issueId !== e.scope.id)
      problem("Issue scope requires matching canonical issueId");
    if (["confirmed", "failed"].includes(e.outcome) && !e.evidenceRefs.length)
      problem("Confirmed or failed outcome requires evidence");
    if ((e.action === "correction") !== !!e.correctsEventId)
      problem(
        "Corrections require a linked event; other actions cannot correct",
      );
    if (new Set(e.evidenceRefs).size !== e.evidenceRefs.length)
      problem("Duplicate evidence reference");
    if (
      /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|https?:\/\/[^\s/]+:[^\s/]+@/i.test(
        JSON.stringify(e),
      )
    )
      problem("Credential material forbidden");
  });
export const appendEventSchema = z
  .object({
    requestId: identifier,
    expectedRevision: z.number().int().positive(),
    event: eventSchema,
  })
  .strict();
export const listEventsSchema = z
  .object({
    issueId: identifier.optional(),
    scopeType: scopeTypeSchema.optional(),
    scopeId: identifier.optional(),
    action: actionSchema.optional(),
    from: timestamp.optional(),
    to: timestamp.optional(),
    limit: z.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(1024).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.scopeId && !f.scopeType)
      ctx.addIssue({ code: "custom", message: "scopeId requires scopeType" });
    if (f.from && f.to && f.from > f.to)
      ctx.addIssue({ code: "custom", message: "Invalid time range" });
  });
export type AppendEventInput = z.input<typeof appendEventSchema>;
export type ListEventsInput = z.input<typeof listEventsSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type CoordinationEvent = EventInput & {
  eventId: string;
  recordedAt: string;
  producerId: string;
  configurationRevision: number;
  configurationDigest: string;
};
export type Principal = {
  id: string;
  roles: Set<"read" | "admin" | "event">;
  expiresAt: number;
};
export function authorize(p: Principal, role: "read" | "admin" | "event") {
  if (p.expiresAt <= Date.now() || !p.roles.has(role)) fail("UNAUTHORIZED");
}
