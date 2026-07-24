import { type ToolDefinition, tool } from "@opencode-ai/plugin"
import type { createOpencodeClient } from "@opencode-ai/sdk"
import { type BuiltinSkill, createBuiltinSkills } from "../../features/builtin-skills"
import { discoverCommandsSync } from "./command-discovery"
import { formatCommandList, formatLoadedCommand } from "./command-output-formatter"
import { skillToCommandInfo } from "./skill-command-converter"
import { buildDescriptionFromItems, TOOL_DESCRIPTION_PREFIX } from "./slashcommand-description"
import { log } from "../../shared"
import type { CommandInfo, SlashcommandToolOptions } from "./types"

async function discoverPluginCommands(client?: ReturnType<typeof createOpencodeClient>): Promise<CommandInfo[]> {
  if (!client) return []

  try {
    const result = await client.command.list()
    const commands = result.data ?? []
    return commands.map(cmd => ({
      name: cmd.name,
      metadata: {
        name: cmd.name,
        description: cmd.description || "",
        model: typeof cmd.model === "string" ? cmd.model : undefined,
        agent: cmd.agent,
        subtask: cmd.subtask,
      },
      content: typeof cmd.template === "string" ? cmd.template : undefined,
      scope: "plugin" as const,
    }))
  } catch (err) {
    log(`[slashcommand] Failed to discover plugin commands:`, err)
    return []
  }
}

export function createSlashcommandTool(options: SlashcommandToolOptions = {}): ToolDefinition {
  let cachedCommands: CommandInfo[] | null = options.commands ?? null
  let cachedSkills: BuiltinSkill[] | null = options.skills ?? null
  let cachedPluginCommands: CommandInfo[] | null = null
  let cachedDescription: string | null = null
  const { client } = options

  const getCommands = (): CommandInfo[] => {
    if (cachedCommands) return cachedCommands
    cachedCommands = discoverCommandsSync()
    return cachedCommands
  }

  const getSkills = (): BuiltinSkill[] => {
    if (cachedSkills) return cachedSkills
    cachedSkills = createBuiltinSkills()
    return cachedSkills
  }

  const getPluginCommands = async (): Promise<CommandInfo[]> => {
    if (cachedPluginCommands) return cachedPluginCommands
    cachedPluginCommands = await discoverPluginCommands(client)
    return cachedPluginCommands
  }

  const getAllItems = async (): Promise<CommandInfo[]> => {
    const commands = getCommands()
    const skills = getSkills()
    const pluginCommands = await getPluginCommands()
    return [...commands, ...skills.map(skillToCommandInfo), ...pluginCommands]
  }

  const buildDescription = async (): Promise<string> => {
    if (cachedDescription) return cachedDescription
    const commands = getCommands()
    cachedDescription = buildDescriptionFromItems(commands)
    return cachedDescription
  }

  if (options.commands !== undefined) {
    cachedDescription = buildDescriptionFromItems(options.commands)
  } else {
    void buildDescription()
  }

  return tool({
    get description() {
      return cachedDescription ?? TOOL_DESCRIPTION_PREFIX
    },

    args: {
      command: tool.schema
        .string()
        .describe(
          "The slash command name (without leading slash). E.g., 'publish', 'commit', 'plan'"
        ),
      user_message: tool.schema
        .string()
        .optional()
        .describe(
          "Optional arguments or context to pass to the command. E.g., for '/publish patch', command='publish' user_message='patch'"
        ),
    },

    async execute(args) {
      const allItems = await getAllItems()

      if (!args.command) {
        return `${formatCommandList(allItems)}\n\nProvide a command or skill name to execute.`
      }

      const commandName = args.command.replace(/^\//, "")

      const exactMatch = allItems.find(
        (command) => command.name.toLowerCase() === commandName.toLowerCase()
      )

      if (exactMatch) {
        return await formatLoadedCommand(exactMatch, args.user_message)
      }

      const partialMatches = allItems.filter((command) =>
        command.name.toLowerCase().includes(commandName.toLowerCase())
      )

      if (partialMatches.length > 0) {
        const matchList = partialMatches.map((command) => `/${command.name}`).join(", ")
        return `No exact match for "/${commandName}". Did you mean: ${matchList}?\n\n${formatCommandList(allItems)}`
      }

      return `Command "/${commandName}" not found. Use the slashcommand tool with just a command name to list available commands.\n\n${formatCommandList(allItems)}`
    },
  })
}

export const slashcommand: ToolDefinition = createSlashcommandTool()
