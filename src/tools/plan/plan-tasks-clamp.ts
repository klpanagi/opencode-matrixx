/**
 * Render-budget clamp for the `plan_tasks` manifest.
 *
 * SEPARATED FROM `plan-tasks.ts` so the tool file stays a thin orchestration
 * shell, and because the clamp is a self-contained concern with its own rule:
 * it must never hand back more bytes than the budget even when the plan it
 * read was itself over the hard cap.
 *
 * SIBLING, NOT TWIN, of `plan-read-pagination.ts`'s `clampWindowToRenderedBudget`.
 * Both answer "how much can I hand back" and both measure the COMPLETE response
 * envelope with the same ruler. They differ in what they shrink and why: that
 * one shrinks a *line window the caller asked for* (its own `lines.slice`), this
 * one shrinks a *derived task list the caller never sized* and must additionally
 * report how many entries were dropped. The truncation marker is a manifest
 * concept, so it lives here rather than being bolted onto the read window path.
 */
import { measurePlanBytes } from "../../features/mission-state/constants"

/** How many entries of `total` the payload actually shows. */
export interface TruncationMarker {
  shown: number
  total: number
}

export interface ManifestView<TItem> {
  tasks: TItem[]
  dod: string[]
  /** Non-null whenever `tasks` was dropped from the tail. */
  tasksTruncated: TruncationMarker | null
  /** Non-null only when `tasks` alone could not fit the budget. */
  dodTruncated: TruncationMarker | null
}

export interface ClampResult<TItem> {
  payload: unknown
  view: ManifestView<TItem>
  /** True when either list was shortened. */
  clamped: boolean
}

/**
 * Largest prefix length of `items` whose COMPLETE envelope fits `budget`,
 * found by binary search.
 *
 * Monotonic because adding entries can only grow the payload. `build` must
 * render the whole response, markers included, so the measurement never
 * under-counts: measuring a bare slice and then attaching metadata afterwards is
 * how a "clamped" payload comes out over the very budget it was clamped to.
 */
function largestFittingPrefix<T>(
  items: readonly T[],
  budget: number,
  build: (count: number) => unknown,
): { count: number; clamped: boolean } {
  const fits = (count: number) => measurePlanBytes(JSON.stringify(build(count))) <= budget
  if (fits(items.length)) return { count: items.length, clamped: false }
  let low = 0
  let high = items.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (fits(mid)) low = mid
    else high = mid - 1
  }
  return { count: low, clamped: true }
}

/**
 * Clamp a two-list manifest to the rendered budget: `tasks` first (dropped from
 * the TAIL), then `dod` only if `tasks` alone still cannot fit.
 *
 * `tasks` is the unbounded axis — a pathological plan can carry thousands of
 * numbered entries — so it absorbs the cut. `dod` is small and bounded in
 * practice, making it a last resort rather than routine behaviour.
 *
 * `build` composes the whole response from the view, so truncation markers and
 * hints ride along only when real. When the full manifest already fits, the
 * returned view carries null markers and the payload is the untruncated one.
 */
export function clampManifestToRenderedBudget<TItem>(
  tasks: readonly TItem[],
  dod: readonly string[],
  budget: number,
  build: (view: ManifestView<TItem>) => unknown,
): ClampResult<TItem> {
  const taskFit = largestFittingPrefix(tasks, budget, (count) =>
    build({
      tasks: tasks.slice(0, count),
      dod: [...dod],
      tasksTruncated: count < tasks.length ? { shown: count, total: tasks.length } : null,
      dodTruncated: null,
    }),
  )
  if (!taskFit.clamped) {
    const view: ManifestView<TItem> = {
      tasks: [...tasks],
      dod: [...dod],
      tasksTruncated: null,
      dodTruncated: null,
    }
    return { payload: build(view), view, clamped: false }
  }

  const keptTasks = tasks.slice(0, taskFit.count)
  const tasksTruncated: TruncationMarker = { shown: taskFit.count, total: tasks.length }
  const dodFit = largestFittingPrefix(dod, budget, (count) =>
    build({
      tasks: keptTasks,
      dod: dod.slice(0, count),
      tasksTruncated,
      dodTruncated: count < dod.length ? { shown: count, total: dod.length } : null,
    }),
  )
  const view: ManifestView<TItem> = {
    tasks: keptTasks,
    dod: dod.slice(0, dodFit.count),
    tasksTruncated,
    dodTruncated: dodFit.clamped ? { shown: dodFit.count, total: dod.length } : null,
  }
  return { payload: build(view), view, clamped: true }
}
