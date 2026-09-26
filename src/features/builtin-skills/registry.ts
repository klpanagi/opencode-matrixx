import type { BrowserAutomationProvider } from "../../config/schema"
import { createLazyTemplateSkill } from "./lazy-skill-helper"
import type { BuiltinSkill } from "./types"

const BROWSER_SKILL_NAMES = new Set(["playwright", "agent-browser", "playwright-cli"])

const skillLoaders: Record<string, () => BuiltinSkill> = {
  // Browser skills (eager if selected, excluded otherwise)
  "playwright": () => require("./templates/playwright").playwrightSkill,
  "agent-browser": () => require("./templates/playwright").agentBrowserSkill,
  "playwright-cli": () => require("./templates/playwright-cli").playwrightCliSkill,
  // Non-browser skills (lazy-loaded)
  "frontend-ui-ux": () => require("./templates/frontend-ui-ux").frontendUiUxSkill,
  "docker-master": () => require("./templates/docker-master").dockerMasterSkill,
  "git-master": () => require("./templates/git-master").gitMasterSkill,
  "dev-browser": () => require("./templates/dev-browser").devBrowserSkill,
  "dsl-core": () => require("./templates/dsl-core").dslCoreSkill,
  "dsl-grammar": () => require("./templates/dsl-grammar").dslGrammarSkill,
  "dsl-codegen": () => require("./templates/dsl-codegen").dslCodegenSkill,
  "dsl-metamodel": () => require("./templates/dsl-metamodel").dslMetamodelSkill,
  "dsl-tooling": () => require("./templates/dsl-tooling").dslToolingSkill,
  "dsl-textx-ecosystem": () => require("./templates/dsl-textx-ecosystem").dslTextxEcosystemSkill,
  "dsl-pyecore-advanced": () => require("./templates/dsl-pyecore-advanced").dslPyecoreAdvancedSkill,
  "dsl-model-transformation": () => require("./templates/dsl-model-transformation").dslModelTransformationSkill,
  "dsl-testing": () => require("./templates/dsl-testing").dslTestingSkill,
  "dsl-validation": () => require("./templates/dsl-validation").dslValidationSkill,
  "dsl-composition": () => require("./templates/dsl-composition").dslCompositionSkill,
  "frontend-a11y": () => require("./templates/frontend-a11y").frontendA11ySkill,
  "bdd-backend": () => require("./templates/bdd-backend").bddBackendSkill,
  "bdd-contract": () => require("./templates/bdd-contract").bddContractSkill,
  "bdd-frontend": () => require("./templates/bdd-frontend").bddFrontendSkill,
  "bdd-tests": () => require("./templates/bdd-tests").bddTestsSkill,
  "frontend-build-tooling": () => require("./templates/frontend-build-tooling").frontendBuildToolingSkill,
  "frontend-perf": () => require("./templates/frontend-perf").frontendPerfSkill,
  "frontend-state-data": () => require("./templates/frontend-state-data").frontendStateDataSkill,
  "frontend-testing": () => require("./templates/frontend-testing").frontendTestingSkill,
  "react-nextjs-patterns": () => require("./templates/frontend-react-nextjs").reactNextjsPatternsSkill,
  "svelte-sveltekit-patterns": () => require("./templates/frontend-svelte-sveltekit").svelteSveltekitPatternsSkill,
  "document-reader": () => require("./templates/document-reader").documentReaderSkill,
  "security-core": () => require("./templates/security-core").securityCoreSkill,
  "security-secrets": () => require("./templates/security-secrets").securitySecretsSkill,
  "security-sast": () => require("./templates/security-sast").securitySastSkill,
  "security-dast": () => require("./templates/security-dast").securityDastSkill,
  "security-dependencies": () => require("./templates/security-dependencies").securityDependenciesSkill,
  "security-api": () => require("./templates/security-api").securityApiSkill,
  "security-crypto": () => require("./templates/security-crypto").securityCryptoSkill,
  "security-infra": () => require("./templates/security-infra").securityInfraSkill,
  "security-review": () => require("./templates/security-review").securityReviewSkill,
  "tdd-enforcer": () => require("./templates/tdd-enforcer").tddEnforcerSkill,
  "review-work": () => require("./templates/review-work").reviewWorkSkill,
  "quality-gate": () => require("./templates/quality-gate").qualityGateSkill,
  "software-dev": () => require("./templates/software-dev").softwareDevSkill,
  "matrixx-self-config": () => require("./templates/matrixx-self-config").matrixxSelfConfigSkill,
  "ulw-research": () => require("./templates/ulw-research").ulwResearchSkill,
  "remove-ai-slops": () => require("./templates/remove-ai-slops").removeAiSlopsSkill,
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
