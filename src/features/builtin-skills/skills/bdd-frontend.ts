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
2. Extract \`@ui:*\` annotations
3. Generate React components for each route
4. Implement form fields for each state variable
5. Apply test IDs from \`@ui:testid\` annotations
6. Use design tokens for consistent styling
7. Generate a **preview-server.ts** for visual review (see Preview Server section below)

## Component Structure
- One component per feature/route
- TypeScript props interface from state variables
- Loading, empty, and error states
- Accessible form elements with labels
- Data attributes for testability

## Annotation Mapping
- \`@ui:route\` → Create route/page component
- \`@ui:testid\` → Add \`data-testid\` attributes
- \`@ui:string\` → Use for labels, placeholders, messages
- \`@state:variable\` → Form state management

## Preview Server
Generate a \`preview-server.ts\` alongside the components so developers can visually review the UI in a browser with zero npm installs.

### Pattern
- **Runtime**: Bun (use \`Bun.serve()\` + \`Bun.build()\`)
- **CDN React**: Load React 18 via esm.sh importmap (no npm react deps needed)
- **Port**: Configurable via \`PREVIEW_PORT\` env var (default: 4000)
- **Bundle**: Build the main component TSX into an ESM bundle using \`Bun.build()\` with \`external: ["react", "react-dom", ...]\`

### Mock API Endpoints
For each \`@api:endpoint METHOD /path\` annotation in the contract, add a fetch handler in the preview server that returns realistic mock data. Map \`@api:response\` annotations to shape the mock response body.

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
