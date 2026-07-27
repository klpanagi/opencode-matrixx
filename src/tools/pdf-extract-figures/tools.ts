import { existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type ToolDefinition, tool } from "@opencode-ai/plugin/tool"
import { log } from "../../shared"

const PYTHON_SCRIPT = `#!/usr/bin/env python3
import sys
import json
import os
import fitz

def extract_figures(pdf_path, output_dir=None, page=None, min_width=0, min_height=0, min_area=0, json_only=False):
    doc = fitz.open(pdf_path)
    results = []

    for page_num in range(doc.page_count):
        if page is not None and page_num + 1 != page:
            continue

        page_obj = doc[page_num]
        page_images = page_obj.get_images(full=True)

        for img_idx, img_info in enumerate(page_images):
            xref = img_info[0]
            base_image = doc.extract_image(xref)

            if base_image["width"] < min_width or base_image["height"] < min_height:
                continue
            if base_image["width"] * base_image["height"] < min_area:
                continue

            bbox_str = "no_position"
            area = 0
            try:
                rects = page_obj.get_image_rects(xref)
                if rects:
                    rect = rects[0]
                    bbox_str = f"{rect.x0:.0f},{rect.y0:.0f},{rect.x1:.0f},{rect.y1:.0f}"
                    area = rect.width * rect.height
            except Exception:
                pass

            info = {
                "xref": xref,
                "page": page_num + 1,
                "img_idx": img_idx,
                "ext": base_image["ext"],
                "width": base_image["width"],
                "height": base_image["height"],
                "file_size": len(base_image["image"]),
                "bbox": bbox_str,
                "area": area,
            }

            if output_dir and not json_only:
                os.makedirs(output_dir, exist_ok=True)
                filename = f"p{page_num+1}_xref{xref}.{base_image['ext']}"
                filepath = os.path.join(output_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(base_image["image"])
                info["saved_path"] = filepath

            results.append(info)

    page_count = doc.page_count
    doc.close()

    output = {
        "pdf_path": pdf_path,
        "page_count": page_count,
        "images_found": len(results),
        "images": results,
    }
    print(json.dumps(output, indent=2))

if __name__ == "__main__":
    args = json.loads(sys.argv[1])
    extract_figures(**args)
`

function ensurePythonAvailable(): string | null {
  try {
    const result = Bun.spawnSync(["python3", "--version"], { stdout: "pipe", stderr: "pipe" })
    if (result.exitCode !== 0) {
      return "Python3 is not available in PATH. Install Python 3.8+ to use this tool."
    }
  } catch {
    return "Python3 is not available in PATH. Install Python 3.8+ to use this tool."
  }

  try {
    const result = Bun.spawnSync(["python3", "-c", "import fitz; print(fitz.__version__)"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) {
      return (
        "PyMuPDF (fitz) is not installed. Install it with: pip install PyMuPDF\n" +
        `stderr: ${result.stderr?.toString() || "unknown"}`
      )
    }
  } catch {
    return (
      "PyMuPDF (fitz) is not available. Install it with: pip install PyMuPDF"
    )
  }

  return null
}

export interface PdfExtractFiguresArgs {
  file_path: string
  output_dir?: string
  page?: number
  min_width?: number
  min_height?: number
  min_area?: number
  json_only?: boolean
}

function validateArgs(args: PdfExtractFiguresArgs): string | null {
  if (!args.file_path) {
    return "Error: 'file_path' is required."
  }
  if (!existsSync(args.file_path)) {
    return `Error: File not found: ${args.file_path}`
  }
  if (!args.file_path.toLowerCase().endsWith(".pdf")) {
    return `Error: File must be a PDF: ${args.file_path}`
  }
  if (args.page !== undefined && (args.page < 1 || !Number.isInteger(args.page))) {
    return "Error: 'page' must be a positive integer."
  }
  if (args.min_width !== undefined && args.min_width < 0) {
    return "Error: 'min_width' must be non-negative."
  }
  if (args.min_height !== undefined && args.min_height < 0) {
    return "Error: 'min_height' must be non-negative."
  }
  if (args.min_area !== undefined && args.min_area < 0) {
    return "Error: 'min_area' must be non-negative."
  }
  return null
}

function buildArgsPayload(args: PdfExtractFiguresArgs): string {
  const payload: Record<string, unknown> = { pdf_path: args.file_path }

  if (args.output_dir) {
    payload.output_dir = args.output_dir
  }
  if (args.page !== undefined) {
    payload.page = args.page
  }
  if (args.min_width !== undefined) {
    payload.min_width = args.min_width
  }
  if (args.min_height !== undefined) {
    payload.min_height = args.min_height
  }
  if (args.min_area !== undefined) {
    payload.min_area = args.min_area
  }
  if (args.json_only !== undefined) {
    payload.json_only = args.json_only
  }

  return JSON.stringify(payload)
}

async function runExtraction(args: PdfExtractFiguresArgs): Promise<string> {
  const pythonCheck = ensurePythonAvailable()
  if (pythonCheck) {
    return pythonCheck
  }

  // Write Python script to temp file
  let tmpDir: string
  try {
    tmpDir = mkdtempSync(join(tmpdir(), "matrixx-pdf-extract-"))
  } catch {
    return "Error: Could not create temporary directory."
  }

  const scriptPath = join(tmpDir, "extract_pdf_figures.py")
  writeFileSync(scriptPath, PYTHON_SCRIPT)

  const payload = buildArgsPayload(args)
  log("[pdf_extract_figures] Running extraction", { file_path: args.file_path, payload })

  const proc = Bun.spawn(["python3", scriptPath, payload], {
    stdout: "pipe",
    stderr: "pipe",
  })

  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  // Clean up temp file
  try {
    const { unlinkSync, rmdirSync } = await import("node:fs")
    unlinkSync(scriptPath)
    rmdirSync(tmpDir)
  } catch {
    // Non-fatal cleanup failure
  }

  if (exitCode !== 0) {
    log("[pdf_extract_figures] Python script failed", { exitCode, stderr })
    return `Error: PDF extraction failed (exit code ${exitCode}).\nstderr: ${stderr}`
  }

  return stdout
}

export function createPdfExtractFiguresTool(): Record<string, ToolDefinition> {
  const pdf_extract_figures: ToolDefinition = tool({
    description:
      "Extract embedded images/figures from PDF files using PyMuPDF. " +
      "Returns structured metadata (page number, dimensions, format, file size, position) " +
      "for every image found. Optionally saves images to a specified output directory. " +
      "Useful for extracting figures, diagrams, charts, and photos from PDF documents. " +
      "Requires Python 3.8+ with PyMuPDF installed (pip install PyMuPDF).",
    args: {
      file_path: tool.schema
        .string()
        .describe("Absolute path to the PDF file to extract images from"),
      output_dir: tool.schema
        .string()
        .optional()
        .describe(
          "Directory to save extracted image files. " +
            "If omitted, only JSON metadata is returned (no files saved).",
        ),
      page: tool.schema
        .number()
        .optional()
        .describe("Only extract images from this specific page number (1-indexed)"),
      min_width: tool.schema
        .number()
        .optional()
        .describe("Minimum image width in pixels (filters out smaller images like icons)"),
      min_height: tool.schema
        .number()
        .optional()
        .describe("Minimum image height in pixels (filters out smaller images like icons)"),
      min_area: tool.schema
        .number()
        .optional()
        .describe(
          "Minimum image area in square pixels (filters out small decorative elements)",
        ),
      json_only: tool.schema
        .boolean()
        .optional()
        .describe(
          "If true, only return JSON metadata without saving image files (overrides output_dir)",
        ),
    },
    async execute(rawArgs) {
      const args = rawArgs as unknown as PdfExtractFiguresArgs

      const validationError = validateArgs(args)
      if (validationError) {
        log(`[pdf_extract_figures] Validation failed: ${validationError}`)
        return validationError
      }

      return runExtraction(args)
    },
  })

  return { pdf_extract_figures }
}
