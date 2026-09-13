export const PRESET_TEMPLATE = `You are managing the active model preset.

This command is provided by the Matrixx plugin. It uses the built-in \`preset\` tool to list, show, or switch model presets — no external scripts or direct config edits needed.

## Usage

\`\`\`
/preset                  → List available presets and mark the active one
/preset list             → List available presets
/preset show [<name>]    → Show a preset's agent/category model assignments (defaults to active)
/preset set <name>       → Switch the active preset for the current session (live)
/preset set <name> --save [--global|--project] → Also persist active_preset to config
\`\`\`

## Step 1: Determine the action

Parse the arguments passed to this command:

- No arguments or \`list\` → call \`preset\` with \`action: "list"\`.
- \`show\` → call \`preset\` with \`action: "show"\` (optionally \`name\`).
- \`set <name>\` → call \`preset\` with \`action: "set"\`, \`name: "<name>"\`.
- \`set <name> --save\` → also pass \`save: true\`; \`--global\` → \`scope: "global"\`, \`--project\` (default) → \`scope: "project"\`.

## Step 2: Call the built-in \`preset\` tool

Use the \`preset\` tool with the resolved arguments. The tool validates the preset name, applies the session overlay (delegate-task categories switch immediately), and — with \`--save\` — persists \`active_preset\` to the project (\`.opencode/matrixx.jsonc\`) or global (\`~/.config/opencode/matrixx.jsonc\`) config.

The tool handles all validation and file operations — do NOT edit config files directly.

## Step 3: Confirm and instruct

After a successful switch:

1. Report the tool's output to the user.
2. Note that delegate-task categories use the new preset immediately (session-scoped live switch).
3. If \`--save\` was used, tell the user the persisted \`active_preset\` takes effect for builtin agents on the next session.

## Important constraints

- Use the built-in \`preset\` tool. Do NOT bypass it by editing config files directly.
- Do not invent preset names — if the requested name is unknown, report the available presets and stop.
- \`--save\` without a scope defaults to project scope.`