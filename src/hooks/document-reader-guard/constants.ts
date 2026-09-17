export const HOOK_NAME = "document-reader-guard"

export const BINARY_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".mp3",
  ".wav",
] as const

export const BLOCKED_PATTERNS: RegExp[] = [
  /\bpdftotext\b/,
  /\bpdfinfo\b/,
  /\bpandoc\b.*\.(pdf|docx?|xlsx?|pptx?)/,
  /\blibreoffice\b|\bsoffice\b/,
  /\bcat\s+[^|&;]*\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|mp3|wav)/,
  /\bhead\s+[^|&;]*\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|mp3|wav)/,
  /\btail\s+[^|&;]*\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|mp3|wav)/,
  /\bless\s+[^|&;]*\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|mp3|wav)/,
  /\bpython3?\b.*(fitz|pymupdf|pdfminer|pdfplumber|python-pptx|\bdocx\b|openpyxl|pillow|\bPIL\b)/,
  /\bpython3?\b[^|&;]*\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|mp3|wav)/,
  /\bmarkitdown\b/,
]

export const READ_BLOCK_MESSAGE =
  "[document-reader-guard] BLOCKED: Use document_reader__convert_to_markdown (document_reader MCP, Microsoft MarkItDown) for binary documents — generic Read cannot parse them. " +
  "Call convert_to_markdown with an absolute URI like file:///absolute/path/to/report.pdf, then summarize — do not dump raw output. " +
  "For context isolation delegate to the construct subagent so the main context stays clean."

export const BASH_BLOCK_MESSAGE =
  "[document-reader-guard] BLOCKED: Do not read documents via bash CLIs (pdftotext, pdfinfo, pandoc, libreoffice, cat/head/tail, python fitz/pypdf/pdfminer/pdfplumber/docx/openpyxl, markitdown CLI). " +
  "Use document_reader__convert_to_markdown with file:///absolute/path instead — delegate to construct for summarization."
