import {
  writable,
  derived,
  get,
  type Writable,
  type Readable,
} from "svelte/store";
import type { MatrixxConfig } from "$lib/types";
import { expandPreset, type PresetName } from "$lib/presets/presets";

const DEFAULT_CONFIG: MatrixxConfig = {
  experimental: {
    task_system: true,
  },
};

function createDefaultConfig(): MatrixxConfig {
  return structuredClone(DEFAULT_CONFIG);
}

function createConfigStore() {
  const _config: Writable<MatrixxConfig> = writable(createDefaultConfig());
  const _original: Writable<string> = writable("");
  const _loading: Writable<boolean> = writable(false);
  const _saving: Writable<boolean> = writable(false);
  const _error: Writable<string | null> = writable(null);

  const dirty: Readable<boolean> = derived(
    [_config, _original],
    ([$config, $original]) => {
      if (!$original) return false;
      try {
        const current = JSON.stringify($config, null, 2);
        return current !== $original;
      } catch {
        return false;
      }
    },
  );

  const jsonPreview: Readable<string> = derived(_config, ($config) => {
    try {
      return JSON.stringify($config, null, 2);
    } catch {
      return "{}";
    }
  });

  function getSnapshot(): MatrixxConfig {
    return get(_config);
  }

  async function load(): Promise<void> {
    _loading.set(true);
    _error.set(null);
    try {
      const config = createDefaultConfig();
      _config.set(config);
      _original.set(JSON.stringify(config, null, 2));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load config";
      _error.set(message);
    } finally {
      _loading.set(false);
    }
  }

  async function save(): Promise<void> {
    _saving.set(true);
    _error.set(null);
    try {
      _config.update((c) => {
        _original.set(JSON.stringify(c, null, 2));
        return c;
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save config";
      _error.set(message);
    } finally {
      _saving.set(false);
    }
  }

  function applyPreset(name: PresetName): void {
    const preset = expandPreset(name);
    const current = get(_config);
    _config.set(deepMerge(current, preset));
  }

  function reset(): void {
    _config.set(createDefaultConfig());
    _original.set("");
  }

  function updateConfig(
    updater: (config: MatrixxConfig) => MatrixxConfig,
  ): void {
    _config.update(updater);
  }

  return {
    config: _config,
    loading: _loading,
    saving: _saving,
    error: _error,
    dirty,
    jsonPreview,
    getSnapshot,
    load,
    save,
    applyPreset,
    reset,
    updateConfig,
    subscribe: _config.subscribe,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  const result = structuredClone(target);
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

export const configStore = createConfigStore();
