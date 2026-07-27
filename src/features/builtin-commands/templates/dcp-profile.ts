export const DCP_PROFILE_TEMPLATE = `You are switching the active DCP (Dynamic Context Pruning) profile tier.

This command is provided by the Matrixx plugin. It uses the built-in \`dcp_switch_profile\` tool to apply DCP profile configurations — no external scripts needed.

## Step 1: Verify DCP is installed

Check whether the DCP plugin is installed at the standard OpenCode plugin location:

\`\`\`bash
if [ ! -d "$HOME/.config/opencode/node_modules/@tarquinen/opencode-dcp" ]; then
  echo "DCP is not installed at the standard OpenCode plugin location." >&2
  echo "Install it with: npm install --prefix ~/.config/opencode @tarquinen/opencode-dcp" >&2
  exit 1
fi
\`\`\`

If the directory does not exist, stop immediately and report the error to the user. Do not proceed.

## Step 2: Determine the target profile

Parse the arguments passed to this command. The user invoked \`/dcp-profile <arguments>\` where \`<arguments>\` is the first positional argument.

- If the argument is a known profile name (one of: economy, balanced, performance, ultimate), use it directly.
- If the argument is empty or missing, read \`dcp.default_profile\` from the user's \`matrixx.jsonc\` config; if absent, default to \`balanced\`.
- If the argument is not a recognized profile name, list the available profiles and stop. Do NOT guess or pass invalid names.

## Step 3: Call the built-in \`dcp_switch_profile\` tool

Use the \`dcp_switch_profile\` tool with the resolved profile name. This tool reads profile parameters from the Matrixx plugin configuration and writes the full inline DCP config to \`~/.config/opencode/dcp.jsonc\`.

The tool will handle all file operations — you do NOT need to run any external scripts or edit DCP config files directly.

## Step 4: Confirm and instruct

After a successful switch:

1. Report the tool's output to the user.
2. Tell the user that the new DCP configuration will take effect after they restart their OpenCode session (the active session has already loaded the previous config into memory).
3. Do not attempt to reload DCP in-place; a session restart is required.

## Important constraints

- Use the built-in \`dcp_switch_profile\` tool. Do NOT bypass it by editing DCP config files directly.
- Do not install, upgrade, or modify the DCP plugin from this command. If the user needs to install or upgrade DCP, instruct them to run \`opencode plugin @tarquinen/opencode-dcp@<version>\` (or use \`npm install --prefix ~/.config/opencode\` for cached installs).
`
