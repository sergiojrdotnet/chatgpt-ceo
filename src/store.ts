import { DatabaseSync, backup } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { configuration, digest, fail, checkpointSchema } from "./model.ts";
import type { Checkpoint, Agent } from "./model.ts";
type Row = Record<string, string | number | null>;
export class Store {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS policy(
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
      CREATE TABLE IF NOT EXISTS checkpoints(issue TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),attempt_id TEXT NOT NULL,agent_id TEXT NOT NULL,configuration_revision INTEGER NOT NULL,owner_ref TEXT NOT NULL,scope TEXT NOT NULL,next_check TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN('intended','submitted','uncertain','rejected','verified','blocked','failed')),thread_id TEXT,turn_id TEXT CHECK(turn_id IS NULL OR thread_id IS NOT NULL),updated_at TEXT NOT NULL,PRIMARY KEY(issue,version),FOREIGN KEY(configuration_revision,agent_id) REFERENCES agents(revision,id)) STRICT;
      CREATE TABLE IF NOT EXISTS checkpoint_evidence(issue TEXT NOT NULL,version INTEGER NOT NULL,position INTEGER NOT NULL CHECK(position>=0),reference TEXT NOT NULL,PRIMARY KEY(issue,version,position),FOREIGN KEY(issue,version) REFERENCES checkpoints(issue,version)) STRICT;
      CREATE TABLE IF NOT EXISTS requests(actor TEXT NOT NULL,id TEXT NOT NULL,digest TEXT NOT NULL,operation TEXT NOT NULL CHECK(operation IN('configuration','checkpoint')),result_revision INTEGER NOT NULL,issue TEXT,PRIMARY KEY(actor,id)) STRICT;
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,actor TEXT NOT NULL,operation TEXT NOT NULL,revision INTEGER NOT NULL,at TEXT NOT NULL) STRICT;`);
    if (path !== ":memory:") chmodSync(path, 0o600);
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
    if (row.operation === "configuration") {
      const p = this.policy(Number(row.result_revision));
      return { revision: Number(row.result_revision), digest: p.digest };
    }
    return this.checkpoint(String(row.issue), Number(row.result_revision));
  }
  private mutate<T extends { revision?: number; version?: number }>(
    actor: string,
    requestId: string,
    input: unknown,
    operation: "configuration" | "checkpoint",
    issue: string | null,
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
      const revision = Number(result.revision ?? result.version);
      this.insert("requests", [
        actor,
        requestId,
        hash,
        operation,
        revision,
        issue,
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
      null,
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
  checkpoint(
    issue: string,
    version?: number,
  ): {
    version: number;
    checkpoint:
      | (Checkpoint & {
          agent: Agent;
          configurationRevision: number;
          configurationDigest: string;
          updatedAt: string;
        })
      | null;
  } {
    const p = (
      version === undefined
        ? this.db
            .prepare(
              "SELECT * FROM checkpoints WHERE issue=? ORDER BY version DESC LIMIT 1",
            )
            .get(issue)
        : this.db
            .prepare("SELECT * FROM checkpoints WHERE issue=? AND version=?")
            .get(issue, version)
    ) as Row | undefined;
    if (!p) return { version: 0, checkpoint: null };
    const policy = this.policy(Number(p.configuration_revision));
    const agent = policy.c.agents.find((a) => a.id === p.agent_id);
    if (!agent) fail("INTEGRITY_FAILURE");
    return {
      version: Number(p.version),
      checkpoint: {
        attemptId: String(p.attempt_id),
        agentId: String(p.agent_id),
        ownerRef: String(p.owner_ref),
        scope: String(p.scope),
        nextCheck: String(p.next_check),
        state: p.state as Checkpoint["state"],
        ...(p.thread_id === null ? {} : { threadId: String(p.thread_id) }),
        ...(p.turn_id === null ? {} : { turnId: String(p.turn_id) }),
        evidenceRefs: this.db
          .prepare(
            "SELECT reference FROM checkpoint_evidence WHERE issue=? AND version=? ORDER BY position",
          )
          .all(issue, p.version)
          .map((e) => String(e.reference)),
        agent,
        configurationRevision: Number(p.configuration_revision),
        configurationDigest: policy.digest,
        updatedAt: String(p.updated_at),
      },
    };
  }
  saveCheckpoint(
    actor: string,
    requestId: string,
    issue: string,
    expectedVersion: number,
    expectedRevision: number,
    input: Checkpoint,
  ) {
    const c = checkpointSchema.parse(input);
    return this.mutate(
      actor,
      requestId,
      { operation: "checkpoint", issue, expectedVersion, expectedRevision, c },
      "checkpoint",
      issue,
      () => {
        const revision = this.current();
        if (!revision || revision !== expectedRevision)
          fail("REVISION_CONFLICT");
        const policy = this.policy(revision),
          old = this.checkpoint(issue);
        if (old.version !== expectedVersion) fail("CHECKPOINT_CONFLICT");
        const previous = old.checkpoint,
          same = previous?.attemptId === c.attemptId;
        if (
          !same &&
          previous &&
          !["rejected", "verified"].includes(previous.state)
        )
          fail("UNRESOLVED_ATTEMPT");
        if (
          !same &&
          this.db
            .prepare(
              "SELECT 1 FROM checkpoints WHERE issue=? AND attempt_id=? LIMIT 1",
            )
            .get(issue, c.attemptId)
        )
          fail("ATTEMPT_ID_REUSED");
        if (!same && c.state !== "intended")
          fail("INTENDED_CHECKPOINT_REQUIRED");
        if (
          same &&
          (previous!.agentId !== c.agentId ||
            previous!.scope !== c.scope ||
            previous!.ownerRef !== c.ownerRef)
        )
          fail("ATTEMPT_IDENTITY_CONFLICT");
        if (!same && !policy.c.agents.some((a) => a.id === c.agentId))
          fail("AGENT_UNKNOWN");
        if (same && c.state === "intended" && previous!.state !== "intended")
          fail("ATTEMPT_STATE_CONFLICT");
        if (same && previous!.threadId && previous!.threadId !== c.threadId)
          fail("THREAD_IDENTITY_CONFLICT");
        if (same && previous!.turnId && !c.turnId)
          fail("TURN_EVIDENCE_REQUIRED");
        const version = expectedVersion + 1;
        this.insert("checkpoints", [
          issue,
          version,
          c.attemptId,
          c.agentId,
          same ? previous!.configurationRevision : revision,
          c.ownerRef,
          c.scope,
          c.nextCheck,
          c.state,
          c.threadId ?? null,
          c.turnId ?? null,
          new Date().toISOString(),
        ]);
        c.evidenceRefs.forEach((ref, i) =>
          this.insert("checkpoint_evidence", [issue, version, i, ref]),
        );
        return this.checkpoint(issue, version);
      },
    );
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
