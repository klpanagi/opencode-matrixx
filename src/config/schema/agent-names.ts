import { z } from "zod"

export const BuiltinAgentNameSchema = z.enum([
  "morpheus",
  "keymaker",
  "oracle",
  "merovingian",
  "operator",
  "trinity",
  "construct",
  "seraph",
  "smith",
  "architect",
  "cipher",
  "sentinel",
  "sati",
  "bdd-contract",
])

export const BuiltinSkillNameSchema = z.enum([
  "playwright",
  "agent-browser",
  "dev-browser",
  "frontend-ui-ux",
  "git-master",
  "docker-master",
  "dsl-core",
  "dsl-grammar",
  "dsl-codegen",
  "dsl-metamodel",
  "dsl-tooling",
  "dsl-textx-ecosystem",
  "dsl-pyecore-advanced",
  "dsl-model-transformation",
  "dsl-testing",
  "dsl-validation",
  "dsl-composition",
  "security-core",
  "security-secrets",
  "security-sast",
  "security-dast",
  "security-dependencies",
  "security-api",
  "security-crypto",
  "security-infra",
  "security-review",
  "tdd-enforcer",
  "review-work",
  "quality-gate",
  "software-dev",
  "matrixx-self-config",
  "ulw-research",
  "remove-ai-slops",
  "bdd-backend",
  "bdd-contract",
  "bdd-frontend",
  "bdd-tests",
])

export type AgentName = z.infer<typeof BuiltinAgentNameSchema>

export const V1_TO_V2_AGENT_NAMES: Record<AgentName, AgentName> = {
  morpheus: "morpheus",
  keymaker: "keymaker",
  oracle: "oracle",
  merovingian: "merovingian",
  operator: "operator",
  trinity: "trinity",
  construct: "construct",
  seraph: "seraph",
  smith: "smith",
  architect: "architect",
  cipher: "cipher",
  sentinel: "sentinel",
  sati: "sati",
  "bdd-contract": "bdd-contract",
}

export const V2AgentNameSchema = BuiltinAgentNameSchema
export type V2AgentName = z.infer<typeof V2AgentNameSchema>

