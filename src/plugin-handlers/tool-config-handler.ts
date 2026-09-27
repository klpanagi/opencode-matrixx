import type { MatrixxConfig } from "../config";
import { denyTodoTools, fullTaskPermissions, grantTaskPermissions, taskStorePermissions } from "./task-permissions";

type AgentWithPermission = { permission?: Record<string, unknown>; mode?: string };

function agentByKey(agentResult: Record<string, unknown>, key: string): AgentWithPermission | undefined {
  return agentResult[key] as AgentWithPermission | undefined;
}

export function applyToolConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: MatrixxConfig;
  agentResult: Record<string, unknown>;
}): void {
  params.config.tools = {
    ...(params.config.tools as Record<string, unknown>),
    github_search: false,
    LspHover: false,
    LspCodeActions: false,
    LspCodeActionResolve: false,
    "task_*": false,
    teammate: false,
    todowrite: false,
    todoread: false,
  };

  const isCliRunMode = process.env.OPENCODE_CLI_RUN_MODE === "true";
  const questionPermission = isCliRunMode ? "deny" : "allow";

  const operator = agentByKey(params.agentResult, "operator");
  if (operator) {
    operator.permission = { ...operator.permission, github_search: "allow" };
  }
  const trinity = agentByKey(params.agentResult, "trinity");
  if (trinity) {
    trinity.permission = { ...trinity.permission, github_search: "allow" };
  }
  const construct = agentByKey(params.agentResult, "construct");
  if (construct) {
    construct.permission = { ...construct.permission, task: "deny", look_at: "deny" };
  }
  const architect = agentByKey(params.agentResult, "architect");
  if (architect) {
    // Fill-only: factory owns outgoing-task allow (see architect/agent.ts #111
    // option b). Fill gaps per key with ?? so a factory value or explicit user
    // override is never overwritten here.
    const defaults = { ...fullTaskPermissions }
    const permission = (architect.permission ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(defaults)) {
      permission[key] ??= value;
    }
    architect.permission = permission;
  }
  const morpheus = agentByKey(params.agentResult, "morpheus");
  if (morpheus) {
    morpheus.permission = {
      ...morpheus.permission,
      question: questionPermission,
      ...fullTaskPermissions,
    };
  }
  const keymaker = agentByKey(params.agentResult, "keymaker");
  if (keymaker) {
    // Fill-only, so a user who narrowed the task store keeps their own choice.
    const defaults = { question: questionPermission, task: "allow", ...taskStorePermissions };
    const permission = (keymaker.permission ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(defaults)) {
      permission[key] ??= value;
    }
    keymaker.permission = permission;
  }
  const oracle = agentByKey(params.agentResult, "oracle");
  if (oracle) {
    oracle.permission = {
      ...oracle.permission,
      question: questionPermission,
      ...fullTaskPermissions,
    };
  }
  const mouse = agentByKey(params.agentResult, "mouse");
  if (mouse) {
    // Mouse carve-out (R7): Mouse is mode "subagent", so the derived grant
    // below skips it — yet it executes delegated multi-step work in its own
    // child session and must own the resulting task-store records.
    mouse.permission = {
      ...mouse.permission,
      ...fullTaskPermissions,
    };
  }

  // Mode-derived grant: every agent that can run as a top-level session
  // (mode "primary" or "all") gets task-store access. Read-only auditors that
  // already deny `task` for themselves keep that denial — see task-permissions.
  for (const key of Object.keys(params.agentResult)) {
    const agent = agentByKey(params.agentResult, key);
    if (agent) grantTaskPermissions(agent);
  }

  params.config.permission = {
    ...(params.config.permission as Record<string, unknown>),
    webfetch: "allow",
    external_directory: "allow",
    task: "deny",
    ...denyTodoTools,
  };
}
