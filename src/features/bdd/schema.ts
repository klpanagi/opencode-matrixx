import { z } from "zod"

// --- Step ---

export const StepKeywordSchema = z.enum(["Given", "When", "Then", "And", "But"])

export const StepSchema = z.object({
  keyword: StepKeywordSchema,
  text: z.string(),
  dataTable: z.array(z.record(z.string(), z.string())).optional(),
  docString: z.string().optional(),
})

// --- Example (Scenario Outline) ---

export const ExampleRowSchema = z.record(z.string(), z.string())

// --- Scenario ---

export const ScenarioSchema = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  steps: z.array(StepSchema),
  examples: z.array(ExampleRowSchema).optional(),
})

// --- Background ---

export const BackgroundSchema = z.object({
  steps: z.array(StepSchema),
})

// --- Rules ---

export const RuleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  scenarios: z.array(ScenarioSchema),
})

// --- Annotation schemas (exported individually) ---

export const AnnotationApiSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string().optional(),
})

export const AnnotationUiSchema = z.object({
  component: z.string(),
  description: z.string().optional(),
})

export const AnnotationStateSchema = z.object({
  key: z.string(),
  description: z.string().optional(),
})

export const ContractAnnotationsSchema = z.object({
  api: z.array(AnnotationApiSchema).optional(),
  ui: z.array(AnnotationUiSchema).optional(),
  state: z.array(AnnotationStateSchema).optional(),
  assumptions: z.array(z.string()).optional(),
})

// --- Feature ---

export const FeatureSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  annotations: z.record(z.string(), z.unknown()),
})

// --- Contract (root) ---

export const ContractSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  sourceFile: z.string(),
  feature: FeatureSchema,
  scenarios: z.array(ScenarioSchema),
  background: BackgroundSchema.optional(),
  rules: z.array(RuleSchema).optional(),
  annotations: ContractAnnotationsSchema,
})

// --- Inferred types ---

export type Step = z.infer<typeof StepSchema>
export type StepKeyword = z.infer<typeof StepKeywordSchema>
export type ExampleRow = z.infer<typeof ExampleRowSchema>
export type Scenario = z.infer<typeof ScenarioSchema>
export type Background = z.infer<typeof BackgroundSchema>
export type Rule = z.infer<typeof RuleSchema>
export type AnnotationApi = z.infer<typeof AnnotationApiSchema>
export type AnnotationUi = z.infer<typeof AnnotationUiSchema>
export type AnnotationState = z.infer<typeof AnnotationStateSchema>
export type ContractAnnotations = z.infer<typeof ContractAnnotationsSchema>
export type Feature = z.infer<typeof FeatureSchema>
export type Contract = z.infer<typeof ContractSchema>
