import { isTaskSystemEnabled } from "../../shared/task-system-gating";
import { BLOCKED_TOOLS, REPLACEMENT_MESSAGE } from "./constants";

export interface TasksTodowriteDisablerConfig {
  experimental?: {
    task_system?: boolean;
  };
}

export function createTasksTodowriteDisablerHook(
  config: TasksTodowriteDisablerConfig,
) {
  const enabled = isTaskSystemEnabled(config as never);

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      _output: { args: Record<string, unknown> },
    ) => {
      if (!enabled) {
        return;
      }

      const toolName = input.tool as string;
      if (
        BLOCKED_TOOLS.some(
          (blocked) => blocked.toLowerCase() === toolName.toLowerCase(),
        )
      ) {
        throw new Error(REPLACEMENT_MESSAGE);
      }
    },
  };
}
