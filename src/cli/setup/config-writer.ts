import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type MatrixxConfig, MatrixxConfigSchema } from "../../config/schema/matrixx-config";
import { deepMerge } from "../../shared/deep-merge";
import { detectConfigFile, parseJsonc } from "../../shared/jsonc-parser";
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir";
import type { SetupState } from "./types";

export function resolveMatrixxConfigPath(): { format: "json" | "jsonc" | "none"; path: string } {
  const dir = getOpenCodeConfigDir({ binary: "opencode" });
  return detectConfigFile(join(dir, "matrixx"));
}

export function buildMatrixxConfig(state: SetupState, existing: MatrixxConfig | null): MatrixxConfig {
  const next: Record<string, unknown> = { ...(existing ?? {}) };
  next.experimental = {
    ...((existing?.experimental as Record<string, unknown>) ?? {}),
    task_system: state.taskSystem,
  };
  next.headroom = {
    enabled: state.headroom.enabled,
    ...(state.headroom.proxyUrl ? { proxyUrl: state.headroom.proxyUrl } : {}),
    ...(state.headroom.project ? { project: state.headroom.project } : {}),
  };
  next.rtk = {
    enabled: state.rtk.enabled,
    ...(state.rtk.binaryPath ? { binary_path: state.rtk.binaryPath } : {}),
    timeout_ms: 5000,
  };
  next.dcp = {
    ...(existing?.dcp as Record<string, unknown> ?? {}),
    enabled: state.dcp.enabled,
  } as unknown as MatrixxConfig["dcp"];
  const parsed = MatrixxConfigSchema.safeParse(next);
  if (parsed.success) return parsed.data;
  return next as MatrixxConfig;
}

export function previewDiff(existing: string, next: string): string {
  const a = existing.split("\n");
  const b = next.split("\n");
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) out.push(`- ${a[i]}`);
      if (b[i] !== undefined) out.push(`+ ${b[i]}`);
    } else {
      out.push(`  ${a[i] ?? ""}`);
    }
  }
  return out.join("\n");
}

export async function writeMatrixxConfig(
  targetPath: string,
  config: MatrixxConfig,
  opts: { dryRun: boolean; backup: boolean },
): Promise<void> {
  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const existingContent = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : null;
  const nextContent = `${JSON.stringify(config, null, 2)}\n`;

  if (opts.dryRun) {
    const diff = existingContent ? previewDiff(existingContent, nextContent) : nextContent;
    console.log("[dry-run] would write:", targetPath);
    console.log(diff);
    return;
  }

  if (existingContent && opts.backup) {
    const bak = `${targetPath}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    writeFileSync(bak, existingContent);
  }

  if (existingContent) {
    try {
      const existing = parseJsonc<MatrixxConfig>(existingContent);
      const merged = deepMerge(existing as unknown as Record<string, unknown>, config as unknown as Record<string, unknown>) as unknown as MatrixxConfig;
      const parsed = MatrixxConfigSchema.safeParse(merged);
      if (parsed.success) {
        writeFileSync(targetPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
        return;
      }
    } catch {}
  }

  writeFileSync(targetPath, nextContent);
}
