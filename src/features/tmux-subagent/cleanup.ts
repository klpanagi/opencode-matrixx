import type { TmuxConfig } from "../../config/schema"
import { log } from "../../shared"
import { executeAction } from "./action-executor"
import { queryWindowState } from "./pane-state-querier"
import type { TrackedSession } from "./types"

