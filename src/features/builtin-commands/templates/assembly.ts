export const ASSEMBLY_TEMPLATE = `Toggle assembly tool availability for the current session.

This command will:
1. Enable the assembly tool — makes multi-model voting available to the LLM
2. Disable the assembly tool — hides it from the LLM for this session
3. Show current assembly tool status

Usage:
  /assembly enable — Show assembly tool
  /assembly disable — Hide assembly tool
  /assembly status — Show current state

The change is per-session and clears when the session ends.
By default, the assembly tool is enabled and available in every session.`
