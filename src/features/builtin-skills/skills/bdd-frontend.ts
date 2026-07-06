import type { BuiltinSkill } from "../types"

export const BDD_FRONTEND_SKILL_NAME = "bdd-frontend"

const BDD_FRONTEND_SKILL_DESCRIPTION =
  "React component generation from BDD Contract JSON. Use when generating UI for a feature."

export const bddFrontendSkill: BuiltinSkill = {
  name: BDD_FRONTEND_SKILL_NAME,
  description: BDD_FRONTEND_SKILL_DESCRIPTION,
  template: `# BDD Frontend Generation

## Overview
Generate React components from BDD Contract JSON annotations.

## Workflow
1. Read the Contract JSON
2. Extract \`@ui:*\` annotations
3. Generate React components for each route
4. Implement form fields for each state variable
5. Apply test IDs from \`@ui:testid\` annotations
6. Use design tokens for consistent styling

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

## Accessibility
- Proper heading hierarchy
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus management`,
}
