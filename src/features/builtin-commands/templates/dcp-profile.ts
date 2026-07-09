export const DCP_PROFILE_TEMPLATE = `You are switching the active DCP (Dynamic Context Pruning) profile tier.

This command is provided by the Matrixx plugin to call a user-managed shell script that swaps the active DCP configuration. The script lives in the user's home directory and is not part of the Matrixx codebase.

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

## Step 2: Resolve the switch script path

The switch script location is configurable via the \`dcp.switch_script\` key in the user's \`matrixx.jsonc\` (read from \`~/.config/opencode/matrixx.jsonc\` or the project-level file). If that key is absent, use the default:

\`\`\`
~/.myopencode/dcp/switch-profile.sh
\`\`\`

If the resolved script does not exist or is not executable, stop and report the path to the user.

## Step 3: Determine the target profile

Parse the arguments passed to this command. The user invoked \`/dcp-profile <arguments>\` where \`<arguments>\` is the first positional argument.

- If the argument is a known profile name (one of: economy, balanced, performance, ultimate), use it directly.
- If the argument is empty or missing, read \`dcp.default_profile\` from the user's config; if absent, default to \`balanced\`.
- If the argument is not a recognized profile name, list the available profiles and stop. Do NOT guess or pass invalid names to the script.

## Step 4: Execute the switch script

Run the script via the bash tool. Capture both stdout and stderr. If the script exits with a non-zero status, show the captured stderr output to the user verbatim and stop. Do not swallow errors.

\`\`\`bash
"<resolved-switch-script>" "<profile-name>"
\`\`\`

## Step 5: Confirm and instruct

After a successful switch:

1. Report the script's stdout to the user.
2. Tell the user that the new DCP configuration will take effect after they restart their OpenCode session (the active session has already loaded the previous config into memory).
3. Do not attempt to reload DCP in-place; a session restart is required.

## Important constraints

- This command is a thin wrapper. All real logic lives in the user's switch script. Never bypass the script by writing to \`dcp.jsonc\` directly.
- Do not install, upgrade, or modify the DCP plugin from this command. If the user needs to install or upgrade DCP, instruct them to run \`opencode plugin @tarquinen/opencode-dcp@<version>\` (or use \`npm install --prefix ~/.config/opencode\` for cached installs).
- Do not edit any DCP config files (\`dcp-base.jsonc\`, \`dcp-<profile>.jsonc\`, \`dcp-generated-*.jsonc\`) as part of switching.`
