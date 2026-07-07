import type { BuiltinSkill } from "../types"

export const BDD_FRONTEND_SKILL_NAME = "bdd-frontend"

const BDD_FRONTEND_SKILL_DESCRIPTION =
  "React component generation from BDD Contract JSON. Use when generating UI for a feature."

export const bddFrontendSkill: BuiltinSkill = {
  name: BDD_FRONTEND_SKILL_NAME,
  description: BDD_FRONTEND_SKILL_DESCRIPTION + ' NEVER commits or runs git in this skill context.',
  template: `# BDD Frontend Generation

## Overview
Generate React components and a dev preview server from BDD Contract JSON annotations.

## Workflow
1. Read the Contract JSON
2. Read the contract's \`annotations.ui\` and \`annotations.state\` blocks
3. Generate React components for each route in \`annotations.ui.routes\`
4. Implement form fields for each variable in \`annotations.state.variables\`
5. Apply \`data-testid\` attributes from \`annotations.ui.testIds\` (each testId has \`name\` and \`value\`)
6. Use strings from \`annotations.ui.strings\` for labels, placeholders, and messages (key is \`category.name\`)
7. Generate a **preview-server.ts** for visual review (see Preview Server section below)
8. **Generate \`*.test.tsx\` for every component** (see Unit Tests section below) -- one file per component, co-located next to it (e.g. \`LoginPage.tsx\` -> \`LoginPage.test.tsx\`)
9. **Run the generated unit tests** as the final step (see Running Unit Tests section below). Up to 3 retry attempts on failure. Do not declare success until all unit tests pass.

## Component Structure
- One component per feature/route
- TypeScript props interface from state variables
- Loading, empty, and error states
- Accessible form elements with labels
- Data attributes for testability

## Annotation Mapping
- \`annotations.ui.routes[]\` → Create one route/page component per entry (\`name\` + \`path\`)
- \`annotations.ui.testIds[]\` → Add \`data-testid={value}\` attributes (use the \`value\` field, not \`name\`)
- \`annotations.ui.strings[]\` → Use for labels, placeholders, messages (key is \`category.name\`, value is the displayed text)
- \`annotations.state.variables[]\` → Form state via \`useState\`; type drives the input element; \`default\` provides the initial value

## Preview Server
Generate a \`preview-server.ts\` alongside the components so developers can visually review the UI in a browser with zero npm installs.

### Pattern
- **Runtime**: Bun (use \`Bun.serve()\` + \`Bun.build()\`)
- **CDN React**: Load React 18 via esm.sh importmap (no npm react deps needed)
- **Port**: Configurable via \`PREVIEW_PORT\` env var (default: 4000)
- **Bundle**: Build the main component TSX into an ESM bundle using \`Bun.build()\` with \`external: ["react", "react-dom", ...]\`

### Mock API Endpoints
For each entry in \`annotations.api.endpoints\` (\`{ method, path, request?, response? }\`), add a fetch handler in the preview server that returns realistic mock data shaped by \`annotations.api.responses[]\` (\`{ status, format }\`).

### Entry Point
Generate an inline entry script that:
- Imports \`React\` (default) + \`createElement\` from \`"react"\` so \`React.useState\` / \`React.useEffect\` work in the bundled component
- Exposes \`window.React = React\` for components that reference the global
- Imports \`createRoot\` from \`react-dom/client\`
- Imports the main route component
- Renders it on \`#root\` with mock callbacks

### HTML Template
Wrap the bundled code in an HTML page with:
- \`importmap\` pointing to esm.sh for React packages (must include \`react\`, \`react-dom\`, \`react-dom/client\`, and \`react/jsx-runtime\`)
- Minimal reset CSS
- \`<div id="root">\` mount point

### File Output
Write \`preview-server.ts\` in the same output directory as the components.

## Unit Tests (REQUIRED output)
Every generated React component MUST ship with a co-located \`*.test.tsx\` that exercises its real behaviour, not just a snapshot. The test file uses \`bun:test\` as the runner plus \`@testing-library/react\` for rendering and \`@testing-library/jest-dom\` for DOM matchers. \`happy-dom\` provides the DOM implementation -- register it in each test file with \`// @vitest-environment happy-dom\` or load it via \`bunfig.toml\`'s \`[test]\` \`preload\` entry.

Scope per component:
- **Renders** without crashing given the documented default props
- **Form validation**: submit with empty required fields shows the validation error; submit with valid fields does not
- **State transitions**: each \`state.transitions[]\` entry has a test that triggers the from-state, fires the trigger, and asserts the to-state (e.g. session transition from \`new-session-init\` to \`authenticated\` on successful login)
- **Mocked API call**: \`globalThis.fetch\` is mocked with \`bun:test\`'s \`mock()\`. Assert the call URL, method, and JSON body match the contract's \`api.endpoints[]\` entry. Assert the component handles both the 2xx and the 4xx/5xx response shape.
- **Accessibility**: \`@testing-library/jest-dom\` matchers like \`toHaveRole\`, \`toHaveAccessibleName\` cover labelled form fields and button roles. Optional: \`axe-core\` smoke test if available.

Use the \`data-testid\` from \`annotations.ui.testIds\` (\`value\` field) as the test selector -- \`screen.getByTestId('login-submit-button')\` rather than text or label queries so the tests don't break on copy changes.

## Running Unit Tests (MANDATORY final step)
After all components and tests are generated, run the unit tests:
\`\`\`bash
bun test components/
\`\`\`
If a test fails, read the failure, fix the component (or the test if the test is wrong), and re-run. Up to **3 retry attempts**. If still failing after 3 attempts, report the failure with the test output and the list of files that need attention. Do not declare success until all unit tests pass.

## Accessibility
- Proper heading hierarchy
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management

## Batch Mode
When the input is a directory or glob of .contract.json files:
1. Expand the input into a list of contract files
2. For each contract, run the single-file workflow above
3. Use \`task(run_in_background=true)\` to spawn parallel subagents (up to 5 concurrent) for each contract
4. Collect all results and report a per-feature summary

## Git Actions (HARD RULE)
NEVER run \`git commit\`, \`git add\`, \`git push\`, \`git rebase\`, \`git reset\`, \`git tag\`, or any other git command in this skill context. The pipeline runner is responsible for version control. You may only create/edit the generated files in the target output directory.`,
}
