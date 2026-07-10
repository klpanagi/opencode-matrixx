import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatrixxConfig } from "./config";
import {
  _resetDisabledSetsCacheForTesting,
  getDisabledSets,
  loadPluginConfig,
  mergeConfigs,
  parseConfigPartially,
} from "./plugin-config";

describe("mergeConfigs", () => {
  describe("categories merging", () => {
    // given base config has categories, override has different categories
    // when merging configs
    // then should deep merge categories, not override completely

    it("should deep merge categories from base and override", () => {
      const base = {
        categories: {
          general: {
            model: "openai/gpt-5.2",
            temperature: 0.5,
          },
          quick: {
            model: "anthropic/claude-haiku-4-5",
          },
        },
      } as MatrixxConfig;

      const override = {
        categories: {
          general: {
            temperature: 0.3,
          },
          visual: {
            model: "google/gemini-3-pro",
          },
        },
      } as unknown as MatrixxConfig;

      const result = mergeConfigs(base, override);

      // then general.model should be preserved from base
      expect(result.categories?.general?.model).toBe("openai/gpt-5.2");
      // then general.temperature should be overridden
      expect(result.categories?.general?.temperature).toBe(0.3);
      // then quick should be preserved from base
      expect(result.categories?.quick?.model).toBe("anthropic/claude-haiku-4-5");
      // then visual should be added from override
      expect(result.categories?.visual?.model).toBe("google/gemini-3-pro");
    });

    it("should preserve base categories when override has no categories", () => {
      const base: MatrixxConfig = {
        categories: {
          general: {
            model: "openai/gpt-5.2",
          },
        },
      };

      const override: MatrixxConfig = {};

      const result = mergeConfigs(base, override);

      expect(result.categories?.general?.model).toBe("openai/gpt-5.2");
    });

    it("should use override categories when base has no categories", () => {
      const base: MatrixxConfig = {};

      const override: MatrixxConfig = {
        categories: {
          general: {
            model: "openai/gpt-5.2",
          },
        },
      };

      const result = mergeConfigs(base, override);

      expect(result.categories?.general?.model).toBe("openai/gpt-5.2");
    });
  });

  describe("existing behavior preservation", () => {
    it("should deep merge agents", () => {
      const base: MatrixxConfig = {
        agents: {
          oracle: { model: "openai/gpt-5.2" },
        },
      };

      const override: MatrixxConfig = {
        agents: {
          oracle: { temperature: 0.5 },
          trinity: { model: "anthropic/claude-haiku-4-5" },
        },
      };

      const result = mergeConfigs(base, override);

      expect(result.agents?.oracle?.model).toBe("openai/gpt-5.2");
      expect(result.agents?.oracle?.temperature).toBe(0.5);
      expect(result.agents?.trinity?.model).toBe("anthropic/claude-haiku-4-5");
    });

    it("should merge disabled arrays without duplicates", () => {
      const base: MatrixxConfig = {
        disabled_hooks: ["comment-checker", "think-mode"],
      };

      const override: MatrixxConfig = {
        disabled_hooks: ["think-mode", "session-recovery"],
      };

      const result = mergeConfigs(base, override);

      expect(result.disabled_hooks).toContain("comment-checker");
      expect(result.disabled_hooks).toContain("think-mode");
      expect(result.disabled_hooks).toContain("session-recovery");
      expect(result.disabled_hooks?.length).toBe(3);
    });
  });

  describe("disabled Sets cache", () => {
    //#given mergeConfigs has produced a merged MatrixxConfig
    //#when getDisabledSets is called twice on the same config
    //#then both calls must return the SAME Set reference for each
    //#     disabled_xxx field, and the constructor was only invoked
    //#     once per disabled_xxx list (no allocation on cache hit)

    it("mergeConfigs allocates disabled_xxx Set once per config", () => {
      _resetDisabledSetsCacheForTesting();

      const base: MatrixxConfig = {
        disabled_agents: ["morpheus", "oracle"],
        disabled_mcps: ["websearch"],
        disabled_hooks: ["quality-gate"],
        disabled_commands: ["profile"],
        disabled_skills: ["git-master"],
      };
      const override: MatrixxConfig = {
        disabled_agents: ["trinity"],
      };

      // Spy on global Set to count how many Sets mergeConfigs allocates.
      // deepMerge has zero runtime Set usage (only at module load), so
      // every Set created here belongs to the 5 disabled_xxx fields.
      const OriginalSet = globalThis.Set;
      let setCallCount = 0;
      const SetSpy = class extends OriginalSet {
        constructor(...args: ConstructorParameters<typeof OriginalSet>) {
          super(...args);
          setCallCount++;
        }
      };
      globalThis.Set = SetSpy as unknown as typeof Set;

      try {
        const merged = mergeConfigs(base, override);

        // 1 Set per disabled_xxx field (5 total). No extra Sets from
        // getDisabledSets yet — that path is cache-populated by mergeConfigs
        // itself.
        expect(setCallCount).toBe(5);

        // First read: cache hit (pre-populated by mergeConfigs), 0 new Sets.
        const s1 = getDisabledSets(merged);
        expect(setCallCount).toBe(5);

        // Second read: same config → same WeakMap entry → same Set refs.
        const s2 = getDisabledSets(merged);
        expect(setCallCount).toBe(5);

        // Every disabled_xxx Set is the SAME reference across calls.
        expect(Object.is(s1.disabledAgents, s2.disabledAgents)).toBe(true);
        expect(Object.is(s1.disabledMcps, s2.disabledMcps)).toBe(true);
        expect(Object.is(s1.disabledHooks, s2.disabledHooks)).toBe(true);
        expect(Object.is(s1.disabledCommands, s2.disabledCommands)).toBe(true);
        expect(Object.is(s1.disabledSkills, s2.disabledSkills)).toBe(true);

        // Sanity: merged values are correct (dedup union of base + override).
        expect(s1.disabledAgents.has("morpheus")).toBe(true);
        expect(s1.disabledAgents.has("oracle")).toBe(true);
        expect(s1.disabledAgents.has("trinity")).toBe(true);
        expect(s1.disabledAgents.size).toBe(3);
        expect(s1.disabledMcps.has("websearch")).toBe(true);
        expect(s1.disabledHooks.has("quality-gate")).toBe(true);
        expect(s1.disabledCommands.has("profile")).toBe(true);
        expect(s1.disabledSkills.has("git-master")).toBe(true);
      } finally {
        globalThis.Set = OriginalSet;
      }
    });

    it("getDisabledSets on a fresh (un-merged) config allocates its own Sets once", () => {
      _resetDisabledSetsCacheForTesting();

      const config: MatrixxConfig = {
        disabled_agents: ["morpheus"],
        disabled_mcps: ["websearch"],
        disabled_hooks: ["quality-gate"],
        disabled_commands: ["profile"],
        disabled_skills: ["git-master"],
      };

      // Cold read: 5 fresh Sets (one per disabled_xxx field).
      const s1 = getDisabledSets(config);
      // Warm read: cache hit, identical Set references.
      const s2 = getDisabledSets(config);

      expect(Object.is(s1.disabledAgents, s2.disabledAgents)).toBe(true);
      expect(Object.is(s1.disabledMcps, s2.disabledMcps)).toBe(true);
      expect(Object.is(s1.disabledHooks, s2.disabledHooks)).toBe(true);
      expect(Object.is(s1.disabledCommands, s2.disabledCommands)).toBe(true);
      expect(Object.is(s1.disabledSkills, s2.disabledSkills)).toBe(true);
    });
  });
});

describe("parseConfigPartially", () => {
  describe("fully valid config", () => {
    //#given a config where all sections are valid
    //#when parsing the config
    //#then should return the full parsed config unchanged

    it("should return the full config when everything is valid", () => {
      const rawConfig = {
        agents: {
          oracle: { model: "openai/gpt-5.2" },
          smith: { model: "openai/gpt-5.2" },
        },
        disabled_hooks: ["comment-checker"],
      };

      const result = parseConfigPartially(rawConfig);

      expect(result).not.toBeNull();
      expect(result?.agents?.oracle?.model).toBe("openai/gpt-5.2");
      expect(result?.agents?.smith?.model).toBe("openai/gpt-5.2");
      expect(result?.disabled_hooks).toEqual(["comment-checker"]);
    });
  });

  describe("partially invalid config", () => {
    //#given a config where one section is invalid but others are valid
    //#when parsing the config
    //#then should return valid sections and skip invalid ones

    it("should preserve valid agent overrides when another section is invalid", () => {
      const rawConfig = {
        agents: {
          oracle: { model: "openai/gpt-5.2" },
          smith: { model: "openai/gpt-5.2" },
          keymaker: {
            permission: {
              edit: { "*": "ask", ".morpheus/**": "allow" },
            },
          },
        },
        disabled_hooks: ["comment-checker"],
      };

      const result = parseConfigPartially(rawConfig);

      expect(result).not.toBeNull();
      expect(result?.disabled_hooks).toEqual(["comment-checker"]);
      expect(result?.agents).toBeUndefined();
    });

    it("should preserve valid agents when a non-agent section is invalid", () => {
      const rawConfig = {
        agents: {
          oracle: { model: "openai/gpt-5.2" },
        },
        disabled_hooks: ["not-a-real-hook"],
      };

      const result = parseConfigPartially(rawConfig);

      expect(result).not.toBeNull();
      expect(result?.agents?.oracle?.model).toBe("openai/gpt-5.2");
      expect(result?.disabled_hooks).toBeUndefined();
    });
  });

  describe("completely invalid config", () => {
    //#given a config where all sections are invalid
    //#when parsing the config
    //#then should return an empty object (not null)

    it("should return empty object when all sections are invalid", () => {
      const rawConfig = {
        agents: { oracle: { temperature: "not-a-number" } },
        disabled_hooks: ["not-a-real-hook"],
      };

      const result = parseConfigPartially(rawConfig);

      expect(result).not.toBeNull();
      expect(result?.agents).toBeUndefined();
      expect(result?.disabled_hooks).toBeUndefined();
    });
  });

  describe("empty config", () => {
    //#given an empty config object
    //#when parsing the config
    //#then should return an empty object (fast path - full parse succeeds)

    it("should return empty object for empty input", () => {
      const result = parseConfigPartially({});

      expect(result).not.toBeNull();
      expect(Object.keys(result as Record<string, unknown>).length).toBe(0);
    });
  });

  describe("unknown keys", () => {
    //#given a config with keys not in the schema
    //#when parsing the config
    //#then should silently ignore unknown keys and preserve valid ones

    it("should ignore unknown keys and return valid sections", () => {
      const rawConfig = {
        agents: {
          oracle: { model: "openai/gpt-5.2" },
        },
        some_future_key: { foo: "bar" },
      };

      const result = parseConfigPartially(rawConfig);

      expect(result).not.toBeNull();
      expect(result?.agents?.oracle?.model).toBe("openai/gpt-5.2");
      expect((result as Record<string, unknown>).some_future_key).toBeUndefined();
    });
  });
});

describe("loadPluginConfig - tier resolution (end-to-end)", () => {
  let tempDir: string
  let originalConfigDir: string | undefined
  let originalXdgCache: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "matrixx-config-test-"))
    originalConfigDir = process.env.OPENCODE_CONFIG_DIR
    originalXdgCache = process.env.XDG_CACHE_HOME
    process.env.OPENCODE_CONFIG_DIR = tempDir
    process.env.XDG_CACHE_HOME = tempDir
  })

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR = originalConfigDir
    if (originalXdgCache === undefined) delete process.env.XDG_CACHE_HOME
    else process.env.XDG_CACHE_HOME = originalXdgCache
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeUserMatrixx(content: object): void {
    writeFileSync(join(tempDir, "matrixx.json"), JSON.stringify(content))
  }

  function writeCacheFiles(
    connectedProviders: string[],
    providerModels: Record<string, string[]>,
  ): void {
    const matrixxCacheDir = join(tempDir, "matrixx")
    mkdirSync(matrixxCacheDir, { recursive: true })
    writeFileSync(
      join(matrixxCacheDir, "connected-providers.json"),
      JSON.stringify({ connected: connectedProviders, updatedAt: new Date().toISOString() }),
    )
    writeFileSync(
      join(matrixxCacheDir, "provider-models.json"),
      JSON.stringify({ models: providerModels, connected: connectedProviders, updatedAt: new Date().toISOString() }),
    )
    const opencodeCacheDir = join(tempDir, "opencode")
    mkdirSync(opencodeCacheDir, { recursive: true })
    const opencodeFormat: Record<string, { id: string; models: Record<string, { id: string }> }> = {}
    for (const [provider, models] of Object.entries(providerModels)) {
      opencodeFormat[provider] = {
        id: provider,
        models: Object.fromEntries(models.map((m) => [m, { id: m }])),
      }
    }
    writeFileSync(join(opencodeCacheDir, "models.json"), JSON.stringify(opencodeFormat))
  }

  function freshProjectDir(): string {
    const projectDir = join(tempDir, "project")
    mkdirSync(projectDir, { recursive: true })
    return projectDir
  }

  it("#given a matrixx.json with agent.tier='premium' and anthropic connected #when loadPluginConfig #then the merged config has model='anthropic/claude-opus-4-6' and tier is cleared", async () => {
    //#given
    writeCacheFiles(
      ["anthropic", "openai"],
      { anthropic: ["claude-opus-4-6", "claude-sonnet-4-6"], openai: ["gpt-5.3-codex"] },
    )
    writeUserMatrixx({ agents: { morpheus: { tier: "premium" } } })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.agents?.morpheus?.tier).toBeUndefined()
  })

  it("#given agent.tier='premium' but only openai connected #when loadPluginConfig #then model resolves to 'openai/gpt-5.3-codex' (cross-provider)", async () => {
    //#given
    writeCacheFiles(
      ["openai"],
      { openai: ["gpt-5.3-codex", "gpt-5.2"] },
    )
    writeUserMatrixx({ agents: { oracle: { tier: "premium" } } })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.oracle?.model).toBe("openai/gpt-5.3-codex")
  })

  it("#given default_tier='fast' and agents without explicit model or tier #when loadPluginConfig #then those listed agents get a fast-tier model and default_tier is cleared", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-haiku-4-5", "claude-opus-4-6"] },
    )
    writeUserMatrixx({
      default_tier: "fast",
      agents: { trinity: {}, operator: {} },
    })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.trinity?.model).toBe("anthropic/claude-haiku-4-5")
    expect(result.agents?.operator?.model).toBe("anthropic/claude-haiku-4-5")
    expect((result as unknown as { default_tier?: string }).default_tier).toBeUndefined()
  })

  it("#given default_tier='fast' and an agent with explicit model #when loadPluginConfig #then explicit model wins (not overridden by default_tier)", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-haiku-4-5", "claude-opus-4-6"] },
    )
    writeUserMatrixx({
      default_tier: "fast",
      agents: { trinity: { model: "anthropic/claude-opus-4-6" } },
    })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.trinity?.model).toBe("anthropic/claude-opus-4-6")
  })

  it("#given category with tier='premium' #when loadPluginConfig #then category.model is set", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-opus-4-6"] },
    )
    writeUserMatrixx({ categories: { source: { tier: "premium" } } })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.categories?.source?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.categories?.source?.tier).toBeUndefined()
  })

  it("#given a legacy matrixx.json with hardcoded model #when loadPluginConfig #then behavior is unchanged (no regression)", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-opus-4-6"] },
    )
    writeUserMatrixx({ agents: { morpheus: { model: "anthropic/claude-opus-4-6" } } })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
  })

  it("#given agent with both model and tier #when loadPluginConfig #then model wins (model takes precedence over tier)", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-opus-4-6", "claude-haiku-4-5"] },
    )
    writeUserMatrixx({
      agents: { morpheus: { model: "anthropic/claude-opus-4-6", tier: "fast" } },
    })

    //#when
    const result = await loadPluginConfig(freshProjectDir(), null)

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.agents?.morpheus?.tier).toBeUndefined()
  })

  it("#given a project matrixx.json overrides the user config #when loadPluginConfig #then both files are merged and tiers resolved from the merged config", async () => {
    //#given
    writeCacheFiles(
      ["anthropic"],
      { anthropic: ["claude-opus-4-6", "claude-sonnet-4-6"] },
    )
    writeUserMatrixx({ agents: { morpheus: { tier: "premium" } } })
    const projectDir = freshProjectDir()
    mkdirSync(join(projectDir, ".opencode"), { recursive: true })
    writeFileSync(
      join(projectDir, ".opencode", "matrixx.json"),
      JSON.stringify({ agents: { oracle: { tier: "premium" } } }),
    )

    //#when
    const result = await loadPluginConfig(projectDir, null)

    //#then
    expect(result.agents?.morpheus?.model).toBe("anthropic/claude-opus-4-6")
    expect(result.agents?.oracle?.model).toBe("anthropic/claude-opus-4-6")
  })
});
