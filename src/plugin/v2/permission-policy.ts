import { SENTINEL_DENIED_TOOLS, SENTINEL_DENY_MESSAGE } from "../../agents/sentinel"
import type { ExperimentalPolicy } from "../../config/schema/experimental"
import type { PermissionsConfig } from "../../config/schema/v2-permissions"
import type { PermissionEvaluateHandler } from "./permission-guards"

export type PermissionEffect = "allow" | "deny" | "ask"

export type PermissionRule = {
  effect: PermissionEffect
  tools?: readonly string[]
  agents?: readonly string[]
  pattern?: string
  reason?: string
}

export type PermissionTarget = {
  action: string
  agent?: string
}

export type PermissionResolution = {
  effect: PermissionEffect
  reason?: string
}

/**
 * The single source of truth for effect precedence.
 *
 * SECURITY MODEL
 * --------------
 * 1. DENY PRECEDENCE. Every matching rule is collected, then the winner is the
 *    first rule in `PERMISSION_EFFECT_PRECEDENCE` that has at least one match.
 *    Evaluation order in the rule list is therefore irrelevant to the outcome:
 *    a broad `allow` earlier in the list can never outrank a narrower `deny`
 *    later, and vice versa. This makes a deny un-bypassable by rule ordering.
 * 2. ASK CANNOT ESCALATE TO ALLOW. `ask` only ever resolves down the list
 *    toward `allow`; nothing resolves toward `allow` when any `ask` matched.
 *    A user `allow` therefore cannot silently auto-approve an action a policy
 *    marked as requiring human confirmation.
 * 3. UNMATCHED ACTION. When no rule matches, `resolvePermissionEffect` returns
 *    `null` and the handler leaves the runtime's own `Permission.Effect`
 *    untouched. Matrixx never widens access on its own: absence of a rule is
 *    not permission, it is deference to whatever the host runtime decided.
 * 4. SCOPE. A rule with no `tools`/`agents`/`pattern` selector matches every
 *    action. A rule WITH any selector matches only if ALL present selectors
 *    match (AND). An `agents`-scoped rule never matches an evaluation that
 *    carries no agent, so a deny scoped to `sentinel` cannot leak onto an
 *    unattributed tool call.
 */
export const PERMISSION_EFFECT_PRECEDENCE: readonly PermissionEffect[] = [
  "deny",
  "ask",
  "allow",
]

const GENERIC_DENY_MESSAGE = "Denied by a matrixx permission policy"
const GENERIC_ASK_MESSAGE = "matrixx permission policy requires confirmation"

function matchesGlob(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
  const source = `^${escaped.split("*").join(".*")}$`
  return new RegExp(source, "i").test(value)
}

export function matchesPermissionRule(
  rule: PermissionRule,
  target: PermissionTarget
): boolean {
  if (rule.tools && rule.tools.length > 0) {
    const action = target.action.toLowerCase()
    const hit = rule.tools.some((tool) => tool.toLowerCase() === action)
    if (!hit) return false
  }

  if (rule.agents && rule.agents.length > 0) {
    if (!target.agent) return false
    const agent = target.agent.toLowerCase()
    const hit = rule.agents.some((candidate) => candidate.toLowerCase() === agent)
    if (!hit) return false
  }

  if (rule.pattern !== undefined && !matchesGlob(rule.pattern, target.action)) {
    return false
  }

  return true
}

export function resolvePermissionEffect(
  rules: readonly PermissionRule[],
  target: PermissionTarget
): PermissionResolution | null {
  const matched = rules.filter((rule) => matchesPermissionRule(rule, target))

  for (const effect of PERMISSION_EFFECT_PRECEDENCE) {
    const winner = matched.find((rule) => rule.effect === effect)
    if (winner) return { effect, reason: winner.reason }
  }

  return null
}

/**
 * Compiles `experimental.policies` into rules verbatim, then the per-agent
 * `permissions` allow/deny/ask lists. Order between the two groups is
 * irrelevant to the outcome because resolution is deny-precedence.
 */
export function compilePermissionRules(args: {
  policies?: readonly ExperimentalPolicy[]
  agentPermissions?: Readonly<Record<string, PermissionsConfig | undefined>>
  agentRules?: readonly PermissionRule[]
}): PermissionRule[] {
  const fromPolicies: PermissionRule[] = (args.policies ?? []).map((policy) => ({
    effect: policy.effect,
    tools: policy.tools,
    agents: policy.agents,
    pattern: policy.pattern,
    reason: policy.reason,
  }))

  const fromAgents: PermissionRule[] = []
  for (const [agent, permissions] of Object.entries(args.agentPermissions ?? {})) {
    if (!permissions) continue
    fromAgents.push(
      ...toEffectRules("deny", permissions.deny, agent),
      ...toEffectRules("ask", permissions.ask, agent),
      ...toEffectRules("allow", permissions.allow, agent)
    )
  }

  return [...(args.agentRules ?? []), ...fromPolicies, ...fromAgents]
}

function toEffectRules(
  effect: PermissionEffect,
  tools: readonly string[] | undefined,
  agent: string
): PermissionRule[] {
  if (!tools || tools.length === 0) return []
  return [{ effect, tools, agents: [agent] }]
}

/**
 * Sentinel's read-only restriction as a native V2 deny policy. The same tool
 * list that the V1 agent config denies (`createAgentToolRestrictions`) is
 * denied here at evaluation time, where the V2 runtime reads it.
 */
export function createSentinelPolicyRules(): PermissionRule[] {
  return [
    {
      effect: "deny",
      tools: SENTINEL_DENIED_TOOLS,
      agents: ["sentinel"],
      reason: SENTINEL_DENY_MESSAGE,
    },
  ]
}

function defaultMessage(effect: PermissionEffect, reason?: string): string {
  if (reason) return reason
  return effect === "ask" ? GENERIC_ASK_MESSAGE : GENERIC_DENY_MESSAGE
}

/** Agents with no `permissions` block are dropped so they contribute no rule. */
export function collectAgentPermissions(
  agents: Readonly<Record<string, { permissions?: PermissionsConfig } | undefined>> | undefined
): Record<string, PermissionsConfig | undefined> {
  const collected: Record<string, PermissionsConfig | undefined> = {}
  for (const [agent, override] of Object.entries(agents ?? {})) {
    if (override?.permissions) collected[agent] = override.permissions
  }
  return collected
}

export function createPermissionEvaluateHandler(args: {
  policies?: readonly ExperimentalPolicy[]
  agentPermissions?: Readonly<Record<string, PermissionsConfig | undefined>>
  agentRules?: readonly PermissionRule[]
}): PermissionEvaluateHandler {
  const rules = compilePermissionRules(args)

  return (evaluation) => {
    if (rules.length === 0) return
    const resolution = resolvePermissionEffect(rules, {
      action: evaluation.action,
      agent: evaluation.agent,
    })
    if (!resolution) return
    evaluation.effect = resolution.effect
    evaluation.message = defaultMessage(resolution.effect, resolution.reason)
  }
}
