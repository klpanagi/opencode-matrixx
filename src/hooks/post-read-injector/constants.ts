export const MAX_DIRECTORY_CONTEXT_BYTES = 6144;
export const DIRECTORY_CONTEXT_HEADER = "Directory Context";
export const DIRECTORY_CONTEXT_SEPARATOR = "\n---\n";

export function buildTruncationMarker(omittedChars: number): string {
  return `\n[${DIRECTORY_CONTEXT_HEADER} truncated: ${omittedChars} chars omitted]`;
}
