/**
 * Task 5 — structural gate over a rubric table.
 *
 * This is the RUNTIME twin of the discriminated union in `rubric-types.ts`. The
 * type makes a mis-tagged dimension a compile error for a dimension written in
 * TypeScript; this makes the same mistake a reported failure for a rubric
 * arriving from anywhere else, and gives the test suite a subject. Both call the
 * same declaration — a gate that only exists in a test file has never failed.
 */
import { RUBRIC_KIND_PATTERN } from "./rubric-dimensions"
import type { RubricDimension } from "./rubric-types"

const EXPECTED_COUNT = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function checkRubricStructure(dimensions: readonly unknown[]): string[] {
  const failures: string[] = []

  if (dimensions.length !== EXPECTED_COUNT) {
    failures.push(`expected ${EXPECTED_COUNT} dimensions, found ${dimensions.length}`)
  }

  let weightSum = 0
  dimensions.forEach((raw, position) => {
    const where = `dimension ${position + 1}`
    if (!isRecord(raw)) {
      failures.push(`${where} is not a rubric dimension`)
      return
    }
    const dimension = raw as Partial<RubricDimension> & Record<string, unknown>
    if (typeof dimension.id !== "string" || dimension.id === "") failures.push(`${where} has no id`)
    if (typeof dimension.title !== "string" || dimension.title === "") failures.push(`${where} has no title`)
    if (typeof dimension.description !== "string" || dimension.description === "") {
      failures.push(`${where} has no description`)
    }
    if (typeof dimension.weight !== "number" || dimension.weight < 0) {
      failures.push(`${where} has no usable weight`)
    } else {
      weightSum += dimension.weight
    }

    if (dimension.kind === "DETERMINISTIC") {
      if (typeof dimension.compute !== "function") {
        failures.push(`${where} is DETERMINISTIC but declares no compute function`)
      }
    } else if (dimension.kind === "MODEL") {
      if (dimension.compute !== undefined) {
        failures.push(`${where} is MODEL but declares a compute function; a model read cannot be code-computed`)
      }
    } else {
      failures.push(`${where} has kind ${String(dimension.kind)}, which is neither DETERMINISTIC nor MODEL`)
    }
  })

  const expectedKind = RUBRIC_KIND_PATTERN[position_kind(dimensions.length)]
  if (expectedKind !== undefined && dimensions.length === EXPECTED_COUNT) {
    RUBRIC_KIND_PATTERN.forEach((kind, position) => {
      const raw = dimensions[position]
      if (isRecord(raw) && raw.kind !== kind) {
        failures.push(`dimension ${position + 1} is ${String(raw.kind)}, expected ${kind}`)
      }
    })
  }

  if (Math.abs(weightSum - 1) > 1e-9) failures.push(`weights sum to ${weightSum}, expected 1`)
  return failures
}

function position_kind(length: number): number {
  return length === EXPECTED_COUNT ? 0 : -1
}
