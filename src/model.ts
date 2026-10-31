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
  instructions: string;
  model: string;
  effort: string;
  environment?: string;
};
export type Configuration = {
  schemaVersion: 1;
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
  release: {
    restrictedWindows: { weekdays: number[]; start: string; end: string }[];
    observationMinimumMinutes: number;
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
  if (!(
    cap.preferredMin <= cap.preferredMax &&
    cap.preferredMax <= cap.activeMax &&
    cap.urgentIncidentMax === cap.activeMax + 1
  ))
    fail("INVALID_CAPACITY");
  if (new Set(c.agents.map((a) => a.id)).size !== c.agents.length)
    fail("DUPLICATE_AGENT_ID");
  if (c.active && c.executionEnabled && !c.agents.length)
    fail("AGENTS_REQUIRED");
  const windows = c.release.restrictedWindows;
  if (
    [c.selection.administrativeHours, ...windows].some((w) => w.start >= w.end)
  )
    fail("INVALID_WINDOW");
  if (
    windows.some((a, i) =>
      windows
        .slice(i + 1)
        .some(
          (b) =>
            a.weekdays.some((d) => b.weekdays.includes(d)) &&
            a.start < b.end &&
            b.start < a.end,
        ),
    )
  )
    fail("OVERLAPPING_WINDOWS");
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
export const checkpointSchema = z
  .object({
    attemptId: identifier,
    phase: z
      .string()
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/),
    agentId: identifier,
    ownerRef: z.string().trim().min(1).max(160),
    scope: z.string().trim().min(1).max(2000),
    nextCheck: z.iso.datetime({ offset: true }),
    state: z.enum([
      "intended",
      "submitted",
      "uncertain",
      "rejected",
      "verified",
      "blocked",
      "failed",
    ]),
    threadId: identifier.optional(),
    turnId: identifier.optional(),
    evidenceRefs: z.array(z.string().trim().min(1).max(500)).max(30),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.turnId && !c.threadId)
      ctx.addIssue({
        code: "custom",
        message: "Turn ID requires its thread ID",
      });
    if (["verified", "rejected"].includes(c.state) && !c.evidenceRefs.length)
      ctx.addIssue({
        code: "custom",
        message: "Terminal outcome requires evidence references",
      });
    if (c.state === "submitted" && !c.threadId)
      ctx.addIssue({
        code: "custom",
        message: "Submitted outcome requires the returned thread ID",
      });
  });
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type Principal = {
  id: string;
  roles: Set<"read" | "admin" | "checkpoint">;
  expiresAt: number;
};
export function authorize(p: Principal, role: "read" | "admin" | "checkpoint") {
  if (p.expiresAt <= Date.now() || !p.roles.has(role)) fail("UNAUTHORIZED");
}
