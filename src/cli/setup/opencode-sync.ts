import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectConfigFile, parseJsoncSafe } from "../../shared/jsonc-parser";
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir";
import type { SetupState } from "./types";

const CONTEXT_VARIANTS = ["context-mode", "@tarquinen/context-mode", "opencode-context-mode"];
const DCP_PLUGIN = "@tarquinen/opencode-dcp";

export function resolveOpencodeConfigPath(): { format: "json" | "jsonc" | "none"; path: string } {
  const dir = getOpenCodeConfigDir({ binary: "opencode" });
  return detectConfigFile(join(dir, "opencode"));
}

function normalizePlugins(plugins: string[], state: SetupState): string[] {
  const set = new Set(plugins);
  const hasContext = CONTEXT_VARIANTS.some((v) => set.has(v));
  if (state.contextMode) {
    if (!hasContext) set.add("context-mode");
    for (const v of CONTEXT_VARIANTS) {
      if (v !== "context-mode" && set.has(v)) set.delete(v);
    }
  } else {
    for (const v of CONTEXT_VARIANTS) set.delete(v);
  }
  if (state.dcp.enabled) {
    if (!set.has(DCP_PLUGIN)) {
    }
  }
  return [...set];
}

export async function syncOpencodePlugins(state: SetupState, opts: { dryRun: boolean }): Promise<void> {
  const { path: cfgPath } = resolveOpencodeConfigPath();
  const dir = dirname(cfgPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let raw: Record<string, unknown> = {};
  let existingContent: string | null = null;
  if (existsSync(cfgPath)) {
    existingContent = readFileSync(cfgPath, "utf-8");
    const parsed = parseJsoncSafe<Record<string, unknown>>(existingContent);
    if (parsed.data) raw = parsed.data;
  } else {
    const fallback = join(dir, "opencode.jsonc");
    if (existsSync(fallback)) {
      const c = readFileSync(fallback, "utf-8");
      const p = parseJsoncSafe<Record<string, unknown>>(c);
      if (p.data) raw = p.data;
    }
  }

  const plugins = Array.isArray(raw.plugin) ? (raw.plugin as string[]) : [];
  const nextPlugins = normalizePlugins(plugins, state);
  const nextRaw = { ...raw, plugin: nextPlugins };

  if (opts.dryRun) {
    console.log("[dry-run] opencode plugin sync:", cfgPath);
    console.log("  before:", JSON.stringify(plugins));
    console.log("  after: ", JSON.stringify(nextPlugins));
    return;
  }

  if (existingContent) {
    const bak = `${cfgPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    writeFileSync(bak, existingContent);
  }

  const outPath = cfgPath.includes(".jsonc") || !existsSync(cfgPath) ? join(dir, "opencode.jsonc") : cfgPath;
  if (JSON.stringify(plugins) === JSON.stringify(nextPlugins) && existsSync(outPath)) return;
  writeFileSync(outPath, `${JSON.stringify(nextRaw, null, 2)}\n`);
}

export function hasContextModePlugin(plugins: string[]): boolean {
  return CONTEXT_VARIANTS.some((v) => plugins.includes(v));
}
