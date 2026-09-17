import type { MatrixxConfig } from "../config";
import { isTaskSystemEnabled } from "../shared/task-system-gating";

type AgentWithPermission = { permission?: Record<string, unknown> };

function agentByKey(agentResult: Record<string, unknown>, key: string): AgentWithPermission | undefined {
  return agentResult[key] as AgentWithPermission | undefined;
}

export function applyToolConfig(params: {
  config: Record<string, unknown>;
  pluginConfig: MatrixxConfig;
  agentResult: Record<string, unknown>;
}): void {
  const isTaskSystem = isTaskSystemEnabled(params.pluginConfig)
  const denyTodoTools = isTaskSystem
    ? { todowrite: "deny", todoread: "deny" }
    : {}
  const denyTaskTools = !isTaskSystem
    ? { "task_*": "deny" as const, task: "deny" as const }
    : {}

  params.config.tools = {
    ...(params.config.tools as Record<string, unknown>),
    github_search: false,
    LspHover: false,
    LspCodeActions: false,
    LspCodeActionResolve: false,
    "task_*": false,
    teammate: false,
    ...(isTaskSystem
      ? { todowrite: false, todoread: false }
      : { "task_*": false, task: false }),
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
    const defaults = isTaskSystem
      ? { task: "allow", "task_*": "allow", teammate: "allow", ...denyTodoTools }
      : { todowrite: "allow", todoread: "allow", ...denyTaskTools };
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
      ...(isTaskSystem
        ? { task: "allow", "task_*": "allow", teammate: "allow", ...denyTodoTools }
        : { todowrite: "allow", todoread: "allow", ...denyTaskTools }),
    };
  }
  const keymaker = agentByKey(params.agentResult, "keymaker");
  if (keymaker) {
    keymaker.permission = {
      ...keymaker.permission,
      question: questionPermission,
      ...(isTaskSystem ? { task: "allow", ...denyTodoTools } : { todowrite: "allow", todoread: "allow", ...denyTaskTools }),
    };
  }
  const oracle = agentByKey(params.agentResult, "oracle");
  if (oracle) {
    oracle.permission = {
      ...oracle.permission,
      question: questionPermission,
      ...(isTaskSystem
        ? { task: "allow", "task_*": "allow", teammate: "allow", ...denyTodoTools }
        : { todowrite: "allow", todoread: "allow", ...denyTaskTools }),
    };
  }
  const mouse = agentByKey(params.agentResult, "mouse");
  if (mouse) {
    mouse.permission = {
      ...mouse.permission,
      ...(isTaskSystem
        ? { task: "allow", "task_*": "allow", teammate: "allow", ...denyTodoTools }
        : { todowrite: "allow", todoread: "allow", ...denyTaskTools }),
    };
  }

  params.config.permission = {
    ...(params.config.permission as Record<string, unknown>),
    webfetch: "allow",
    external_directory: "allow",
    task: "deny",
  };
}
