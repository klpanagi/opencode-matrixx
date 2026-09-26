import { log } from "../../../shared"

/**
 * A V1 client member Matrixx calls that has no V2 route behind it.
 *
 * Every entry here was established by probing a live V2 server
 * (`script/v2-docker-smoke.sh`), not inferred. `probeEvidence` records what the
 * probe actually saw so the claim stays checkable.
 */
export type V2CapabilityGap = {
  /** V1 member path, e.g. `session.todo`. Greppable by design. */
  readonly member: string
  /** Why there is nothing to map onto. */
  readonly reason: string
  /** What the probe returned for the candidate route. */
  readonly probeEvidence: string
  /** Call sites affected, for impact assessment. */
  readonly callSites: number
}

/**
 * The complete set of V1 members with no V2 counterpart, as of the probe
 * recorded in `docs/v2-smoke.md`.
 *
 * `session.todo` is absent from V2 by construction: the token `todo` does not
 * occur anywhere in `@opencode/client`'s published type surface, and
 * `GET /api/session/{id}/todo` returns 404 on a live server.
 *
 * `tui.showToast` is absent by construction: the V2 client exposes no `tui`
 * domain, `POST /api/tui/show-toast` returns 404, and the V1 path
 * `/tui/show-toast` returns the SPA at HTTP 200 — the exact failure mode that
 * refuted the previous adapter.
 */
export const V2_CAPABILITY_GAPS: readonly V2CapabilityGap[] = [
  {
    member: "session.todo",
    reason: "V2 exposes no todo route and no todo type; session instructions are a separate concept",
    probeEvidence: "GET /api/session/{id}/todo -> 404; zero `todo` occurrences in @opencode/client types",
    callSites: 16,
  },
  {
    member: "tui.showToast",
    reason: "V2 exposes no `tui` domain at all; toasts are not part of the V2 API",
    probeEvidence: "POST /api/tui/show-toast -> 404; GET /tui/show-toast -> 200 text/html (SPA catch-all)",
    callSites: 11,
  },
  {
    member: "session.revert",
    reason: "The published V2 client advertises the path but the server does not serve it; V2 has no session-revert capability in its session domain",
    probeEvidence: "POST /api/session/{id}/revert -> 404 on a live server",
    callSites: 0,
  },
] as const

const gapMembers = new Set(V2_CAPABILITY_GAPS.map((gap) => gap.member))

export function isKnownGap(member: string): boolean {
  return gapMembers.has(member)
}

/**
 * Enumerates every degraded or unavailable member. Exported so the gaps are
 * queryable at runtime instead of only existing as a comment.
 */
export function listV2CapabilityGaps(): readonly V2CapabilityGap[] {
  return V2_CAPABILITY_GAPS
}

/** Total call sites behind a known gap, for the setup summary. */
export function totalGapCallSites(): number {
  return V2_CAPABILITY_GAPS.reduce((sum, gap) => sum + gap.callSites, 0)
}

/**
 * One-time operator-facing summary. Emitted at setup so a degraded V2 install is
 * visible in the log rather than inferred from a feature quietly not working.
 */
export function logV2CapabilitySummary(serverUrl: string): void {
  log("[v2-client-shim] V2 capability summary", {
    serverUrl,
    mappedMembers: V2_MAPPED_MEMBERS.length,
    unavailableMembers: V2_CAPABILITY_GAPS.length,
    unavailableCallSites: totalGapCallSites(),
  })
  for (const gap of V2_CAPABILITY_GAPS) {
    log(`[v2-client-shim] UNAVAILABLE ON V2: ${gap.member} (${gap.callSites} call sites)`, {
      reason: gap.reason,
      probeEvidence: gap.probeEvidence,
    })
  }
}

/**
 * V1 members the shim routes to a probed V2 route, with the route that answered.
 * Kept beside the gap list so the two halves of the mapping table sit together
 * and any member is either here or in `V2_CAPABILITY_GAPS` — never neither.
 */
export const V2_MAPPED_MEMBERS: readonly { readonly member: string; readonly route: string }[] = [
  { member: "session.messages", route: "GET /api/session/{id}/message" },
  { member: "session.message", route: "GET /api/session/{id}/message" },
  { member: "session.context", route: "GET /api/session/{id}/context" },
  { member: "session.list", route: "GET /api/session" },
  { member: "session.children", route: "GET /api/session (parentID filter)" },
  { member: "session.create", route: "POST /api/session" },
  { member: "session.get", route: "GET /api/session/{id}" },
  { member: "session.delete", route: "DELETE /api/session/{id}" },
  { member: "session.status", route: "GET /api/session/active" },
  { member: "session.prompt", route: "POST /api/session/{id}/prompt" },
  { member: "session.promptAsync", route: "POST /api/session/{id}/prompt" },
  { member: "session.abort", route: "POST /api/session/{id}/interrupt" },
  { member: "session.summarize", route: "POST /api/session/{id}/compact" },
  { member: "model.list", route: "GET /api/model" },
  { member: "provider.list", route: "GET /api/provider" },
  { member: "config.get", route: "GET /api/config" },
  { member: "command.list", route: "GET /api/command" },
  { member: "app.agents", route: "GET /api/agent" },
] as const
