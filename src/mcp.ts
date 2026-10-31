import {
  historyUri,
  historyMime,
  historyHtml,
  historyMeta,
} from "./history-ui.ts";
import {
  McpServer,
  createMcpHandler,
  ProtocolError,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  authorize,
  configuration,
  digest,
  DomainError,
  identifier,
  appendEventSchema,
  listEventsSchema,
} from "./model.ts";
import type { Principal } from "./model.ts";
import type { Store } from "./store.ts";
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const write = { ...read, readOnlyHint: false };
export function mcp(store: Store) {
  return createMcpHandler(
    ({ authInfo }) => {
      if (!authInfo) throw new ProtocolError(-32024, "Authentication required");
      const p: Principal = {
        id: authInfo.clientId,
        roles: new Set(authInfo.scopes as ("read" | "admin" | "event")[]),
        expiresAt: (authInfo.expiresAt ?? 0) * 1000,
      };
      const server = new McpServer(
        { name: "ceo", version: "0.1.0" },
        {
          instructions:
            "Read operation context then needed subject tools at the same revision. Configuration is not operational authority. Missing, partial, stale or conflicting reads block dependent decisions. Admin writes require review; event acknowledgement is not dispatch or exactly-once execution.",
        },
      );
      function result(value: object) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(value) }],
          structuredContent: value as Record<string, unknown>,
        };
      }
      function run(role: "read" | "admin" | "event", fn: () => object) {
        try {
          authorize(p, role);
          return result(fn());
        } catch (e) {
          return {
            ...result({
              error: e instanceof DomainError ? e.message : "UNAVAILABLE",
            }),
            isError: true,
          };
        }
      }
      server.registerTool(
        "get_operation_context",
        {
          description:
            "Read company context, bindings, execution flags and common configuration revision.",
          inputSchema: z
            .object({
              expectedRevision: z.number().int().positive().optional(),
            })
            .strict(),
          annotations: read,
        },
        (a) => run("read", () => store.read("context", a.expectedRevision)),
      );
      for (const [name, subject, description] of [
        [
          "get_agents",
          "agents",
          "Read complete agent templates; select by description and preserve whole settings.",
        ],
        [
          "get_selection_policy",
          "selection",
          "Read capacity and work-selection constraints.",
        ],
        [
          "get_release_policy",
          "release",
          "Read release windows and observation constraints.",
        ],
      ] as const)
        server.registerTool(
          name,
          {
            description,
            inputSchema: z
              .object({ expectedRevision: z.number().int().positive() })
              .strict(),
            annotations: read,
          },
          (a) => run("read", () => store.read(subject, a.expectedRevision)),
        );
      server.registerTool(
        "get_configuration",
        {
          description:
            "Admin-only complete configuration and setup status; does not activate execution.",
          inputSchema: z.object({}).strict(),
          annotations: read,
        },
        () => run("admin", () => store.adminRead()),
      );
      server.registerTool(
        "validate_configuration",
        {
          description:
            "Admin-only validation of a complete proposal. Returns review digest; no save or authority grant.",
          inputSchema: z
            .object({ configuration: z.record(z.string(), z.unknown()) })
            .strict(),
          annotations: read,
        },
        (a) =>
          run("admin", () => {
            const c = configuration(a.configuration);
            return { valid: true, reviewDigest: digest(c), configuration: c };
          }),
      );
      server.registerTool(
        "update_configuration",
        {
          description:
            "Admin-only atomic complete replacement after reviewing this exact proposal. Retry identical requestId only; conflicting revision requires reread and new review.",
          inputSchema: z
            .object({
              configuration: z.record(z.string(), z.unknown()),
              expectedRevision: z.number().int().nonnegative(),
              reviewDigest: z.string().regex(/^[a-f0-9]{64}$/),
              requestId: identifier,
            })
            .strict(),
          annotations: write,
        },
        (a) =>
          run("admin", () =>
            store.update(
              p.id,
              a.requestId,
              a.expectedRevision,
              a.reviewDigest,
              a.configuration,
            ),
          ),
      );
      server.registerTool(
        "list_coordination_events",
        {
          description:
            "Read immutable coordination history with bounded snapshot pagination. Linear owns current task state; absence never proves an external action failed.",
          inputSchema: listEventsSchema,
          annotations: read,
        },
        (a) => run("read", () => store.listEvents(a)),
      );
      server.registerResource(
        "coordination-history",
        historyUri,
        {
          mimeType: historyMime,
          description: "Read-only coordination history view",
        },
        () => {
          authorize(p, "read");
          return {
            contents: [
              {
                uri: historyUri,
                mimeType: historyMime,
                text: historyHtml,
                _meta: historyMeta,
              },
            ],
          };
        },
      );
      server.registerTool(
        "show_coordination_history",
        {
          title: "Coordination history",
          description:
            "Show a read-only history dashboard inside ChatGPT. Fetches bounded pages through the authenticated host; no operations or live task state.",
          inputSchema: z
            .object({
              issueId: listEventsSchema.shape.issueId,
              scopeType: listEventsSchema.shape.scopeType,
              scopeId: listEventsSchema.shape.scopeId,
              order: listEventsSchema.shape.order,
            })
            .strict()
            .superRefine((a, ctx) => {
              const parsed = listEventsSchema.safeParse(a);
              if (!parsed.success)
                for (const issue of parsed.error.issues)
                  ctx.addIssue({
                    code: "custom",
                    message: issue.message,
                    path: issue.path,
                  });
            }),
          annotations: read,
          _meta: { ui: { resourceUri: historyUri } },
        },
        (a) => {
          const checked = run("read", () => ({}));
          if ("isError" in checked) return checked;
          return {
            content: [
              {
                type: "text" as const,
                text: "Coordination history view ready.",
              },
            ],
            _meta: { historyFilters: { ...a, order: a.order ?? "desc" } },
          };
        },
      );
      server.registerTool(
        "append_coordination_event",
        {
          description:
            "Event-writer-only immutable factual decision/action/result. Exact request retries return the original event; no dispatch or exactly-once external effects. Corrections append linked events.",
          inputSchema: appendEventSchema,
          annotations: write,
        },
        (a) => run("event", () => store.appendEvent(p.id, a)),
      );
      return server;
    },
    { maxRequestBodySize: 512 * 1024 },
  );
}
