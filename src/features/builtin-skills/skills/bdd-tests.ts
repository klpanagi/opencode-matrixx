import type { BuiltinSkill } from "../types"

export const BDD_TESTS_SKILL_NAME = "bdd-tests"

const BDD_TESTS_SKILL_DESCRIPTION =
  "Cucumber step definition + page object generation from BDD Contract JSON. Use when generating E2E tests for a feature."

export const bddTestsSkill: BuiltinSkill = {
  name: BDD_TESTS_SKILL_NAME,
  description: BDD_TESTS_SKILL_DESCRIPTION,
  template: `# BDD Test Generation

## Overview
Generate Cucumber step definitions and page objects from a BDD Contract JSON.

## Workflow
1. Read the Contract JSON file
2. Extract feature scenarios and their steps
3. Generate step definition files for each scenario
4. Generate page object classes for UI interactions
5. Generate a Cucumber configuration file if needed
6. Verify with \`npx cucumber-js\`

## Step Definition Structure
- Given: Setup preconditions and state
- When: Perform actions via page objects
- Then: Assert expected outcomes
- And/But: Additional conditions in sequence

## Page Object Model
- One class per screen/page
- Locators as class properties
- Methods representing user actions
- Return \`this\` for method chaining

## Data Table Handling
- Convert tables to arrays of maps
- Use in scenario outlines with Examples tables

## Running Tests
\`\`\`bash
npx cucumber-js path/to/features --require path/to/step-definitions
\`\`\``,
}
