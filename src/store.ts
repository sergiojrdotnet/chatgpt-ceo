import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DatabaseSync, backup } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import {
  configuration,
  digest,
  fail,
  appendEventSchema,
  listEventsSchema,
} from "./model.ts";
import type { CoordinationEvent, Agent } from "./model.ts";
type Row = Record<string, string | number | null>;
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
      );
      this.transaction(() => {
        const version = Number(
          this.db.prepare("PRAGMA user_version").get()!.user_version,
        );
        const hasTables = !!this.db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
          )
          .get();
        if ((hasTables && version !== 2) || (!hasTables && version !== 0)) {
          fail("CLEAN_DATABASE_REQUIRED");
        }

        this.db.exec(`CREATE TABLE IF NOT EXISTS policy(
        revision INTEGER PRIMARY KEY CHECK(revision>0), digest TEXT NOT NULL,
        profile_id TEXT NOT NULL, effective_at TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)),
        fixture_only INTEGER NOT NULL CHECK(fixture_only IN(0,1)), execution_enabled INTEGER NOT NULL CHECK(execution_enabled IN(0,1)),
        owner_ref TEXT NOT NULL, timezone TEXT NOT NULL,
        preferred_min INTEGER NOT NULL CHECK(preferred_min>0),preferred_max INTEGER NOT NULL CHECK(preferred_max>=preferred_min),
        active_max INTEGER NOT NULL CHECK(active_max>=preferred_max),urgent_max INTEGER NOT NULL CHECK(urgent_max=active_max+1),
        administrative_start TEXT NOT NULL,administrative_end TEXT NOT NULL CHECK(administrative_end>administrative_start),
        low_activity INTEGER NOT NULL CHECK(low_activity IN(0,1)),observation_minutes INTEGER NOT NULL CHECK(observation_minutes>0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS bindings(revision INTEGER PRIMARY KEY REFERENCES policy(revision),linear_workspace TEXT NOT NULL,linear_team TEXT NOT NULL,erp_connection TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS repositories(revision INTEGER NOT NULL REFERENCES policy(revision),position INTEGER NOT NULL CHECK(position>=0),repository TEXT NOT NULL,PRIMARY KEY(revision,position),UNIQUE(revision,repository)) STRICT;
      CREATE TABLE IF NOT EXISTS agents(revision INTEGER NOT NULL REFERENCES policy(revision),id TEXT NOT NULL,position INTEGER NOT NULL CHECK(position>=0),name TEXT NOT NULL,description TEXT NOT NULL,instructions TEXT NOT NULL,model TEXT NOT NULL,effort TEXT NOT NULL CHECK(effort IN('low','medium','high','xhigh','max','ultra')),environment TEXT,PRIMARY KEY(revision,id),UNIQUE(revision,position)) STRICT;
      CREATE TABLE IF NOT EXISTS release_windows(revision INTEGER NOT NULL REFERENCES policy(revision),position INTEGER NOT NULL CHECK(position>=0),start TEXT NOT NULL,end TEXT NOT NULL CHECK(end>start),PRIMARY KEY(revision,position)) STRICT;
      CREATE TABLE IF NOT EXISTS release_days(revision INTEGER NOT NULL,window_position INTEGER NOT NULL,position INTEGER NOT NULL CHECK(position>=0),weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7),PRIMARY KEY(revision,window_position,position),UNIQUE(revision,window_position,weekday),FOREIGN KEY(revision,window_position) REFERENCES release_windows(revision,position)) STRICT;
      CREATE TABLE IF NOT EXISTS coordination_events(
        seq INTEGER PRIMARY KEY CHECK(seq>0),event_id TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL CHECK(action IN('planning','selection','delegation','execution','release-plan','publication','handoff','validation','incident','administration','configuration','correction')),
        scope_type TEXT NOT NULL CHECK(scope_type IN('issue','project','configuration','incident')),scope_id TEXT NOT NULL,
        issue_id TEXT,phase TEXT CHECK(phase IN('implementation','release','validation')),
        reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),result TEXT NOT NULL CHECK(length(result) BETWEEN 1 AND 2000),
        outcome TEXT NOT NULL CHECK(outcome IN('planned','confirmed','failed','uncertain','blocked','deferred')),
        observed_at TEXT NOT NULL,recorded_at TEXT NOT NULL,producer_id TEXT NOT NULL,
        configuration_revision INTEGER NOT NULL REFERENCES policy(revision),
        thread_id TEXT,turn_id TEXT CHECK(turn_id IS NULL OR thread_id IS NOT NULL),correlation_id TEXT,
        corrects_event_id TEXT REFERENCES coordination_events(event_id),evidence_count INTEGER NOT NULL CHECK(evidence_count BETWEEN 0 AND 30),
        CHECK(scope_type!='issue' OR (issue_id IS NOT NULL AND issue_id=scope_id)),
        CHECK((action='correction' AND corrects_event_id IS NOT NULL) OR (action!='correction' AND corrects_event_id IS NULL)),
        CHECK(outcome NOT IN('confirmed','failed') OR evidence_count>0)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS events_issue ON coordination_events(issue_id,seq);
      CREATE INDEX IF NOT EXISTS events_scope ON coordination_events(scope_type,scope_id,seq);
      CREATE INDEX IF NOT EXISTS events_action ON coordination_events(action,seq);
      CREATE INDEX IF NOT EXISTS events_time ON coordination_events(observed_at,seq);
      CREATE TABLE IF NOT EXISTS event_evidence(event_id TEXT NOT NULL REFERENCES coordination_events(event_id),position INTEGER NOT NULL CHECK(position>=0),reference TEXT NOT NULL CHECK(length(reference) BETWEEN 1 AND 500),PRIMARY KEY(event_id,position),UNIQUE(event_id,reference)) STRICT;
      CREATE TRIGGER IF NOT EXISTS evidence_bound BEFORE INSERT ON event_evidence WHEN NEW.position >= (SELECT evidence_count FROM coordination_events WHERE event_id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'EVIDENCE_LIMIT'); END;
      CREATE TRIGGER IF NOT EXISTS correction_scope BEFORE INSERT ON coordination_events WHEN NEW.corrects_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM coordination_events WHERE event_id=NEW.corrects_event_id AND scope_type=NEW.scope_type AND scope_id=NEW.scope_id AND issue_id IS NEW.issue_id) BEGIN SELECT RAISE(ABORT,'CORRECTION_SCOPE_MISMATCH'); END;
      CREATE TABLE IF NOT EXISTS requests(actor TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN('configuration','event')),result_revision INTEGER NOT NULL REFERENCES policy(revision),event_id TEXT REFERENCES coordination_events(event_id),PRIMARY KEY(actor,id),CHECK((operation='event')=(event_id IS NOT NULL))) STRICT;
      CREATE TABLE IF NOT EXISTS store_identity(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,actor TEXT NOT NULL,operation TEXT NOT NULL,revision INTEGER NOT NULL,at TEXT NOT NULL) STRICT;`);
        this.db
          .prepare("INSERT OR IGNORE INTO store_identity VALUES(1,?)")
          .run(randomUUID());
        // No API or ordinary SQL update/delete can rewrite accepted evidence or policy.
        for (const table of [
          "policy",
          "bindings",
          "repositories",
          "agents",
          "release_windows",
          "release_days",
          "coordination_events",
          "event_evidence",
          "requests",
          "audit",
          "store_identity",
        ]) {
          for (const operation of ["UPDATE", "DELETE"])
            this.db.exec(
              `CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RECORD'); END;`,
            );
        }
        this.db.exec("PRAGMA user_version=2");
      });
      if (path !== ":memory:") chmodSync(path, 0o600);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  ready() {
    this.db.prepare("SELECT 1").get();
  }
  private current() {
    return Number(
      this.db
        .prepare("SELECT COALESCE(MAX(revision),0) AS revision FROM policy")
        .get()!.revision,
    );
  }
  private insert(table: string, values: SQLInputValue[]) {
    this.db
      .prepare(
        `INSERT INTO ${table} VALUES(${values.map(() => "?").join(",")})`,
      )
      .run(...values);
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  private policy(revision: number) {
    const p = this.db
      .prepare("SELECT * FROM policy WHERE revision=?")
      .get(revision) as Row | undefined;
    if (!p) fail("SETUP_REQUIRED");
    const b = this.db
      .prepare("SELECT * FROM bindings WHERE revision=?")
      .get(revision) as Row | undefined;
    if (!b) fail("INCOMPLETE_CONFIGURATION");
    const c = configuration({
      schemaVersion: 1,
      profileId: p.profile_id,
      effectiveAt: p.effective_at,
      active: !!p.active,
      fixtureOnly: !!p.fixture_only,
      executionEnabled: !!p.execution_enabled,
      ownerRef: p.owner_ref,
      timezone: p.timezone,
      bindings: {
        linear: { workspaceRef: b.linear_workspace, teamRef: b.linear_team },
        github: {
          repositories: this.db
            .prepare(
              "SELECT repository FROM repositories WHERE revision=? ORDER BY position",
            )
            .all(revision)
            .map((r) => r.repository),
        },
        erpnext: { connectionRef: b.erp_connection },
      },
      capacity: {
        preferredMin: p.preferred_min,
        preferredMax: p.preferred_max,
        activeMax: p.active_max,
        urgentIncidentMax: p.urgent_max,
      },
      selection: {
        administrativeHours: {
          start: p.administrative_start,
          end: p.administrative_end,
        },
        lowActivityPreference: !!p.low_activity,
      },
      release: {
        observationMinimumMinutes: p.observation_minutes,
        restrictedWindows: this.db
          .prepare(
            "SELECT * FROM release_windows WHERE revision=? ORDER BY position",
          )
          .all(revision)
          .map((w) => ({
            start: w.start,
            end: w.end,
            weekdays: this.db
              .prepare(
                "SELECT weekday FROM release_days WHERE revision=? AND window_position=? ORDER BY position",
              )
              .all(revision, w.position)
              .map((d) => d.weekday),
          })),
      },
      agents: this.db
        .prepare("SELECT * FROM agents WHERE revision=? ORDER BY position")
        .all(revision)
        .map((a) => this.agent(a as Row)),
    });
    if (digest(c) !== p.digest) fail("INTEGRITY_FAILURE");
    return { c, digest: String(p.digest) };
  }
  private agent(a: Row): Agent {
    return {
      id: String(a.id),
      name: String(a.name),
      description: String(a.description),
      instructions: String(a.instructions),
      model: String(a.model),
      effort: String(a.effort),
      ...(a.environment === null ? {} : { environment: String(a.environment) }),
    };
  }
  private replay(row: Row) {
    const p = this.policy(Number(row.result_revision));
    return { revision: Number(row.result_revision), digest: p.digest };
  }
  private mutate<T extends { revision: number }>(
    actor: string,
    requestId: string,
    input: unknown,
    operation: "configuration",
    run: () => T,
  ) {
    return this.transaction(() => {
      const hash = digest(input),
        prior = this.db
          .prepare("SELECT * FROM requests WHERE actor=? AND id=?")
          .get(actor, requestId) as Row | undefined;
      if (prior) {
        if (prior.digest !== hash) fail("IDEMPOTENCY_CONFLICT");
        return this.replay(prior) as unknown as T;
      }
      const result = run();
      const revision = result.revision;
      this.insert("requests", [
        actor,
        requestId,
        hash,
        operation,
        revision,
        null,
      ]);
      this.db
        .prepare(
          "INSERT INTO audit(actor,operation,revision,at) VALUES(?,?,?,?)",
        )
        .run(actor, operation, revision, new Date().toISOString());
      return result;
    });
  }
  adminRead() {
    const revision = this.current(),
      p = revision ? this.policy(revision) : null;
    return {
      schemaVersion: 1,
      revision,
      setupRequired: !revision,
      configuration: p?.c ?? null,
      digest: p?.digest ?? null,
    };
  }
  read(
    subject: "context" | "agents" | "selection" | "release",
    expectedRevision?: number,
  ) {
    const revision = this.current();
    if (!revision) fail("SETUP_REQUIRED");
    if (expectedRevision !== undefined && expectedRevision !== revision)
      fail("REVISION_CONFLICT");
    // Revisions and their children are immutable: concurrent publication cannot mix reads.
    const { c, digest: hash } = this.policy(revision);
    const data =
      subject === "context"
        ? {
            profileId: c.profileId,
            ownerRef: c.ownerRef,
            timezone: c.timezone,
            bindings: c.bindings,
          }
        : subject === "agents"
          ? { agents: c.agents }
          : subject === "selection"
            ? {
                capacity: c.capacity,
                selection: c.selection,
                timezone: c.timezone,
              }
            : { release: c.release, timezone: c.timezone };
    return {
      schemaVersion: 1,
      revision,
      digest: hash,
      complete: true,
      readAt: new Date().toISOString(),
      effectiveAt: c.effectiveAt,
      active: c.active,
      fixtureOnly: c.fixtureOnly,
      executionEnabled: c.executionEnabled,
      subject,
      data,
    };
  }
  update(
    actor: string,
    requestId: string,
    expectedRevision: number,
    reviewDigest: string,
    input: unknown,
  ) {
    const c = configuration(input);
    if (digest(c) !== reviewDigest) fail("REVIEW_DIGEST_MISMATCH");
    return this.mutate(
      actor,
      requestId,
      { operation: "configuration", expectedRevision, reviewDigest, c },
      "configuration",
      () => {
        const current = this.current();
        if (current !== expectedRevision) fail("REVISION_CONFLICT");
        if (current && this.policy(current).c.profileId !== c.profileId)
          fail("IDENTITY_MISMATCH");
        const r = current + 1;
        this.insert("policy", [
          r,
          reviewDigest,
          c.profileId,
          c.effectiveAt,
          +c.active,
          +c.fixtureOnly,
          +c.executionEnabled,
          c.ownerRef,
          c.timezone,
          c.capacity.preferredMin,
          c.capacity.preferredMax,
          c.capacity.activeMax,
          c.capacity.urgentIncidentMax,
          c.selection.administrativeHours.start,
          c.selection.administrativeHours.end,
          +c.selection.lowActivityPreference,
          c.release.observationMinimumMinutes,
        ]);
        this.insert("bindings", [
          r,
          c.bindings.linear.workspaceRef,
          c.bindings.linear.teamRef,
          c.bindings.erpnext.connectionRef,
        ]);
        c.bindings.github.repositories.forEach((repository, i) =>
          this.insert("repositories", [r, i, repository]),
        );
        c.agents.forEach((a, i) =>
          this.insert("agents", [
            r,
            a.id,
            i,
            a.name,
            a.description,
            a.instructions,
            a.model,
            a.effort,
            a.environment ?? null,
          ]),
        );
        c.release.restrictedWindows.forEach((w, i) => {
          this.insert("release_windows", [r, i, w.start, w.end]);
          w.weekdays.forEach((d, j) =>
            this.insert("release_days", [r, i, j, d]),
          );
        });
        return { revision: r, digest: reviewDigest };
      },
    );
  }
  private event(eventId: string): CoordinationEvent {
    const row = this.db
      .prepare("SELECT * FROM coordination_events WHERE event_id=?")
      .get(eventId) as Row | undefined;
    if (!row) fail("EVENT_NOT_FOUND");
    const optional = (key: string, column: string) =>
      row[column] === null ? {} : { [key]: String(row[column]) };
    const evidenceRefs = this.db
      .prepare(
        "SELECT reference FROM event_evidence WHERE event_id=? ORDER BY position",
      )
      .all(eventId)
      .map((r) => String(r.reference));
    if (evidenceRefs.length !== row.evidence_count) fail("INTEGRITY_FAILURE");
    return {
      eventId,
      action: row.action as CoordinationEvent["action"],
      scope: {
        type: row.scope_type as CoordinationEvent["scope"]["type"],
        id: String(row.scope_id),
      },
      ...optional("issueId", "issue_id"),
      ...optional("phase", "phase"),
      reason: String(row.reason),
      result: String(row.result),
      outcome: row.outcome as CoordinationEvent["outcome"],
      observedAt: String(row.observed_at),
      recordedAt: String(row.recorded_at),
      producerId: String(row.producer_id),
      configurationRevision: Number(row.configuration_revision),
      configurationDigest: this.policy(Number(row.configuration_revision))
        .digest,
      ...optional("threadId", "thread_id"),
      ...optional("turnId", "turn_id"),
      ...optional("correlationId", "correlation_id"),
      ...optional("correctsEventId", "corrects_event_id"),
      evidenceRefs,
    };
  }
  appendEvent(actor: string, input: unknown): { event: CoordinationEvent } {
    const a = appendEventSchema.parse(input);
    return this.transaction(() => {
      const hash = digest({ operation: "event", ...a });
      const prior = this.db
        .prepare("SELECT * FROM requests WHERE actor=? AND id=?")
        .get(actor, a.requestId) as Row | undefined;
      if (prior) {
        if (prior.operation !== "event" || prior.digest !== hash)
          fail("IDEMPOTENCY_CONFLICT");
        return { event: this.event(String(prior.event_id)) };
      }
      const revision = this.current();
      if (!revision || revision !== a.expectedRevision)
        fail("REVISION_CONFLICT");
      this.policy(revision);
      const e = a.event;
      if (Date.parse(e.observedAt) > Date.now()) fail("FUTURE_OBSERVATION");
      if (e.correctsEventId) {
        const original = this.event(e.correctsEventId);
        if (
          original.scope.type !== e.scope.type ||
          original.scope.id !== e.scope.id ||
          original.issueId !== e.issueId
        )
          fail("CORRECTION_SCOPE_MISMATCH");
      }
      const eventId = randomUUID(),
        recordedAt = new Date().toISOString();
      this.insert("coordination_events", [
        null,
        eventId,
        e.action,
        e.scope.type,
        e.scope.id,
        e.issueId ?? null,
        e.phase ?? null,
        e.reason,
        e.result,
        e.outcome,
        e.observedAt,
        recordedAt,
        actor,
        revision,
        e.threadId ?? null,
        e.turnId ?? null,
        e.correlationId ?? null,
        e.correctsEventId ?? null,
        e.evidenceRefs.length,
      ]);
      e.evidenceRefs.forEach((ref, i) =>
        this.insert("event_evidence", [eventId, i, ref]),
      );
      this.insert("requests", [
        actor,
        a.requestId,
        hash,
        "event",
        revision,
        eventId,
      ]);
      this.db
        .prepare(
          "INSERT INTO audit(actor,operation,revision,at) VALUES(?,?,?,?)",
        )
        .run(actor, "event", revision, recordedAt);
      return { event: this.event(eventId) };
    });
  }
  listEvents(input: unknown = {}): {
    events: CoordinationEvent[];
    hasMore: boolean;
    nextCursor: string | null;
  } {
    const a = listEventsSchema.parse(input);
    const { cursor, limit, ...filters } = a;
    const storeId = String(
      this.db.prepare("SELECT value FROM store_identity WHERE id=1").get()!
        .value,
    );
    const filterDigest = digest({ storeId, filters });
    const max = Number(
      this.db
        .prepare("SELECT COALESCE(MAX(seq),0) AS n FROM coordination_events")
        .get()!.n,
    );
    let after = 0,
      through = max;
    if (cursor) {
      try {
        const parsed = z
          .object({
            v: z.literal(1),
            after: z.number().int().nonnegative(),
            through: z.number().int().nonnegative(),
            filterDigest: z.string(),
          })
          .strict()
          .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
        if (
          parsed.filterDigest !== filterDigest ||
          parsed.after > parsed.through ||
          parsed.through > max
        )
          fail("INVALID_CURSOR");
        after = parsed.after;
        through = parsed.through;
      } catch {
        fail("INVALID_CURSOR");
      }
    }
    const clauses = ["seq>?", "seq<=?"],
      values: SQLInputValue[] = [after, through];
    for (const [key, column, op] of [
      ["issueId", "issue_id", "="],
      ["scopeType", "scope_type", "="],
      ["scopeId", "scope_id", "="],
      ["action", "action", "="],
      ["from", "observed_at", ">="],
      ["to", "observed_at", "<="],
    ] as const)
      if (filters[key] !== undefined) {
        clauses.push(`${column}${op}?`);
        values.push(filters[key]);
      }
    const rows = this.db
      .prepare(
        `SELECT seq,event_id FROM coordination_events WHERE ${clauses.join(" AND ")} ORDER BY seq ASC LIMIT ?`,
      )
      .all(...values, limit + 1);
    const hasMore = rows.length > limit,
      page = rows.slice(0, limit);
    return {
      events: page.map((r) => this.event(String(r.event_id))),
      hasMore,
      nextCursor: hasMore
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              after: Number(page.at(-1)!.seq),
              through,
              filterDigest,
            }),
          ).toString("base64url")
        : null,
    };
  }
  async backup(path: string) {
    await backup(this.db, path);
    chmodSync(path, 0o600);
    const copy = new DatabaseSync(path, { readOnly: true });
    try {
      if (
        copy.prepare("PRAGMA integrity_check").get()?.integrity_check !==
          "ok" ||
        copy.prepare("PRAGMA foreign_key_check").all().length
      )
        fail("BACKUP_INVALID");
    } finally {
      copy.close();
    }
  }
}
