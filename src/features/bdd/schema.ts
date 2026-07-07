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

// --- Naming-convention primitives (strict regex) ---

// kebab-case: starts with lowercase letter, then lowercase letters / digits / hyphens
export const KebabCaseSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "must be kebab-case (lowercase letters, digits, hyphens; no leading digit)")

// camelCase: starts with lowercase letter, then alphanumeric
export const CamelCaseSchema = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*$/, "must be camelCase (lowercase first letter, then alphanumeric)")

// dotted kebab-case: "category.name" (both segments kebab-case)
export const DottedKebabSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/,
    "must be dotted kebab-case (e.g. 'button.sign-in')",
  )

// URL path: must start with '/'
export const UrlPathSchema = z.string().regex(/^\//, "must be an absolute path starting with '/'")

// --- Enum schemas ---

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])

export const ResponseFormatSchema = z.enum(["json", "html", "text", "xml", "binary"])

export const VarTypeSchema = z.enum(["string", "number", "boolean", "object", "array", "null"])

// --- Annotation element schemas (strict — reject unknown fields) ---

export const ApiEndpointSchema = z
  .object({
    method: HttpMethodSchema,
    path: UrlPathSchema,
    request: z.string().optional(),
    response: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()

export const ApiResponseSchema = z
  .object({
    status: z.number().int().min(100).max(599),
    format: ResponseFormatSchema,
    description: z.string().optional(),
  })
  .strict()

export const UiRouteSchema = z
  .object({
    name: KebabCaseSchema,
    path: UrlPathSchema,
  })
  .strict()

export const UiTestIdSchema = z
  .object({
    name: KebabCaseSchema,
    value: KebabCaseSchema,
  })
  .strict()

export const UiStringSchema = z
  .object({
    key: DottedKebabSchema,
    value: z.string().min(1),
  })
  .strict()

export const StateVariableSchema = z
  .object({
    name: CamelCaseSchema,
    type: VarTypeSchema,
    default: z.unknown().optional(),
  })
  .strict()

export const StateTransitionSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    trigger: z.string().min(1),
  })
  .strict()

// --- Annotation grouping schemas (strict) ---

export const ApiAnnotationsSchema = z
  .object({
    endpoints: z.array(ApiEndpointSchema).optional(),
    responses: z.array(ApiResponseSchema).optional(),
  })
  .strict()

export const UiAnnotationsSchema = z
  .object({
    routes: z.array(UiRouteSchema).optional(),
    testIds: z.array(UiTestIdSchema).optional(),
    strings: z.array(UiStringSchema).optional(),
  })
  .strict()

export const StateAnnotationsSchema = z
  .object({
    variables: z.array(StateVariableSchema).optional(),
    transitions: z.array(StateTransitionSchema).optional(),
  })
  .strict()

export const ContractAnnotationsSchema = z
  .object({
    api: ApiAnnotationsSchema.optional(),
    ui: UiAnnotationsSchema.optional(),
    state: StateAnnotationsSchema.optional(),
    assumptions: z.array(z.string().min(1)).optional(),
  })
  .strict()

// --- Feature ---
// `feature.annotations` is reserved for future use; it must be the empty
// object `{}` when present (or omitted entirely). Per-feature metadata
// lives under `Contract.annotations`, not here.
export const FeatureSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()),
  annotations: z.object({}).strict().optional(),
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

export type HttpMethod = z.infer<typeof HttpMethodSchema>
export type ResponseFormat = z.infer<typeof ResponseFormatSchema>
export type VarType = z.infer<typeof VarTypeSchema>

export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>
export type ApiResponse = z.infer<typeof ApiResponseSchema>
export type UiRoute = z.infer<typeof UiRouteSchema>
export type UiTestId = z.infer<typeof UiTestIdSchema>
export type UiString = z.infer<typeof UiStringSchema>
export type StateVariable = z.infer<typeof StateVariableSchema>
export type StateTransition = z.infer<typeof StateTransitionSchema>

export type ApiAnnotations = z.infer<typeof ApiAnnotationsSchema>
export type UiAnnotations = z.infer<typeof UiAnnotationsSchema>
export type StateAnnotations = z.infer<typeof StateAnnotationsSchema>
export type ContractAnnotations = z.infer<typeof ContractAnnotationsSchema>

export type Feature = z.infer<typeof FeatureSchema>
export type Contract = z.infer<typeof ContractSchema>
