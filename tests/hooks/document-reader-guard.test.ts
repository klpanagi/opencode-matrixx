/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import { BASH_BLOCK_MESSAGE, BLOCKED_PATTERNS, READ_BLOCK_MESSAGE } from "../../src/hooks/document-reader-guard/constants"
import { createDocumentReaderGuardHook } from "../../src/hooks/document-reader-guard"

function makeHook() {
  return createDocumentReaderGuardHook({ directory: "/tmp" } as unknown as PluginInput)
}

async function run(tool: string, args: Record<string, unknown>) {
  const hook = makeHook()
  const input = { tool, sessionID: "ses_1", callID: "call_1" }
  const output = { args }
  return hook["tool.execute.before"]?.(input, output)
}

describe("document-reader-guard: Read blocked on binary documents", () => {
  const blocked = ["report.pdf", "doc.docx", "doc.doc", "data.xlsx", "data.xls", "deck.pptx", "deck.ppt", "img.jpg", "img.jpeg", "img.png", "img.gif", "img.webp", "audio.mp3", "audio.wav"]
  for (const file of blocked) {
    test(`blocks Read on ${file}`, async () => {
      //#given a Read targeting a binary document
      //#when the guard runs
      const result = run("Read", { filePath: `/tmp/${file}` })
      //#then it throws the document_reader redirect
      await expect(result).rejects.toThrow(READ_BLOCK_MESSAGE)
    })
  }

  test("blocks Read via path alias", async () => {
    //#given a Read using the path alias
    //#when the guard runs
    const result = run("Read", { path: "/tmp/report.pdf" })
    //#then it throws
    await expect(result).rejects.toThrow(READ_BLOCK_MESSAGE)
  })

  test("blocks Read case-insensitively", async () => {
    //#given an uppercase extension
    //#when the guard runs
    const result = run("Read", { filePath: "/tmp/REPORT.PDF" })
    //#then it throws
    await expect(result).rejects.toThrow(READ_BLOCK_MESSAGE)
  })

  const allowed = ["notes.md", "notes.txt", "data.csv", "data.json", "data.xml", "page.html", "src/index.ts"]
  for (const file of allowed) {
    test(`allows Read on ${file}`, async () => {
      //#given a Read on plain text
      //#when the guard runs
      const result = run("Read", { filePath: `/tmp/${file}` })
      //#then it passes through
      await expect(result).resolves.toBeUndefined()
    })
  }
})

describe("document-reader-guard: bash CLI bypasses blocked", () => {
  const blockedCommands = [
    "pdftotext /tmp/a.pdf out",
    "pdfinfo /tmp/a.pdf",
    "pandoc /tmp/report.docx -o out.md",
    "libreoffice --headless --convert-to pdf /tmp/a.docx",
    "cat /tmp/report.pdf",
    "head /tmp/report.pdf",
    "tail /tmp/report.pdf",
    "less /tmp/report.pdf",
    'python3 -c "import fitz" /tmp/a.pdf',
    'python -c "import pdfminer" /tmp/a.pdf',
    "python3 /tmp/read_docx.py /tmp/a.docx",
    "markitdown /tmp/report.pdf",
  ]
  for (const command of blockedCommands) {
    test(`blocks bash: ${command.slice(0, 40)}`, async () => {
      //#given a bash CLI bypass
      //#when the guard runs
      const result = run("bash", { command })
      //#then it throws the bash redirect
      await expect(result).rejects.toThrow(BASH_BLOCK_MESSAGE)
    })
  }

  test("BLOCKED_PATTERNS covers CLI families", () => {
    //#given the constants module
    //#when inspecting patterns
    //#then every bypass family is represented
    const joined = BLOCKED_PATTERNS.map((rx) => rx.source).join("\n")
    for (const tool of ["pdftotext", "pdfinfo", "pandoc", "libreoffice", "cat", "head", "tail", "less", "python", "markitdown"]) {
      expect(joined).toContain(tool)
    }
  })

  const allowedCommands = ["ls -la /tmp", "grep -r foo src/", "cat /tmp/notes.md", "python3 -c \"print(1)\""]
  for (const command of allowedCommands) {
    test(`allows bash: ${command.slice(0, 40)}`, async () => {
      //#given an unrelated command
      //#when the guard runs
      const result = run("bash", { command })
      //#then it passes through
      await expect(result).resolves.toBeUndefined()
    })
  }
})
