export const FALLBACK_TASK_DESCRIPTION = "Background task";
const MAX_DESCRIPTION_LENGTH = 80;

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") return "";
  return trimmed;
}

export function resolveTaskDescription(input: {
  description?: unknown;
  prompt?: unknown;
  category?: unknown;
  subagent_type?: unknown;
  agent?: unknown;
}): string {
  const direct = clean(input.description);
  if (direct !== "") return direct.slice(0, MAX_DESCRIPTION_LENGTH);
  const fromPrompt = clean(input.prompt);
  if (fromPrompt !== "") {
    const words = fromPrompt.split(/\s+/).slice(0, 5).join(" ");
    if (words !== "") return words.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  for (const candidate of [input.category, input.subagent_type, input.agent]) {
    const c = clean(candidate);
    if (c !== "") return `Background ${c.slice(0, 60)} task`.slice(0, MAX_DESCRIPTION_LENGTH);
  }
  return FALLBACK_TASK_DESCRIPTION;
}

export function buildTaskTitle(description: unknown, agent: unknown): string {
  const desc = clean(description) !== "" ? clean(description) : FALLBACK_TASK_DESCRIPTION;
  const ag = clean(agent);
  if (ag !== "") return `${desc} (@${ag} subagent)`;
  return desc;
}

export function buildContinuationTitle(description: unknown): string {
  const desc = clean(description) !== "" ? clean(description) : FALLBACK_TASK_DESCRIPTION;
  return `Continue: ${desc}`;
}
