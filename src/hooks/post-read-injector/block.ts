import {
  buildTruncationMarker,
  DIRECTORY_CONTEXT_HEADER,
  DIRECTORY_CONTEXT_SEPARATOR,
  MAX_DIRECTORY_CONTEXT_BYTES,
} from "./constants";

export function buildDirectoryContextBlock(sections: string[]): string {
  const header = `\n\n[${DIRECTORY_CONTEXT_HEADER}]\n`;
  const fullBody = sections.join(DIRECTORY_CONTEXT_SEPARATOR);
  const full = `${header}${fullBody}`;
  if (full.length <= MAX_DIRECTORY_CONTEXT_BYTES) return full;
  const probeMarker = buildTruncationMarker(fullBody.length);
  const allowedBody = MAX_DIRECTORY_CONTEXT_BYTES - header.length - probeMarker.length;
  const sliced = fullBody.slice(0, Math.max(0, allowedBody));
  const omitted = fullBody.length - sliced.length;
  const marker = buildTruncationMarker(omitted);
  const block = `${header}${sliced}${marker}`;
  if (block.length <= MAX_DIRECTORY_CONTEXT_BYTES) return block;
  const overflow = block.length - MAX_DIRECTORY_CONTEXT_BYTES;
  return `${header}${sliced.slice(0, Math.max(0, sliced.length - overflow))}${marker}`;
}
