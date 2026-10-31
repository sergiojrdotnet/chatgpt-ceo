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
  checkpointSchema,
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
        roles: new Set(authInfo.scopes as ("read" | "admin" | "checkpoint")[]),
        expiresAt: (authInfo.expiresAt ?? 0) * 1000,
      };
      const server = new McpServer(
        { name: "ceo", version: "0.1.0" },
        {
          instructions:
            "Read operation context then needed subject tools at the same revision. Configuration is not operational authority. Missing, partial, stale or conflicting reads block dependent decisions. Admin writes require review; checkpoint acknowledgement is not dispatch or exactly-once execution.",
        },
      );
      function result(value: object) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(value) }],
          structuredContent: value as Record<string, unknown>,
        };
      }
      function run(role: "read" | "admin" | "checkpoint", fn: () => object) {
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
        "get_checkpoint",
        {
          description:
            "Recover the latest private issue checkpoint and its related phase sessions. No record or absent session does not prove that dispatch failed.",
          inputSchema: z.object({ issueId: identifier }).strict(),
          annotations: read,
        },
        (a) => run("read", () => store.checkpoint(a.issueId)),
      );
      server.registerTool(
        "save_checkpoint",
        {
          description:
            "Checkpoint-writer-only optimistic evidence update; preserves selected template and revision. Never dispatches or guarantees exactly-once effects.",
          inputSchema: z
            .object({
              issueId: identifier,
              expectedVersion: z.number().int().nonnegative(),
              expectedRevision: z.number().int().positive(),
              checkpoint: checkpointSchema,
              requestId: identifier,
            })
            .strict(),
          annotations: write,
        },
        (a) =>
          run("checkpoint", () =>
            store.saveCheckpoint(
              p.id,
              a.requestId,
              a.issueId,
              a.expectedVersion,
              a.expectedRevision,
              a.checkpoint,
            ),
          ),
      );
      return server;
    },
    { maxRequestBodySize: 512 * 1024 },
  );
}
