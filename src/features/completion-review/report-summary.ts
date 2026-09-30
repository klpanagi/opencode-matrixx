/**
 * Task 4 — the Summary section, built from FACTS.
 *
 * 3–5 sentences, no adjectives the facts do not support. The sentences are
 * assembled by concatenation from the gathered counters, which keeps the whole
 * renderer pure: no model call, no clock, no randomness. A wording change is a
 * diff a reviewer can read; a model paraphrase is not.
 */
import type { ReviewDimension, ReviewInput } from "./report-types"

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

function scoredCount(dimensions: readonly ReviewDimension[]): number {
  return dimensions.filter((d) => d.outcome === "scored").length
}

function reportableCount(dimensions: readonly ReviewDimension[]): number {
  return dimensions.filter((d) => d.outcome !== "scored").length
}

export function renderSummary(input: ReviewInput): string[] {
  const { progress, score, dimensions, coverageClass, attribution, planName } = input
  const sentences: string[] = []

  sentences.push(
    `Plan \`${planName}\` declared ${progress.total} task(s); ${progress.completed} are marked complete and ${progress.remaining} remain.`,
  )

  sentences.push(
    `The rubric measured ${scoredCount(dimensions)} of ${dimensions.length} dimensions, covering ${pct(score.scoredWeight)} of the rubric weight, and returned ${score.value.toFixed(2)} (APB grade ${score.grade}).`,
  )

  const unmeasured = reportableCount(dimensions)
  if (unmeasured > 0) {
    sentences.push(
      `${unmeasured} dimension(s) could not be measured and are reported as unscorable rather than as zero, so the score rests on a partial denominator.`,
    )
  }

  sentences.push(
    `This is a ${coverageClass} plan: ${coverageClass === "post-capture" ? "machine-written evidence backs its DoD items" : "no capture pipeline backed its DoD items, so evidence is convention only"}. Task→plan linkage accounts for ${attribution.linkedTerminal} of ${attribution.planTasks} plan task(s)${attribution.matches ? ", fully" : ", incompletely"}.`,
  )

  if (input.findings.length > 0) {
    sentences.push(
      `${input.findings.length} taxonomy finding(s) were recorded, each attached to the dimension that produced it.`,
    )
  }

  return sentences.slice(0, 5)
}
