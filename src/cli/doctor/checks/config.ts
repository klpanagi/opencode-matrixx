import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { MatrixxConfigSchema } from "../../../config/schema/matrixx-config"
import { detectConfigFile, parseJsoncSafe } from "../../../shared/jsonc-parser"
import { getOpenCodeConfigDir } from "../../../shared/opencode-config-dir"
import type { CheckResult, DoctorCheck } from "../types"

function findConfigs(): Array<{ base: string; path: string; format: string; content: string }> {
  const userDir = getOpenCodeConfigDir({ binary: "opencode" })
  const bases = [join(process.cwd(), ".opencode", "matrixx"), join(process.cwd(), "matrixx"), join(userDir, "matrixx")]
  const results: Array<{ base: string; path: string; format: string; content: string }> = []
  for (const base of bases) {
    const detected = detectConfigFile(base)
    if (detected.format !== "none" && existsSync(detected.path)) {
      try {
        const content = readFileSync(detected.path, "utf-8")
        results.push({ base, path: detected.path, format: detected.format, content })
      } catch { void 0 }
    }
  }
  return results
}

export const configValidationCheck: DoctorCheck = {
  name: "config-validation",
  category: "configuration",
  check: (): CheckResult => {
    const configs = findConfigs()
    if (configs.length === 0) {
      return { name: "config-validation", status: "warn", message: "No matrixx configuration file found", detail: "→ fix: Create matrixx.jsonc in your project or ~/.config/opencode/" }
    }
    const multiLocation = configs.length > 1
    const bothExtensionsWarnings: string[] = []
    const userDir = getOpenCodeConfigDir({ binary: "opencode" })
    for (const base of [join(process.cwd(), ".opencode", "matrixx"), join(process.cwd(), "matrixx"), join(userDir, "matrixx")]) {
      const jsonPath = `${base}.json`
      const jsoncPath = `${base}.jsonc`
      if (existsSync(jsonPath) && existsSync(jsoncPath)) bothExtensionsWarnings.push(`Both ${jsonPath} and ${jsoncPath} exist — .jsonc takes precedence`)
    }
    for (const cfg of configs) {
      const parsed = parseJsoncSafe<Record<string, unknown>>(cfg.content)
      if (parsed.errors.length > 0) {
        const first = parsed.errors[0]
        return { name: "config-validation", status: "fail", message: `Invalid JSONC in ${cfg.path} at offset ${first?.offset ?? 0}: ${first?.message ?? "parse error"}`, detail: "→ fix: validate JSONC syntax at reported offset" }
      }
      if (!parsed.data || typeof parsed.data !== "object") {
        return { name: "config-validation", status: "fail", message: `Invalid config structure in ${cfg.path}`, detail: "→ fix: ensure file contains a JSON object" }
      }
      const data = parsed.data as Record<string, unknown>
      if (typeof data.$schema === "string" && data.$schema.trim() !== "") {
        try { new URL(data.$schema) } catch { return { name: "config-validation", status: "warn", message: `Invalid $schema URL in ${cfg.path}`, detail: `→ fix: $schema "${data.$schema}" is not a valid URL` } }
      }
      const zodResult = MatrixxConfigSchema.safeParse(parsed.data)
      if (!zodResult.success) {
        const issues = zodResult.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n")
        return { name: "config-validation", status: "fail", message: `Config validation failed in ${cfg.path}`, detail: `${issues}\n→ fix: correct fields per schema` }
      }
    }
    if (multiLocation) {
      const paths = configs.map((c) => c.path).join(", ")
      const detail = [`Multiple configs found: ${paths}`, "→ fix: keep one (project .opencode/matrixx.jsonc preferred)", ...bothExtensionsWarnings].join("\n")
      return { name: "config-validation", status: "warn", message: `Configuration valid but multiple configs present`, detail }
    }
    if (bothExtensionsWarnings.length > 0) {
      return { name: "config-validation", status: "warn", message: `Configuration valid at ${configs[0]?.path}`, detail: bothExtensionsWarnings.join("\n") }
    }
    return { name: "config-validation", status: "pass", message: `Configuration file is valid at ${configs[0]?.path}` }
  },
}
