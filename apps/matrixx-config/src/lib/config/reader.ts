import { invoke } from "@tauri-apps/api/core";

import { type JsoncParseResult, parseJsoncSafe } from "./utils/jsonc";

export interface ReadResult<T> {
  data: T | null;
  errors: Array<{ message: string; offset: number; length: number }>;
  source: "tauri" | "fetch" | "error";
}

/**
 * Read a configuration file from disk (via Tauri) or from a fetch endpoint.
 *
 * Resolution order:
 * 1. Tauri `invoke('read_config', { path })` — production Tauri mode
 * 2. `fetch(path)` — development browser mode (dev server serves local files)
 * 3. Returns null + errors if both fail
 */
export async function readConfigFile<T = Record<string, unknown>>(
  path: string,
): Promise<ReadResult<T>> {
  // Attempt Tauri invoke first
  try {
    const content: string = await invoke("read_config", { path });
    if (typeof content !== "string" || content.length === 0) {
      return { data: null, errors: [], source: "error" };
    }

    const parsed = parseJsoncSafe<T>(content);
    return {
      data: parsed.data,
      errors: parsed.errors,
      source: parsed.data !== null ? "tauri" : "error",
    };
  } catch {
    // Tauri unavailable — fall through to fetch
  }

  // Fallback: fetch from dev server (relative path)
  try {
    const response = await fetch(path);
    if (!response.ok) {
      return { data: null, errors: [], source: "error" };
    }

    const content = await response.text();
    const parsed = parseJsoncSafe<T>(content);

    return {
      data: parsed.data,
      errors: parsed.errors,
      source: parsed.data !== null ? "fetch" : "error",
    };
  } catch {
    return {
      data: null,
      errors: [
        {
          message:
            "Cannot read config file (Tauri unavailable and fetch failed)",
          offset: 0,
          length: 0,
        },
      ],
      source: "error",
    };
  }
}

/**
 * Read and parse the opencode.jsonc configuration file.
 */
export async function readOpenCodeConfig(
  path: string,
): Promise<ReadResult<Record<string, unknown>>> {
  return readConfigFile<Record<string, unknown>>(path);
}

/**
 * Read and parse the matrixx.jsonc configuration file.
 */
export async function readMatrixxConfig(
  path: string,
): Promise<ReadResult<Record<string, unknown>>> {
  return readConfigFile<Record<string, unknown>>(path);
}
