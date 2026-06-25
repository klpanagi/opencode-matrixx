/**
 * Handoff Storage Constants
 *
 * File path constants for the handoff feature. Defined locally to keep the
 * handoff module self-contained — no dependency on `mission-state/constants`.
 */

const HANDOFF_DIR = ".matrixx"
const HANDOFF_FILENAME = "handoff.md"
const HANDOFF_CONSUMED_FILENAME = "handoff.consumed.md"

export const HANDOFF_FILE_PATH = `${HANDOFF_DIR}/${HANDOFF_FILENAME}`
export const HANDOFF_CONSUMED_FILE_PATH = `${HANDOFF_DIR}/${HANDOFF_CONSUMED_FILENAME}`
