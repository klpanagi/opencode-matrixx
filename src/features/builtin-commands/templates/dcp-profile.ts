export const DCP_PROFILE_TEMPLATE = `You are switching the active DCP (Dynamic Context Pruning) profile tier.

This command is provided by the Matrixx plugin. It applies the tier by setting \`dcp.default_profile\` in the Matrixx configuration — the plugin writes the full inline DCP config to \`~/.config/opencode/dcp.jsonc\` on next startup. No external scripts needed.

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

- If the argument is a known profile name (one of: economy, balanced, performance, ultimate, brutal), use it directly.
- If the argument is empty or missing, read \`dcp.default_profile\` from the user's \`matrixx.jsonc\` config; if absent, default to \`balanced\`.
- If the argument is not a recognized profile name, list the available profiles and stop. Do NOT guess or pass invalid names.

## Step 3: Set dcp.default_profile in the Matrixx config

Read the project Matrixx config (\`<project>/matrixx.jsonc\`, falling back to \`~/.config/opencode/matrixx.jsonc\`). Set \`"dcp": { "default_profile": "<tier>" }\`, preserving every other key. Use the edit tool — do NOT rewrite the file from scratch.

## Step 4: Confirm and instruct

After updating the config:

1. Report the new default profile to the user.
2. Tell the user that the new DCP configuration will take effect after they restart their OpenCode session (the plugin applies \`default_profile\` on startup and writes \`~/.config/opencode/dcp.jsonc\`).
3. Do not attempt to reload DCP in-place; a session restart is required.
4. Mention that DCP's own \`/dcp\` panel command is intercepted by the DCP plugin (it never appears in command autocomplete — type it literally), and that \`/dcp-compress [focus]\` triggers one manual compression pass.
5. Mention that DCP-guided compression is transcript-indistinguishable from a bare call (same \`compress\` tool name, no markers) — verify it happened via the DCP daily log at \`~/.config/opencode/logs/dcp/daily/\` ("Applied manual prompt" / "Recorded compression start"), not the transcript. This is expected when \`pruneNotification\` is off or \`summaryBuffer\` is false.

## Important constraints

- Do NOT edit \`~/.config/opencode/dcp.jsonc\` directly — it is generated from the Matrixx config on plugin startup.
- Do not install, upgrade, or modify the DCP plugin from this command. If the user needs to install or upgrade DCP, instruct them to run \`opencode plugin @tarquinen/opencode-dcp@<version>\` (or use \`npm install --prefix ~/.config/opencode\` for cached installs).
`
