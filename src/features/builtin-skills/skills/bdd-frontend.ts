import type { BuiltinSkill } from "../types"

export const BDD_FRONTEND_SKILL_NAME = "bdd-frontend"

const BDD_FRONTEND_SKILL_DESCRIPTION =
  "React component generation from BDD Contract JSON. Use when generating UI for a feature."

export const bddFrontendSkill: BuiltinSkill = {
  name: BDD_FRONTEND_SKILL_NAME,
  description: BDD_FRONTEND_SKILL_DESCRIPTION,
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
5. Output structure: \`<out-dir>/<feature>/components/\` with one component tree + preview-server.ts per feature`,
}
