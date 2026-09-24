import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool";
import { type EvolutionWriterConfig, EvolutionWriterConfigSchema } from "../../config/schema/evolution";
import { EVOLUTION_DIR, PENDING_DIR, TraceStore } from "../../features/evolution/store";
import type { SkillMeta } from "../../features/evolution/types";
import { EvolutionWriter } from "../../features/evolution/writer";
import { AUDIT_TAIL_LIMIT, EVOLUTION_DESCRIPTION, NO_PENDING_MESSAGE, SLUG_PATTERN } from "./constants";
import type { EvolutionToolArgs, PendingProposalSummary } from "./types";

export type EvolutionToolOptions = {
  writerConfig?: EvolutionWriterConfig;
};

function checkSlug(slug: string | undefined): string | null {
  if (!slug) return "Error: this action requires a `slug`. Use the `list` action to see available proposals.";
  if (!SLUG_PATTERN.test(slug)) return `Error: invalid slug "${slug}". Slugs stay inside the pending directory.`;
  return null;
}

function readMeta(pendingDir: string, slug: string): SkillMeta | null {
  try {
    const raw = fs.readFileSync(path.join(pendingDir, `${slug}.meta.json`), "utf-8");
    return JSON.parse(raw) as SkillMeta;
  } catch {
    return null;
  }
}

function summarize(pendingDir: string, slug: string): PendingProposalSummary {
  const meta = readMeta(pendingDir, slug);
  return { slug, version: meta?.version ?? null, confidence: meta?.confidence ?? null };
}

function formatSummary(summary: PendingProposalSummary): string {
  const version = summary.version ?? "unknown";
  const confidence = summary.confidence ?? "unknown";
  return `- ${summary.slug} (version ${version}, confidence ${confidence})`;
}

function reservedMessage(action: "search" | "query-context"): string {
  return (
    `The '${action}' action is reserved for read-only retrieval and is not implemented yet. ` +
    `Use list/get/status for governance.`
  );
}

async function handleList(writer: EvolutionWriter, pendingDir: string): Promise<string> {
  const slugs = await writer.listPending();
  if (slugs.length === 0) return NO_PENDING_MESSAGE;
  const lines = slugs.sort().map((slug) => formatSummary(summarize(pendingDir, slug)));
  return `Pending evolution proposals (${slugs.length}):\n${lines.join("\n")}`;
}

function handleGet(pendingDir: string, slug: string): string {
  const invalid = checkSlug(slug);
  if (invalid) return invalid;
  const pendingPath = path.join(pendingDir, `${slug}.md`);
  if (!fs.existsSync(pendingPath)) {
    return `Error: pending "${slug}" not found. Use the \`list\` action to see available proposals.`;
  }
  const content = fs.readFileSync(pendingPath, "utf-8");
  const meta = readMeta(pendingDir, slug);
  const header = meta ? `version ${meta.version}, confidence ${meta.confidence}` : "no meta found";
  return `Pending proposal "${slug}" (${header}):\n\n${content}`;
}

async function handleApprove(
  writerConfig: EvolutionWriterConfig,
  projectRoot: string,
  pendingDir: string,
  slug: string,
  global: boolean,
): Promise<string> {
  const invalid = checkSlug(slug);
  if (invalid) return invalid;
  if (!fs.existsSync(path.join(pendingDir, `${slug}.md`))) {
    return `Error: pending "${slug}" not found. Use the \`list\` action to see available proposals.`;
  }
  const writer = new EvolutionWriter(global ? { ...writerConfig, globalSkills: true } : writerConfig, projectRoot);
  const { promotedPath } = await writer.promote(slug);
  return `Promoted ${slug} to ${promotedPath} — will be loaded on next session start.`;
}

async function handleReject(writer: EvolutionWriter, pendingDir: string, slug: string): Promise<string> {
  const invalid = checkSlug(slug);
  if (invalid) return invalid;
  if (!fs.existsSync(path.join(pendingDir, `${slug}.md`))) {
    return `Error: pending "${slug}" not found. Use the \`list\` action to see available proposals.`;
  }
  await writer.reject(slug);
  return `Rejected ${slug}.`;
}

async function handleStatus(store: TraceStore, writer: EvolutionWriter, evolutionDir: string): Promise<string> {
  const state = await store.getState();
  const pending = await writer.listPending();
  let auditTail = "No audit entries.";
  try {
    const lines = fs.readFileSync(path.join(evolutionDir, "audit.log"), "utf-8").split("\n").filter(Boolean);
    if (lines.length > 0) auditTail = lines.slice(-AUDIT_TAIL_LIMIT).join("\n");
  } catch {}
  return [
    `Evolution state: ${state.totalTraces} traces, ${state.totalCompressions} compressions.`,
    `Pending proposals (${pending.length}): ${pending.length > 0 ? pending.sort().join(", ") : "none"}.`,
    `Last ${AUDIT_TAIL_LIMIT} audit entries:\n${auditTail}`,
  ].join("\n");
}

/**
 * `evolution` tool factory — governance + query host for self-evolution.
 *
 * Wave1 exposes the governance actions `list/get/approve/reject/status`,
 * all delegated to the evolution store APIs (`EvolutionWriter`, `TraceStore`)
 * so no shell command ever touches evolution state. `search` and
 * `query-context` are reserved stubs until T9 implements read-only retrieval.
 */
export function createEvolutionTool(ctx: PluginInput, options?: EvolutionToolOptions): Record<string, ToolDefinition> {
  const projectRoot = ctx.directory ?? process.cwd();
  const writerConfig = options?.writerConfig ?? EvolutionWriterConfigSchema.parse({});
  const pendingDir = path.resolve(projectRoot, PENDING_DIR);
  const evolutionDir = path.resolve(projectRoot, EVOLUTION_DIR);

  const evolution: ToolDefinition = tool({
    description: EVOLUTION_DESCRIPTION,
    args: {
      action: tool.schema
        .enum(["list", "get", "approve", "reject", "status", "search", "query-context"])
        .describe(
          "Governance action: list pending proposals, get a staged proposal, approve (promote) or reject it, or show status. search and query-context are reserved for future retrieval.",
        ),
      slug: tool.schema
        .string()
        .optional()
        .describe("Proposal slug (required for get/approve/reject). Never invent one — read it from list."),
      global: tool.schema
        .boolean()
        .optional()
        .describe("(action=approve) Also promote to the global skills dir (default: false)."),
    },
    execute: async (args: EvolutionToolArgs) => {
      try {
        const writer = new EvolutionWriter(writerConfig, projectRoot);
        const store = new TraceStore(evolutionDir);
        switch (args.action) {
          case "list":
            return await handleList(writer, pendingDir);
          case "get":
            return handleGet(pendingDir, args.slug as string);
          case "approve":
            return await handleApprove(writerConfig, projectRoot, pendingDir, args.slug as string, args.global ?? false);
          case "reject":
            return await handleReject(writer, pendingDir, args.slug as string);
          case "status":
            return await handleStatus(store, writer, evolutionDir);
          case "search":
          case "query-context":
            return reservedMessage(args.action);
        }
      } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
  });

  return { evolution };
}
