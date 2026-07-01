export const CONSENSUS_TEMPLATE = `Toggle consensus tool availability for the current session.

This command will:
1. Enable the consensus tool — makes multi-model voting available to the LLM
2. Disable the consensus tool — hides it from the LLM for this session
3. Show current consensus tool status

Usage:
  /consensus enable — Show consensus tool
  /consensus disable — Hide consensus tool
  /consensus status — Show current state

The change is per-session and clears when the session ends.
By default, the consensus tool is enabled and available in every session.`
