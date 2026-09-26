/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { MatrixxConfig } from "../../../src/config"
import { applyCommandConfig } from "../../../src/plugin-handlers/command-config-handler"
import { applyMcpConfig } from "../../../src/plugin-handlers/mcp-config-handler"
import type {
  V2CommandDefinition,
  V2ComponentRegistrar,
} from "../../../src/plugin/v2/component-types"
import { registerV2Components } from "../../../src/plugin/v2/register-components"

type DomainName = "agent" | "skill" | "command" | "mcp";

type FakeCtx = V2ComponentRegistrar & {
  transformCalls: DomainName[];
  reloadCalls: DomainName[];
  disposeOrder: DomainName[];
  addedSkills: { id: string; name: string; content: string }[];
  addedCommands: string[];
  addedCommandDefs: V2CommandDefinition[];
  setMcp: Map<string, Record<string, unknown>>;
  updatedAgents: string[];
  defaultAgent?: string;
  prompted: { sessionID: string; text: string }[];
};

function createFakeCtx(existingAgentIds: string[] = []): FakeCtx {
  const transformCalls: DomainName[] = [];
  const reloadCalls: DomainName[] = [];
  const disposeOrder: DomainName[] = [];
  const addedSkills: { id: string; name: string; content: string }[] = [];
  const addedCommands: string[] = [];
  const addedCommandDefs: V2CommandDefinition[] = [];
  const setMcp = new Map<string, Record<string, unknown>>();
  const updatedAgents: string[] = [];
  const prompted: { sessionID: string; text: string }[] = [];
  let defaultAgent: string | undefined;

  const domain = (name: DomainName) => ({
    transform: async (callback: (editor: unknown) => void) => {
      transformCalls.push(name);
      const registration = {
        dispose: async () => {
          disposeOrder.push(name);
        },
      };
      if (name === "agent") {
        callback({
          get: (id: string) =>
            existingAgentIds.includes(id) ? { id, name: id } : undefined,
          update: (id: string) => updatedAgents.push(id),
          default: (id: string | undefined) => {
            defaultAgent = id;
          },
        });
      } else if (name === "skill") {
        callback({
          get: () => undefined,
          add: (skill: { id: string; name: string; content: string }) => addedSkills.push(skill),
        });
      } else if (name === "command") {
        callback({
          add: (def: V2CommandDefinition) => {
            addedCommands.push(def.name);
            addedCommandDefs.push(def);
          },
        });
      } else {
        callback({
          set: (name2: string, config: Record<string, unknown>) => setMcp.set(name2, config),
        });
      }
      return registration;
    },
    reload: async () => {
      reloadCalls.push(name);
    },
  });

  return {
    agent: domain("agent"),
    skill: domain("skill"),
    command: domain("command"),
    mcp: domain("mcp"),
    session: {
      prompt: async (input: { sessionID: string; text: string }) => {
        prompted.push({ sessionID: input.sessionID, text: input.text });
        return undefined as never;
      },
    },
    transformCalls,
    reloadCalls,
    disposeOrder,
    addedSkills,
    addedCommands,
    addedCommandDefs,
    setMcp,
    updatedAgents,
    get defaultAgent() {
      return defaultAgent;
    },
    prompted,
  } as FakeCtx;
}

function createDeps(overrides: Partial<MatrixxConfig> = {}) {
  return {
    directory: "/tmp/matrixx-v2-registrar",
    availableToolNames: [] as string[],
    pluginConfig: {
      disabled_agents: [],
      disabled_skills: [],
      disabled_commands: [],
      disabled_mcps: ["websearch", "document_reader"],
      ...overrides,
    } as MatrixxConfig,
  };
}

describe("registerV2Components", () => {
  test("registers every component domain through its V2 transform", async () => {
    //#given
    const ctx = createFakeCtx(["morpheus", "oracle", "build", "plan"])
    const deps = createDeps()

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.transformCalls).toEqual(["agent", "skill", "command", "mcp"])
  });

  test("reloads each domain after its transform runs", async () => {
    //#given
    const ctx = createFakeCtx(["morpheus"])
    const deps = createDeps()

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.reloadCalls).toEqual(["agent", "skill", "command", "mcp"])
  });

  test("disposes every collected registration in LIFO order on cleanup", async () => {
    //#given
    const ctx = createFakeCtx(["morpheus"])
    const deps = createDeps()
    const cleanup = await registerV2Components(ctx, deps)

    //#when
    await cleanup()

    //#then
    expect(ctx.disposeOrder).toEqual(["mcp", "command", "skill", "agent"])
  });

  test("registers skills, commands and MCPs from the shared neutral registries", async () => {
    //#given
    const ctx = createFakeCtx()
    const deps = createDeps({ disabled_commands: ["research"] })

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.addedSkills.length).toBeGreaterThan(10)
    expect(ctx.addedCommands).toContain("init-deep")
    expect(ctx.addedCommands).not.toContain("research")
    expect([...ctx.setMcp.keys()]).toEqual(["context7"])
  })

  test("inverts the V1 `enabled` flag into the V2 `disabled` flag", async () => {
    //#given
    const ctx = createFakeCtx()
    const deps = createDeps()

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.setMcp.get("context7")).toEqual({
      type: "remote",
      url: "https://mcp.context7.com/mcp",
      disabled: false,
      oauth: false,
    })
  })

  test("registers servers declared under `mcp.servers` on the V2 runtime", async () => {
    //#given
    const ctx = createFakeCtx()
    const deps = createDeps({
      mcp: { servers: { internal: { type: "remote", url: "https://internal.test/mcp" } } },
    })

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.setMcp.get("internal")).toEqual({
      type: "remote",
      url: "https://internal.test/mcp",
    })
  })

  test("wires snake_case OAuth credentials from `mcp.servers` through to the V2 editor", async () => {
    //#given
    const ctx = createFakeCtx()
    const deps = createDeps({
      mcp: {
        servers: {
          internal: {
            type: "remote",
            url: "https://internal.test/mcp",
            oauth: { client_id: "cid", callback_port: 8976 },
          },
        },
      },
    })

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect((ctx.setMcp.get("internal") as { oauth: unknown }).oauth).toEqual({
      client_id: "cid",
      callback_port: 8976,
    })
  })

  test("only updates agents that already exist and sets the default agent", async () => {
    //#given
    const ctx = createFakeCtx(["morpheus", "mouse"])
    const deps = createDeps({ morpheus_agent: { disabled: false } })

    //#when
    await registerV2Components(ctx, deps)

    //#then
    expect(ctx.updatedAgents).toContain("morpheus")
    expect(ctx.updatedAgents).toContain("mouse")
    expect(ctx.defaultAgent).toBe("morpheus")
  })

  test("delivers the rendered command template through session.prompt", async () => {
    //#given
    const ctx = createFakeCtx()
    const deps = createDeps({ disabled_commands: ["cleanup-tasks"] })
    await registerV2Components(ctx, deps)
    const startWork = ctx.addedCommandDefs.find((def) => def.name === "start-work")

    //#when
    await startWork?.execute({
      sessionID: "ses_test",
      prompt: { text: "ship the release" },
      delivery: "steer",
    })

    //#then
    expect(ctx.prompted).toHaveLength(1)
    expect(ctx.prompted[0].sessionID).toBe("ses_test")
    expect(ctx.prompted[0].text).toContain("ship the release")
    expect(ctx.prompted[0].text).not.toContain("$ARGUMENTS")
  })
})

describe("V1 / V2 component equivalence", () => {
  test("V1 config command keys match the commands registered on V2", async () => {
    //#given
    const deps = createDeps()
    const v1Config: Record<string, unknown> = { command: {} }
    await applyCommandConfig({
      config: v1Config,
      pluginConfig: deps.pluginConfig,
      ctx: { directory: deps.directory },
      pluginComponents: {
        commands: {},
        skills: {},
        agents: {},
        mcpServers: {},
        hooksConfigs: [],
        plugins: [],
        errors: [],
      },
    })
    const ctx = createFakeCtx()

    //#when
    await registerV2Components(ctx, deps)

    //#then
    const v1Names = Object.keys(v1Config.command as Record<string, unknown>).sort()
    expect([...ctx.addedCommands].sort()).toEqual(v1Names)
  })

  test("V1 config mcp keys match the MCP servers registered on V2", async () => {
    //#given
    const deps = createDeps()
    const v1Config: Record<string, unknown> = { mcp: {} }
    await applyMcpConfig({
      config: v1Config,
      pluginConfig: deps.pluginConfig,
      pluginComponents: {
        commands: {},
        skills: {},
        agents: {},
        mcpServers: {},
        hooksConfigs: [],
        plugins: [],
        errors: [],
      },
    })
    const ctx = createFakeCtx()

    //#when
    await registerV2Components(ctx, deps)

    //#then
    const v1Names = Object.keys(v1Config.mcp as Record<string, unknown>).sort()
    expect([...ctx.setMcp.keys()].sort()).toEqual(v1Names)
  })
})
