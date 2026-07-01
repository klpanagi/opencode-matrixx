export const ULTRAWORK_TEMPLATE = `Toggle ultrawork mode for the current session.

This command will:
1. Enable ultrawork mode — injects ultrawork mode instructions into every message
2. Disable ultrawork mode — prevents ultrawork mode from activating (even on "ultrawork" keyword)
3. Show current ultrawork mode status

Usage:
  /ultrawork enable — Force ultrawork mode on all messages
  /ultrawork disable — Block ultrawork mode (keyword ignored)
  /ultrawork status — Show current state

The change is per-session and clears when the session ends.
By default, ultrawork mode activates when the LLM or user mentions the "ultrawork" keyword.`
