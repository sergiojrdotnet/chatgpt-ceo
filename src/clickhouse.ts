import { DomainError } from "./model.ts";
// At most 101 rows. Schema-bounded text is under 128 KiB/row even with
// six-byte JSON escapes; 16 MiB includes column/metadata overhead.
export const MAX_HISTORY_BYTES = 16 * 1024 * 1024;
export type ClickHouseOptions = {
  url: string;
  database: string;
  username: string;
  password: string;
  timeoutMs?: number;
};
export interface EventDatabase {
  query(
    sql: string,
    parameters?: Record<string, string>,
  ): Promise<Record<string, unknown>[]>;
  insert(row: Record<string, unknown>): Promise<void>;
}
export class ClickHouse implements EventDatabase {
  private endpoint: URL;
  private options: ClickHouseOptions;
  constructor(options: ClickHouseOptions) {
    this.options = options;
    this.endpoint = new URL(options.url);
    if (
      !["http:", "https:"].includes(this.endpoint.protocol) ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.search ||
      this.endpoint.hash ||
      this.endpoint.pathname !== "/"
    )
      throw new Error("Expected ClickHouse HTTP(S) origin without credentials");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.database))
      throw new Error("Invalid ClickHouse database");
  }
  private async request(
    sql: string,
    parameters: Record<string, string>,
    body?: string,
  ) {
    const url = new URL(this.endpoint);
    url.searchParams.set("database", this.options.database);
    url.searchParams.set("query", sql);
    url.searchParams.set("wait_end_of_query", "1");
    url.searchParams.set("buffer_size", String(MAX_HISTORY_BYTES));
    url.searchParams.set("max_execution_time", "10");
    url.searchParams.set("date_time_input_format", "best_effort");
    url.searchParams.set("date_time_output_format", "iso");
    url.searchParams.set("async_insert", "0");
    url.searchParams.set("insert_deduplicate", "0");
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(`param_${key}`, value);
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 12000),
      headers: {
        "X-ClickHouse-User": this.options.username,
        "X-ClickHouse-Key": this.options.password,
        "Content-Type": "text/plain",
      },
      body: body ?? "",
    });
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > MAX_HISTORY_BYTES) {
            await reader.cancel();
            throw new Error("Response limit");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (!response.ok || response.headers.has("x-clickhouse-exception-code"))
      throw new Error("ClickHouse rejected response");
    return text;
  }
  async query(sql: string, parameters: Record<string, string> = {}) {
    try {
      const raw = await this.request(sql + " FORMAT JSONEachRow", parameters);
      return raw.trim()
        ? raw
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as Record<string, unknown>)
        : [];
    } catch {
      throw new DomainError("HISTORY_UNAVAILABLE");
    }
  }
  async insert(row: Record<string, unknown>) {
    // Exactly one attempt. Even a lost response can follow a committed insert.
    const result = await this.request(
      "INSERT INTO coordination_events FORMAT JSONEachRow",
      {},
      JSON.stringify(row) + "\n",
    );
    if (result.trim()) throw new Error("Unexpected insert response");
  }
}
