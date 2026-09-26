import { z } from "zod"
import type { V2ToolDefinition, V2ToolsRecord } from "../../plugin/types"
import {
  SESSION_INFO_DESCRIPTION,
  SESSION_LIST_DESCRIPTION,
  SESSION_READ_DESCRIPTION,
  SESSION_SEARCH_DESCRIPTION,
} from "./constants"
import {
  filterSessionsByDate,
  formatSearchResults,
  formatSessionInfo,
  formatSessionList,
  formatSessionMessages,
  searchInSession,
} from "./session-formatter"
import { getAllSessions, getMainSessions, getSessionInfo, readSessionMessages, readSessionTodos, sessionExists, setStorageClient } from "./storage"
import type { SearchResult, SessionInfoArgs, SessionListArgs, SessionReadArgs, SessionSearchArgs } from "./types"

const SEARCH_TIMEOUT_MS = 60_000
const MAX_SESSIONS_TO_SCAN = 50

import { withTimeout } from "../../shared/with-timeout"

export function createSessionManagerTools(ctx: { directory: string; client: ReturnType<typeof import("@opencode-ai/sdk").createOpencodeClient> }): V2ToolsRecord {
  // Initialize storage client for SDK-based operations (beta mode)
  setStorageClient(ctx.client)

  const session_list: V2ToolDefinition = {
    name: "session_list",
    description: SESSION_LIST_DESCRIPTION,
    input: z.object({
      limit: z.number().optional().describe("Maximum number of sessions to return"),
      from_date: z.string().optional().describe("Filter sessions from this date (ISO 8601 format)"),
      to_date: z.string().optional().describe("Filter sessions until this date (ISO 8601 format)"),
      project_path: z.string().optional().describe("Filter sessions by project path (default: current working directory)"),
    }),
    execute: async (args: SessionListArgs, _context) => {
      try {
        const directory = args.project_path ?? ctx.directory
        const sessions = await getMainSessions({ directory })
        let sessionIDs = sessions.map((s) => s.id)

        if (args.from_date || args.to_date) {
          sessionIDs = await filterSessionsByDate(sessionIDs, args.from_date, args.to_date)
        }

        if (args.limit && args.limit > 0) {
          sessionIDs = sessionIDs.slice(0, args.limit)
        }

        return { content: await (await formatSessionList(sessionIDs)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  const session_read: V2ToolDefinition = {
    name: "session_read",
    description: SESSION_READ_DESCRIPTION,
    input: z.object({
      session_id: z.string().describe("Session ID to read"),
      include_todos: z.boolean().optional().describe("Include todo list if available (default: false)"),
      include_transcript: z.boolean().optional().describe("Include transcript log if available (default: false)"),
      limit: z.number().optional().describe("Maximum number of messages to return (default: all)"),
    }),
    execute: async (args: SessionReadArgs, _context) => {
      try {
        if (!(await sessionExists(args.session_id))) {
          return { content: await (`Session not found: ${args.session_id}`) }
        }

        let messages = await readSessionMessages(args.session_id)

        if (messages.length === 0) {
          return { content: await (`Session not found: ${args.session_id}`) }
        }

        if (args.limit && args.limit > 0) {
          messages = messages.slice(0, args.limit)
        }

        const todos = args.include_todos ? await readSessionTodos(args.session_id) : undefined

        return { content: await (formatSessionMessages(messages, args.include_todos, todos)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  const session_search: V2ToolDefinition = {
    name: "session_search",
    description: SESSION_SEARCH_DESCRIPTION,
    input: z.object({
      query: z.string().describe("Search query string"),
      session_id: z.string().optional().describe("Search within specific session only (default: all sessions)"),
      case_sensitive: z.boolean().optional().describe("Case-sensitive search (default: false)"),
      limit: z.number().optional().describe("Maximum number of results to return (default: 20)"),
    }),
    execute: async (args: SessionSearchArgs, _context) => {
      try {
        const resultLimit = args.limit && args.limit > 0 ? args.limit : 20

        const searchOperation = async (): Promise<SearchResult[]> => {
          if (args.session_id) {
            return searchInSession(args.session_id, args.query, args.case_sensitive, resultLimit)
          }

          const allSessions = await getAllSessions()
          const sessionsToScan = allSessions.slice(0, MAX_SESSIONS_TO_SCAN)

          const allResults: SearchResult[] = []
          for (const sid of sessionsToScan) {
            if (allResults.length >= resultLimit) break

            const remaining = resultLimit - allResults.length
            const sessionResults = await searchInSession(sid, args.query, args.case_sensitive, remaining)
            allResults.push(...sessionResults)
          }

          return allResults.slice(0, resultLimit)
        }

        const results = await withTimeout(searchOperation(), SEARCH_TIMEOUT_MS, "Search")

        return { content: await (formatSearchResults(results)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  const session_info: V2ToolDefinition = {
    name: "session_info",
    description: SESSION_INFO_DESCRIPTION,
    input: z.object({
      session_id: z.string().describe("Session ID to inspect"),
    }),
    execute: async (args: SessionInfoArgs, _context) => {
      try {
        const info = await getSessionInfo(args.session_id)

        if (!info) {
          return { content: await (`Session not found: ${args.session_id}`) }
        }

        return { content: await (formatSessionInfo(info)) }
      } catch (e) {
        return { content: await (`Error: ${e instanceof Error ? e.message : String(e)}`) }
      }
    },
  }

  return { session_list, session_read, session_search, session_info }
}
