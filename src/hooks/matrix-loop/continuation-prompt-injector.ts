import { findNearestMessageWithFields } from "../../features/hook-message-injector"
import { resolveSessionSteering } from "../../features/session-steering"
import type { PluginContextSlice } from "../../plugin/types"
import { normalizeSDKResponse } from "../../shared"
import { log } from "../../shared/logger"
import { getMessageDir } from "./message-storage-directory"
import { withTimeout } from "./with-timeout"

type MessageInfo = {
	agent?: string
	model?: { providerID: string; modelID: string }
	modelID?: string
	providerID?: string
}

export async function injectContinuationPrompt(
	ctx: PluginContextSlice<"client">,
	options: { sessionID: string; prompt: string; directory: string; apiTimeoutMs: number },
): Promise<void> {
	let agent: string | undefined
	let model: { providerID: string; modelID: string } | undefined

	try {
		const messagesResp = await withTimeout(
			ctx.client.session.messages({
				path: { id: options.sessionID },
			}),
			options.apiTimeoutMs,
		)
		const messages = normalizeSDKResponse(messagesResp, [] as Array<{ info?: MessageInfo }>)
		for (let i = messages.length - 1; i >= 0; i--) {
			const info = messages[i]?.info
			if (info?.agent || info?.model || (info?.modelID && info?.providerID)) {
				agent = info.agent
				model =
					info.model ??
					(info.providerID && info.modelID
						? { providerID: info.providerID, modelID: info.modelID }
						: undefined)
				break
			}
		}
	} catch {
		const messageDir = getMessageDir(options.sessionID)
		const currentMessage = messageDir ? findNearestMessageWithFields(messageDir) : null
		agent = currentMessage?.agent
		model =
			currentMessage?.model?.providerID && currentMessage?.model?.modelID
				? {
					providerID: currentMessage.model.providerID,
					modelID: currentMessage.model.modelID,
				}
				: undefined
	}

	await resolveSessionSteering(ctx).deliver({
		sessionID: options.sessionID,
		text: options.prompt,
		directory: options.directory,
		...(agent !== undefined ? { agent } : {}),
		...(model !== undefined ? { model } : {}),
	})

	log("[matrix-loop] continuation injected", { sessionID: options.sessionID })
}
