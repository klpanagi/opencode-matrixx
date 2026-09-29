/**
 * Pagination arithmetic for `plan_read` (offset / limit).
 *
 * SEPARATED FROM `plan-read.ts` as a pure move: the strict-argument validation and
 * the line-window selection are a self-contained concern with their own rules, and
 * `plan-read.ts` sits at the 200-LOC ceiling with the cap-as-ceiling bypass still
 * to land in it. Nothing here touches the filesystem or the tool definition.
 *
 * The rendered-budget CLAMP lives here too, because clamping a window is the same
 * arithmetic as selecting one: both answer "how many lines can I take from here".
 */
import { measurePlanBytes } from "../../features/mission-state/constants"

export type SelectLinesResult = { selected: string[]; startIndex: number } | { argument: "offset" | "limit"; message: string }

/**
 * Strict: an OMITTED offset/limit means "use the default", but a PRESENT-BUT-INVALID
 * value is an argument error. Silently falling back made `offset: 0` (a common
 * off-by-one) return the ENTIRE file instead of erroring — on a near-cap file that
 * is exactly the "100% more damaged" outcome the cap work exists to prevent, and it
 * masks typos in a machine-facing tool.
 */
export function resolvePositive(value: unknown, argument: "offset" | "limit"): { ok: true; value: number } | { ok: false; message: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, message: `${argument} must be a finite number` }
  }
  const rounded = Math.floor(value)
  if (rounded < 1) {
    return { ok: false, message: `${argument} must be >= 1 (1-based); omit it to use the default` }
  }
  return { ok: true, value: rounded }
}

export function selectLines(lines: string[], offset?: number, limit?: number): SelectLinesResult {
  if (offset !== undefined) {
    const parsed = resolvePositive(offset, "offset")
    if (!parsed.ok) return { argument: "offset", message: parsed.message }
  }
  if (limit !== undefined) {
    const parsed = resolvePositive(limit, "limit")
    if (!parsed.ok) return { argument: "limit", message: parsed.message }
  }
  const start = (offset === undefined ? 1 : Math.floor(offset)) - 1
  const count = limit === undefined ? undefined : Math.floor(limit)
  const endIndex = count === undefined ? lines.length : start + count
  return { selected: lines.slice(start, endIndex), startIndex: start }
}

/**
 * Shrink a requested window until its RENDERED payload fits `budget` bytes.
 *
 * SAME RULER AS THE CHECK IT CLAMPS AGAINST — `measurePlanBytes` (UTF-8), not
 * `JSON.stringify(...).length` (UTF-16 code units, which under-count a CJK render
 * by up to 3x and would let a clamped payload exceed the budget it was clamped to).
 * Both live in the same module on purpose so they cannot drift apart.
 *
 * `build(count, selected)` renders the COMPLETE response — envelope included — for a
 * window of that many lines, and the returned payload is that same `build` result.
 * Measuring a bare slice and then wrapping it in metadata would under-count by
 * exactly the envelope size, which is how a "clamped" payload came out 88 bytes
 * over the very budget it was clamped to. It must be pure and cheap: the binary
 * search calls it O(log n) times.
 */
export function clampWindowToRenderedBudget(
  lines: string[],
  startIndex: number,
  requestedCount: number,
  budget: number,
  build: (count: number, selected: string[]) => unknown,
): { count: number; clamped: boolean; payload: unknown } {
  const fits = (count: number) => measurePlanBytes(JSON.stringify(build(count, lines.slice(startIndex, startIndex + count)))) <= budget
  const render = (count: number) => build(count, lines.slice(startIndex, startIndex + count))
  if (fits(requestedCount)) return { count: requestedCount, clamped: false, payload: render(requestedCount) }
  // Binary search for the largest fitting count. Monotonic because appending lines
  // can only grow the rendered payload.
  let low = 0
  let high = requestedCount - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return { count: low, clamped: true, payload: render(low) }
}
