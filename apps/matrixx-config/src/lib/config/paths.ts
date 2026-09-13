import { invoke } from "@tauri-apps/api/core";

export interface ConfigPaths {
  /** Directory containing configuration files */
  configDir: string;
  /** Path to opencode.json or opencode.jsonc */
  opencodeConfig: string;
  /** Path to opencode.jsonc (preferred) */
  opencodeJsonc: string;
  /** Path to matrixx.json or matrixx.jsonc */
  matrixxConfig: string;
}

/**
 * Resolve platform-specific OpenCode configuration paths.
 *
 * In Tauri mode, delegates to the Rust `resolve_paths` command which handles
 * platform detection (Linux/macOS/Windows) and the OPENCODE_CONFIG_DIR env override.
 *
 * In browser/fallback mode, returns reasonable defaults for development.
 */
export async function resolveConfigPaths(): Promise<ConfigPaths> {
  try {
    const result = await invoke<{
      opencode_jsonc: string;
      matrixx_jsonc: string;
    }>("resolve_paths");

    const configDir = extractDir(result.opencode_jsonc);

    return {
      configDir,
      opencodeConfig: result.opencode_jsonc,
      opencodeJsonc: result.opencode_jsonc,
      matrixxConfig: result.matrixx_jsonc,
    };
  } catch {
    // Fallback for browser dev mode (no Tauri runtime)
    return getFallbackPaths();
  }
}

/**
 * Resolve paths synchronously using environment hints.
 * Useful for SSR or contexts where Tauri is unavailable.
 */
export function resolveConfigPathsSync(): ConfigPaths {
  return getFallbackPaths();
}

function getFallbackPaths(): ConfigPaths {
  const platform = getPlatform();
  const configDir = getDefaultConfigDir(platform);

  return {
    configDir,
    opencodeConfig: `${configDir}/opencode.jsonc`,
    opencodeJsonc: `${configDir}/opencode.jsonc`,
    matrixxConfig: `${configDir}/matrixx.jsonc`,
  };
}

function extractDir(filePath: string): string {
  const lastSep = filePath.lastIndexOf("/");
  if (lastSep === -1) {
    const winSep = filePath.lastIndexOf("\\");
    return winSep === -1 ? filePath : filePath.slice(0, winSep);
  }
  return filePath.slice(0, lastSep);
}

type Platform = "linux" | "macos" | "windows" | "unknown";

function getPlatform(): Platform {
  if (typeof navigator !== "undefined" && navigator.platform) {
    const p = navigator.platform.toLowerCase();
    if (p.includes("linux")) return "linux";
    if (p.includes("mac")) return "macos";
    if (p.includes("win")) return "windows";
  }

  return "linux";
}

function getDefaultConfigDir(platform: Platform): string {
  switch (platform) {
    case "macos":
      return "/Users/Shared/Library/Application Support/ai.opencode.desktop";
    case "windows":
      return "C:\\Users\\Default\\AppData\\Roaming\\ai.opencode.desktop";
    default:
      return `${getHomeDir()}/.config/opencode`;
  }
}

function getHomeDir(): string {
  if (typeof process !== "undefined" && process.env?.HOME) {
    return process.env.HOME;
  }
  return "/home/user";
}
