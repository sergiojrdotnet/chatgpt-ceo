import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { ConfigStore } from "./config-store.ts";
import {
  DomainError,
  digest,
  fail,
  appendEventSchema,
  listEventsSchema,
  eventSchema,
} from "./model.ts";
import type { CoordinationEvent, ListEventsInput } from "./model.ts";
import type { EventDatabase } from "./clickhouse.ts";
export class EventWriteUncertain extends DomainError {
  readonly attemptedEventId: string;
  constructor(attemptedEventId: string) {
    super("EVENT_WRITE_UNCERTAIN");
    this.attemptedEventId = attemptedEventId;
  }
}
const key = z.tuple([z.iso.datetime(), z.uuid()]);
const cursorSchema = z
  .object({ filters: z.string(), after: key, through: key })
  .strict();
const columns = `event_id, action, scope_type, scope_id, issue_id, issue_identifier, phase, reason, result, outcome,
 observed_at, recorded_at, producer_id, evidence_refs, thread_id, turn_id, correlation_id, corrects_event_id`;
function row(e: CoordinationEvent): Record<string, unknown> {
  return {
    event_id: e.eventId,
    action: e.action,
    scope_type: e.scope.type,
    scope_id: e.scope.id,
    issue_id: e.issueId ?? null,
    issue_identifier: e.issueIdentifier ?? null,
    phase: e.phase ?? null,
    reason: e.reason,
    result: e.result,
    outcome: e.outcome,
    observed_at: e.observedAt,
    recorded_at: e.recordedAt,
    producer_id: e.producerId,
    evidence_refs: e.evidenceRefs,
    thread_id: e.threadId ?? null,
    turn_id: e.turnId ?? null,
    correlation_id: e.correlationId ?? null,
    corrects_event_id: e.correctsEventId ?? null,
  };
}
function event(r: Record<string, unknown>): CoordinationEvent {
  const optional = (name: string, field: string) =>
    r[field] == null ? {} : { [name]: r[field] };
  const e = eventSchema.parse({
    action: r.action,
    scope: { type: r.scope_type, id: r.scope_id },
    ...optional("issueId", "issue_id"),
    ...optional("issueIdentifier", "issue_identifier"),
    ...optional("phase", "phase"),
    reason: r.reason,
    result: r.result,
    outcome: r.outcome,
    observedAt: r.observed_at,
    evidenceRefs: r.evidence_refs,
    ...optional("threadId", "thread_id"),
    ...optional("turnId", "turn_id"),
    ...optional("correlationId", "correlation_id"),
    ...optional("correctsEventId", "corrects_event_id"),
  });
  return {
    ...e,
    eventId: z.uuid().parse(r.event_id),
    recordedAt: z.iso.datetime().parse(r.recorded_at),
    producerId: z.string().min(1).parse(r.producer_id),
  };
}
export class Store extends ConfigStore {
  private cursorKey = randomBytes(32);
  private database: EventDatabase;
  constructor(path: string, database: EventDatabase) {
    super(path);
    this.database = database;
  }
  close() {}
  async ready() {
    this.adminRead();
    await this.database.query(
      "SELECT event_id FROM coordination_events LIMIT 0",
    );
  }
  async appendEvent(actor: string, input: unknown) {
    const a = appendEventSchema.parse(input);
    this.read("context", a.expectedDigest);
    if (Date.parse(a.event.observedAt) > Date.now()) fail("FUTURE_OBSERVATION");
    if (a.event.correctsEventId) {
      const target = await this.listEvents({
        eventId: a.event.correctsEventId,
        limit: 2,
      });
      if (target.events.length !== 1) fail("EVENT_NOT_FOUND");
      const prior = target.events[0];
      if (
        prior.scope.type !== a.event.scope.type ||
        prior.scope.id !== a.event.scope.id ||
        prior.issueId !== a.event.issueId
      )
        fail("CORRECTION_SCOPE_MISMATCH");
    }
    // Recheck after the asynchronous correction lookup; no cross-store transaction is claimed.
    this.read("context", a.expectedDigest);
    const saved: CoordinationEvent = {
      ...a.event,
      eventId: randomUUID(),
      recordedAt: new Date().toISOString(),
      producerId: actor,
    };
    try {
      await this.database.insert(row(saved));
    } catch {
      throw new EventWriteUncertain(saved.eventId);
    }
    return { event: saved };
  }
  async listEvents(input: ListEventsInput = {}) {
    const parsed = listEventsSchema.parse(input);
    if (parsed.scopeType === "issue" && parsed.scopeId)
      parsed.scopeId = parsed.scopeId.toLowerCase();
    const { cursor, ...filters } = parsed;
    const order = parsed.order ?? "asc",
      filterDigest = digest({ ...filters, order });
    const terms: string[] = [],
      parameters: Record<string, string> = {};
    for (const [field, column, type] of [
      ["eventId", "event_id", "UUID"],
      ["issueId", "issue_id", "UUID"],
      ["scopeType", "scope_type", "String"],
      ["scopeId", "scope_id", "String"],
      ["action", "action", "String"],
    ] as const) {
      if (parsed[field] !== undefined) {
        terms.push(`${column} = {${field}:${type}}`);
        parameters[field] = parsed[field]!;
      }
    }
    for (const field of ["from", "to"] as const)
      if (parsed[field]) {
        terms.push(
          `observed_at ${field === "from" ? ">=" : "<="} parseDateTime64BestEffort({${field}:String}, 3, 'UTC')`,
        );
        parameters[field] = parsed[field]!;
      }
    let through: [string, string], after: [string, string] | undefined;
    if (cursor) {
      try {
        const [body, signature, extra] = cursor.split(".");
        if (extra || !body || !signature) throw Error();
        const expected = createHmac("sha256", this.cursorKey)
            .update(body)
            .digest(),
          actual = Buffer.from(signature, "base64url");
        if (
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected)
        )
          throw Error();
        const decoded = cursorSchema.parse(
          JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
        );
        if (decoded.filters !== filterDigest) throw Error();
        through = decoded.through;
        after = decoded.after;
      } catch {
        fail("INVALID_CURSOR");
      }
    } else {
      const maximum = await this.database.query(
        `SELECT recorded_at, event_id FROM coordination_events ${terms.length ? "WHERE " + terms.join(" AND ") : ""} ORDER BY recorded_at DESC, event_id DESC LIMIT 1`,
        parameters,
      );
      if (!maximum.length)
        return { events: [], hasMore: false, nextCursor: null };
      through = key.parse([maximum[0].recorded_at, maximum[0].event_id]);
    }
    parameters.throughTime = through[0];
    parameters.throughId = through[1];
    terms.push(
      "(recorded_at, event_id) <= (parseDateTime64BestEffort({throughTime:String}, 3, 'UTC'), {throughId:UUID})",
    );
    if (after) {
      parameters.afterTime = after[0];
      parameters.afterId = after[1];
      terms.push(
        `(recorded_at, event_id) ${order === "asc" ? ">" : "<"} (parseDateTime64BestEffort({afterTime:String}, 3, 'UTC'), {afterId:UUID})`,
      );
    }
    const rows = await this.database.query(
      `SELECT ${columns} FROM coordination_events WHERE ${terms.join(" AND ")} ORDER BY recorded_at ${order.toUpperCase()}, event_id ${order.toUpperCase()} LIMIT ${parsed.limit + 1}`,
      parameters,
    );
    if (rows.length > parsed.limit + 1) fail("INVALID_HISTORY_RESPONSE");
    const events = rows.slice(0, parsed.limit).map(event),
      hasMore = rows.length > parsed.limit;
    let nextCursor: string | null = null;
    if (hasMore) {
      const last = events[events.length - 1];
      const body = Buffer.from(
        JSON.stringify({
          filters: filterDigest,
          after: [last.recordedAt, last.eventId],
          through,
        }),
      ).toString("base64url");
      nextCursor =
        body +
        "." +
        createHmac("sha256", this.cursorKey).update(body).digest("base64url");
    }
    return { events, hasMore, nextCursor };
  }
}
