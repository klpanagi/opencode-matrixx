import { log } from "../../../shared"

/**
 * The harm this module exists to prevent: a V2 response that is not the API —
 * SPA HTML, an unrecognisable body — being read as valid-but-empty data. The
 * previous adapter did exactly that, logging `providerCount: 0` as a success.
 *
 * Every read therefore goes through `unwrapV2Data`, which throws rather than
 * degrading to an empty value.
 */
export class V2ShimProtocolError extends Error {
  readonly member: string
  readonly url: string
  readonly contentType: string

  constructor(member: string, url: string, contentType: string, detail: string) {
    super(
      `[v2-client-shim] ${member}: V2 response was not the API (content-type=${contentType || "none"}). ` +
        `V2 serves its SPA at HTTP 200 for unknown paths, so an empty result here means the route is absent, ` +
        `not that data is empty. ${detail}`,
    )
    this.name = "V2ShimProtocolError"
    this.member = member
    this.url = url
    this.contentType = contentType
  }
}

const HTML_SNIFF = /^\s*(<!doctype\s+html|<html[\s>])/i

export function looksLikeHtml(text: string): boolean {
  return HTML_SNIFF.test(text)
}

/**
 * Reads a V2 fetch response, failing loudly on anything that is not JSON.
 *
 * The `{ data }` envelope is unwrapped here, because both the V1 SDK and the V2
 * client present it inconsistently and call sites already tolerate either.
 */
export async function unwrapV2Data<T>(member: string, response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? ""
  const text = await response.text()

  if (looksLikeHtml(text)) {
    log("[v2-client-shim] SPA response for a mapped route", { member, status: response.status, contentType })
    throw new V2ShimProtocolError(member, response.url, contentType, "body is HTML, so the route is not served by the V2 API")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new V2ShimProtocolError(member, response.url, contentType, `body is not JSON (${text.length} bytes)`)
  }

  if (parsed !== null && typeof parsed === "object" && "data" in parsed) {
    const data = (parsed as { data: unknown }).data
    if (data !== null && data !== undefined) return data as T
    // An explicit `data: null` is the API's own "no value" answer, distinct from
    // a body we failed to understand. Surface it as undefined, still no throw:
    // the route demonstrably works.
    return undefined as T
  }

  return parsed as T
}

/**
 * Rejects a value that should have been a populated collection but is not.
 *
 * Used where a caller distinguishes "no results" from "the call failed": an
 * absent list there would be indistinguishable from a working empty result,
 * which is the precise failure this module must not reintroduce.
 */
export function expectCollection<T>(member: string, value: unknown, context: string): T[] {
  if (value === undefined || value === null) {
    throw new V2ShimProtocolError(member, "n/a", "none", `${context}: V2 returned no data`)
  }
  if (!Array.isArray(value)) {
    throw new V2ShimProtocolError(
      member,
      "n/a",
      "application/json",
      `${context}: expected an array, received ${describe(value)}`,
    )
  }
  return value as T[]
}

function describe(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}
