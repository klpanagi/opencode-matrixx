export const document_reader = {
  type: "local" as const,
  command: ["uvx", "--from", "markitdown-mcp", "markitdown-mcp"],
  enabled: true,
}
