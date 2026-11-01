import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store.ts";
import type { EventDatabase } from "../../src/clickhouse.ts";
import { digest } from "../../src/model.ts";
import config from "../../examples/inactive-a.json" with { type: "json" };
export const issue = "00000000-0000-4000-8000-000000000001";
export const otherIssue = "00000000-0000-4000-8000-000000000002";
export const sample = {
  action: "execution",
  scope: { type: "issue", id: issue },
  issueId: issue,
  issueIdentifier: "SYN-1",
  reason: "Synthetic decision",
  result: "Synthetic result",
  outcome: "uncertain",
  observedAt: "2026-01-01T00:00:00.000Z",
  evidenceRefs: [],
};
// Test double for query composition/browser/SDK tests, not ClickHouse integration evidence.
export class MemoryEvents implements EventDatabase {
  rows: Record<string, any>[] = [];
  inserts = 0;
  async insert(row: Record<string, unknown>) {
    this.inserts++;
    this.rows.push(structuredClone(row));
  }
  async query(sql: string, p: Record<string, string> = {}) {
    if (sql.endsWith("LIMIT 0")) return [];
    let rows = [...this.rows];
    for (const [field, column] of [
      ["eventId", "event_id"],
      ["issueId", "issue_id"],
      ["scopeType", "scope_type"],
      ["scopeId", "scope_id"],
      ["action", "action"],
    ])
      if (p[field]) rows = rows.filter((r) => r[column] === p[field]);
    if (p.from) rows = rows.filter((r) => r.observed_at >= p.from);
    if (p.to) rows = rows.filter((r) => r.observed_at <= p.to);
    const tuple = (r: Record<string, any>) => r.recorded_at + "/" + r.event_id;
    if (p.throughTime)
      rows = rows.filter((r) => tuple(r) <= p.throughTime + "/" + p.throughId);
    if (p.afterTime)
      rows = rows.filter((r) =>
        sql.includes("event_id) >")
          ? tuple(r) > p.afterTime + "/" + p.afterId
          : tuple(r) < p.afterTime + "/" + p.afterId,
      );
    rows.sort((a, b) => tuple(a).localeCompare(tuple(b)));
    if (sql.includes("ORDER BY recorded_at DESC")) rows.reverse();
    return rows.slice(0, Number(sql.match(/LIMIT (\d+)/)![1]));
  }
}
export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "ceo-test-"));
  const database = new MemoryEvents();
  const store = new Store(join(directory, "config.json"), database);
  return {
    store,
    database,
    directory,
    setup: () => store.update(null, digest(config), config),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
export { config, digest };
