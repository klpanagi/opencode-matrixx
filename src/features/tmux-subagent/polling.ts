import type { PluginInput } from "@opencode-ai/plugin"
import type { TmuxConfig } from "../../config/schema"
import { log } from "../../shared"
import {
  POLL_INTERVAL_BACKGROUND_MS,
  SESSION_MISSING_GRACE_MS,
} from "../../shared/tmux"
import { executeAction } from "./action-executor"
import { queryWindowState } from "./pane-state-querier"
import {
  MIN_STABILITY_TIME_MS,
  SESSION_TIMEOUT_MS,
  STABLE_POLLS_REQUIRED,
} from "./polling-constants"
import { getMessageCount } from "./session-message-count"
import { waitForSessionReady as waitForSessionReadyFromClient } from "./session-ready-waiter"
import { parseSessionStatusMap } from "./session-status-parser"
import type { TrackedSession } from "./types"

type OpencodeClient = PluginInput["client"]

interface SessionPollingController {
  startPolling: () => void
  stopPolling: () => void
  closeSessionById: (sessionId: string) => Promise<void>
  waitForSessionReady: (sessionId: string) => Promise<boolean>
  pollSessions: () => Promise<void>
}

