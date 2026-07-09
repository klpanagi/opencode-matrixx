import type { BrowserAutomationProvider } from "../../config/schema"
import { createLazyTemplateSkill } from "./lazy-skill-helper"
import type { BuiltinSkill } from "./types"

const BROWSER_SKILL_NAMES = new Set(["playwright", "agent-browser", "playwright-cli"])

const skillLoaders: Record<string, () => BuiltinSkill> = {
  // Browser skills (eager if selected, excluded otherwise)
  "playwright": () => require("./skills/playwright").playwrightSkill,
  "agent-browser": () => require("./skills/playwright").agentBrowserSkill,
  "playwright-cli": () => require("./skills/playwright-cli").playwrightCliSkill,
  // Non-browser skills (lazy-loaded)
  "frontend-ui-ux": () => require("./skills/frontend-ui-ux").frontendUiUxSkill,
  "docker-master": () => require("./skills/docker-master").dockerMasterSkill,
  "git-master": () => require("./skills/git-master").gitMasterSkill,
  "dev-browser": () => require("./skills/dev-browser").devBrowserSkill,
  "dsl-core": () => require("./skills/dsl-core").dslCoreSkill,
  "dsl-grammar": () => require("./skills/dsl-grammar").dslGrammarSkill,
  "dsl-codegen": () => require("./skills/dsl-codegen").dslCodegenSkill,
  "dsl-metamodel": () => require("./skills/dsl-metamodel").dslMetamodelSkill,
  "dsl-tooling": () => require("./skills/dsl-tooling").dslToolingSkill,
  "dsl-textx-ecosystem": () => require("./skills/dsl-textx-ecosystem").dslTextxEcosystemSkill,
  "dsl-pyecore-advanced": () => require("./skills/dsl-pyecore-advanced").dslPyecoreAdvancedSkill,
  "dsl-model-transformation": () => require("./skills/dsl-model-transformation").dslModelTransformationSkill,
  "dsl-testing": () => require("./skills/dsl-testing").dslTestingSkill,
  "dsl-validation": () => require("./skills/dsl-validation").dslValidationSkill,
  "dsl-composition": () => require("./skills/dsl-composition").dslCompositionSkill,
  "frontend-a11y": () => require("./skills/frontend-a11y").frontendA11ySkill,
  "bdd-backend": () => require("./skills/bdd-backend").bddBackendSkill,
  "bdd-contract": () => require("./skills/bdd-contract").bddContractSkill,
  "bdd-frontend": () => require("./skills/bdd-frontend").bddFrontendSkill,
  "bdd-tests": () => require("./skills/bdd-tests").bddTestsSkill,
  "frontend-build-tooling": () => require("./skills/frontend-build-tooling").frontendBuildToolingSkill,
  "frontend-perf": () => require("./skills/frontend-perf").frontendPerfSkill,
  "frontend-state-data": () => require("./skills/frontend-state-data").frontendStateDataSkill,
  "frontend-testing": () => require("./skills/frontend-testing").frontendTestingSkill,
  "react-nextjs-patterns": () => require("./skills/frontend-react-nextjs").reactNextjsPatternsSkill,
  "svelte-sveltekit-patterns": () => require("./skills/frontend-svelte-sveltekit").svelteSveltekitPatternsSkill,
  "document-reader": () => require("./skills/document-reader").documentReaderSkill,
  "security-core": () => require("./skills/security-core").securityCoreSkill,
  "security-secrets": () => require("./skills/security-secrets").securitySecretsSkill,
  "security-sast": () => require("./skills/security-sast").securitySastSkill,
  "security-dast": () => require("./skills/security-dast").securityDastSkill,
  "security-dependencies": () => require("./skills/security-dependencies").securityDependenciesSkill,
  "security-api": () => require("./skills/security-api").securityApiSkill,
  "security-crypto": () => require("./skills/security-crypto").securityCryptoSkill,
  "security-infra": () => require("./skills/security-infra").securityInfraSkill,
  "security-review": () => require("./skills/security-review").securityReviewSkill,
  "tdd-enforcer": () => require("./skills/tdd-enforcer").tddEnforcerSkill,
  "review-work": () => require("./skills/review-work").reviewWorkSkill,
  "quality-gate": () => require("./skills/quality-gate").qualityGateSkill,
  "software-dev": () => require("./skills/software-dev").softwareDevSkill,
  "matrixx-self-config": () => require("./skills/matrixx-self-config").matrixxSelfConfigSkill,
  "ulw-research": () => require("./skills/ulw-research").ulwResearchSkill,
  "remove-ai-slops": () => require("./skills/remove-ai-slops").removeAiSlopsSkill,
}

export interface CreateBuiltinSkillsOptions {
  browserProvider?: BrowserAutomationProvider
  disabledSkills?: Set<string>
}

export function createBuiltinSkills(options: CreateBuiltinSkillsOptions = {}): BuiltinSkill[] {
  const { browserProvider = "playwright", disabledSkills: rawDisabledSkills } = options
  const disabledSkills = rawDisabledSkills instanceof Set ? rawDisabledSkills : new Set(rawDisabledSkills ?? [])

  // Determine which browser skill to load (eagerly)
  const browserSkillName = browserProvider === "agent-browser"
    ? "agent-browser"
    : browserProvider === "playwright-cli"
      ? "playwright-cli"
      : "playwright"

  // Browser skill loaded eagerly (small, always needed for filtering)
  const browserSkill = skillLoaders[browserSkillName]()

  // All non-browser skills are lazy-loaded
  const lazySkillNames = Object.keys(skillLoaders).filter(
    (n) => n !== browserSkillName && !BROWSER_SKILL_NAMES.has(n),
  )
  const lazySkills = lazySkillNames.map((name) =>
    createLazyTemplateSkill(name, skillLoaders[name]),
  )

  const allSkills = [browserSkill, ...lazySkills]

  if (!disabledSkills) {
    return allSkills
  }

  return allSkills.filter((skill) => !disabledSkills.has(skill.name))
}
