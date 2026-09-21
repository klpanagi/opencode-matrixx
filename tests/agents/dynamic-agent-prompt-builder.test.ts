/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test"
import {
  type AvailableAgent,
  type AvailableCategory,
  type AvailableSkill,
  buildArchitectReferralSection,
  buildCategorySkillsDelegationGuide,
  buildUltraworkSection,
  formatCustomSkillsBlock,
  categorizeTools,
  buildContextDisciplineSection,
  buildHeadroomSection,
  buildCompactContextDisciplineSection,
  buildExploreDisciplineSection,
  fallbackCompactDiscipline,
  fallbackFullDiscipline,
} from "../../src/agents/dynamic-agent-prompt-builder"

describe("buildCategorySkillsDelegationGuide", () => {
  const categories: AvailableCategory[] = [
    { name: "construct", description: "Frontend, UI/UX" },
    { name: "quick", description: "Trivial tasks" },
  ]

  const builtinSkills: AvailableSkill[] = [
    { name: "playwright", description: "Browser automation via Playwright", location: "plugin" },
    { name: "frontend-ui-ux", description: "Designer-turned-developer", location: "plugin" },
  ]

  const customUserSkills: AvailableSkill[] = [
    { name: "react-19", description: "React 19 patterns and best practices", location: "user" },
    { name: "tailwind-4", description: "Tailwind CSS v4 utilities", location: "user" },
  ]

  const customProjectSkills: AvailableSkill[] = [
    { name: "our-design-system", description: "Internal design system components", location: "project" },
  ]

  it("should separate builtin and custom skills into distinct sections", () => {
    //#given: mix of builtin and custom skills
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should have separate sections
    expect(result).toContain("Built-in Skills")
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
  })

  it("should include custom skill names in CRITICAL warning", () => {
    //#given: custom skills installed
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should mention custom skills by name in the warning
    expect(result).toContain('"react-19"')
    expect(result).toContain('"tailwind-4"')
    expect(result).toContain("CRITICAL")
  })

  it("should show source column for custom skills (user vs project)", () => {
    //#given: both user and project custom skills
    const allSkills = [...builtinSkills, ...customUserSkills, ...customProjectSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show source for each custom skill
    expect(result).toContain("| user |")
    expect(result).toContain("| project |")
  })

  it("should not show custom skill section when only builtin skills exist", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should not contain custom skill emphasis
    expect(result).not.toContain("User-Installed Skills")
    expect(result).not.toContain("HIGH PRIORITY")
    expect(result).toContain("Available Skills")
  })

  it("should handle only custom skills (no builtins)", () => {
    //#given: only custom skills, no builtins
    const allSkills = [...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: should show custom skills with emphasis, no builtin section
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
    expect(result).not.toContain("Built-in Skills")
  })

  it("should include priority note for custom skills in evaluation step", () => {
    //#given: custom skills present
    const allSkills = [...builtinSkills, ...customUserSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: evaluation section should mention user-installed priority
    expect(result).toContain("User-installed skills get PRIORITY")
    expect(result).toContain("INCLUDE it rather than omit it")
  })

  it("should NOT include priority note when no custom skills", () => {
    //#given: only builtin skills
    const allSkills = [...builtinSkills]

    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide(categories, allSkills)

    //#then: no priority note for custom skills
    expect(result).not.toContain("User-installed skills get PRIORITY")
  })

  it("should return empty string when no categories and no skills", () => {
    //#given: no categories and no skills
    //#when: building the delegation guide
    const result = buildCategorySkillsDelegationGuide([], [])

    //#then: should return empty string
    expect(result).toBe("")
  })
})

describe("buildUltraworkSection", () => {
  const agents: AvailableAgent[] = []

  it("should separate builtin and custom skills", () => {
    //#given: mix of builtin and custom skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
      { name: "react-19", description: "React 19 patterns", location: "user" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have separate sections
    expect(result).toContain("Built-in Skills")
    expect(result).toContain("User-Installed Skills")
    expect(result).toContain("HIGH PRIORITY")
  })

  it("should not separate when only builtin skills", () => {
    //#given: only builtin skills
    const skills: AvailableSkill[] = [
      { name: "playwright", description: "Browser automation", location: "plugin" },
    ]

    //#when: building ultrawork section
    const result = buildUltraworkSection(agents, [], skills)

    //#then: should have single section
    expect(result).toContain("Built-in Skills")
    expect(result).not.toContain("User-Installed Skills")
  })
})

describe("formatCustomSkillsBlock", () => {
  const customSkills: AvailableSkill[] = [
    { name: "react-19", description: "React 19 patterns", location: "user" },
    { name: "tailwind-4", description: "Tailwind v4", location: "project" },
  ]

  const customRows = customSkills.map((s) => {
    const source = s.location === "project" ? "project" : "user"
    return `| \`${s.name}\` | ${s.description} | ${source} |`
  })

  it("should produce consistent output used by both builders", () => {
    //#given: custom skills and rows
    //#when: formatting with default header level
    const result = formatCustomSkillsBlock(customRows, customSkills)

    //#then: contains all expected elements
    expect(result).toContain("User-Installed Skills (HIGH PRIORITY)")
    expect(result).toContain("CRITICAL")
    expect(result).toContain('"react-19"')
    expect(result).toContain('"tailwind-4"')
    expect(result).toContain("| user |")
    expect(result).toContain("| project |")
  })

  it("should use #### header by default", () => {
    //#given: default header level
    const result = formatCustomSkillsBlock(customRows, customSkills)

    //#then: uses markdown h4
    expect(result).toContain("#### User-Installed Skills")
  })

  it("should use bold header when specified", () => {
    //#given: bold header level (used by Architect)
    const result = formatCustomSkillsBlock(customRows, customSkills, "**")

    //#then: uses bold instead of h4
    expect(result).toContain("**User-Installed Skills (HIGH PRIORITY):**")
    expect(result).not.toContain("#### User-Installed Skills")
  })
})

describe("categorizeTools", () => {

  it("should categorize ctx_* tools as sandbox", () => {
    //#given: ctx_* tool names
    const toolNames = ["ctx_execute", "ctx_batch_execute", "ctx_execute_file", "ctx_search", "ctx_fetch_and_index"]

    //#when: categorizing
    const result = categorizeTools(toolNames)

    //#then: all categorized as sandbox
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
    expect(result).toHaveLength(5)
  })

  it("should categorize lsp_* tools as lsp", () => {
    //#given: lsp tool names
    const result = categorizeTools(["lsp_diagnostics", "lsp_rename"])

    //#then: all lsp
    expect(result.every((t) => t.category === "lsp")).toBe(true)
  })

  it("should categorize ast_grep tools as ast", () => {
    //#given: ast_grep tools
    const result = categorizeTools(["ast_grep_search", "ast_grep_replace"])

    //#then: all ast
    expect(result.every((t) => t.category === "ast")).toBe(true)
  })

  it("should categorize grep and glob as search", () => {
    //#given: grep and glob
    const result = categorizeTools(["grep", "glob"])

    //#then: both search
    expect(result.every((t) => t.category === "search")).toBe(true)
  })

  it("should categorize unknown tools as other", () => {
    //#given: tools with no recognized prefix
    const result = categorizeTools(["write", "read", "edit", "bash"])

    //#then: all other
    expect(result.every((t) => t.category === "other")).toBe(true)
  })

  it("should categorize mixed tool list correctly", () => {
    //#given: mixed tools
    const toolNames = [
      "ctx_execute", "lsp_diagnostics", "grep", "ast_grep_search",
      "write", "ctx_search", "glob", "unknown_tool",
    ]

    //#when
    const result = categorizeTools(toolNames)

    //#then: each has correct category
    const byCategory = (cat: string) => result.filter((t) => t.category === cat).map((t) => t.name)
    expect(byCategory("sandbox")).toEqual(["ctx_execute", "ctx_search"])
    expect(byCategory("lsp")).toEqual(["lsp_diagnostics"])
    expect(byCategory("search")).toEqual(["grep", "glob"])
    expect(byCategory("ast")).toEqual(["ast_grep_search"])
    expect(byCategory("other")).toEqual(["write", "unknown_tool"])
  })
})

describe("buildContextDisciplineSection", () => {

  it("should return empty string when context-mode not available", () => {
    //#given: hasContextMode = false
    const result = buildContextDisciplineSection(false)

    //#then: empty
    expect(result).toBe("")
  })

  it("should return empty string by default", () => {
    //#given: default parameter
    const result = buildContextDisciplineSection()

    //#then: empty (defaults to false)
    expect(result).toBe("")
  })

  it("should render discipline table when context-mode is available", () => {
    //#given: hasContextMode = true (runtime file or fallback)
    const result = buildContextDisciplineSection(true)

    //#then: contains ctx guidance in either form
    expect(result.includes("Context Discipline") || result.includes("context-mode")).toBe(true)
    expect(result).toContain("ctx_")
    expect(result).toContain("ctx_search")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result.includes("ctx_stats") || result.includes("ctx_execute")).toBe(true)
  })

  it("should mention all 7 scenarios in the table", () => {
    //#given: loader returns fallback table or runtime file
    const result = buildContextDisciplineSection(true)

    //#then: fallback rows OR runtime markers
    const isFallback = result.includes("Analysis / Processing")
    const isRuntime = result.includes("Think in Code") || result.includes("BLOCKED") || result.includes("Tool selection")
    expect(isFallback || isRuntime).toBe(true)
    if (isFallback) {
      expect(result).toContain("Analysis / Processing")
      expect(result).toContain("Edits")
      expect(result).toContain("Observation")
      expect(result).toContain("State Mutation")
      expect(result).toContain("Run Scripts")
      expect(result).toContain("Search")
      expect(result).toContain("Docs / Web")
      expect(result).toContain("Compression")
    }
  })

  it("should include Run Scripts row in fallbackFullDiscipline", () => {
    //#given: full fallback table (no grep/glob)
    const result = fallbackFullDiscipline(false)
    //#then: Run Scripts row present with language options
    expect(result).toContain("Run Scripts")
    expect(result).toContain("python")
    expect(result).toContain("shell")
    expect(result).toContain("ruby")
    expect(result).toContain("go")
    expect(result).toContain("rust")
    expect(result).toContain("bash+python")
  })

  it("should include Run Scripts row in fallbackCompactDiscipline", () => {
    //#given: compact fallback table (no grep/glob)
    const result = fallbackCompactDiscipline(false)
    //#then: Run Scripts row present with language options
    expect(result).toContain("Run Scripts")
    expect(result).toContain("python")
    expect(result).toContain("shell")
    expect(result).toContain("ruby")
    expect(result).toContain("go")
    expect(result).toContain("rust")
    expect(result).toContain("bash+python")
  })
})

describe("buildHeadroomSection", () => {
  it("should return empty string when headroom not available", () => {
    //#given: hasHeadroom false
    const result = buildHeadroomSection(false)
    //#then: empty
    expect(result).toBe("")
  })

  it("should return empty string by default", () => {
    //#given: default param
    const result = buildHeadroomSection()
    //#then: empty
    expect(result).toBe("")
  })

  it("should render headroom table when available", () => {
    //#given: hasHeadroom true
    const result = buildHeadroomSection(true)
    //#then: contains expected parts
    expect(result).toContain("Headroom Proxy Discipline")
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("headroom_search")
    expect(result).toContain("headroom_stats")
    expect(result).toContain("HEADROOM_PROXY_URL")
    expect(result).toContain("127.0.0.1:8787")
    expect(result).toContain("L4")
  })

  it("should mention transport-level complement note", () => {
    //#given
    const result = buildHeadroomSection(true)
    //#then
    expect(result).toContain("CacheAligner")
    expect(result).toContain("L1 RTK")
  })

  it("should disambiguate compression ownership (DCP tool vs bare call)", () => {
    //#given headroom available
    const result = buildHeadroomSection(true)
    //#then compression ownership is explicit, never invoke foreign command
    expect(result).toContain("Compression ownership")
    expect(result).toContain("the `compress` tool is DCP's")
    expect(result).toContain("invoke /dcp-compress")
  })

  it("should state per-mode compression guidance", () => {
    //#given every DCP compression mode
    const guided = buildHeadroomSection(true, "guided")
    const manual = buildHeadroomSection(true, "manual")
    const inactive = buildHeadroomSection(true, "none")
    //#then each variant carries its own trigger/nudge context rule
    // old->new (Wave 1 min-band reword): guided "only with trigger/nudge context"
    // => "proactive on closed sections with IDs + headroom/ctx_stats signals".
    // Min-band (10-20%) delivers anchors + message-ID tags with empty nudge
    // bodies, so guided permits proactive compress instead of deadlocking on a
    // trigger/nudge gate. Manual/inactive expectations unchanged.
    expect(guided).toContain("proactive on closed sections")
    expect(manual).toContain("only after the manual trigger")
    expect(inactive).toContain("No `compress` tool exists (DCP inactive)")
  })
})

describe("DCP min-band semantics (guided proactive compress)", () => {
  it("guided full-table row permits proactive compress on closed sections with IDs + usage signals", () => {
    //#given guided DCP auto-mode fallback discipline
    const guided = fallbackFullDiscipline(true, "guided")
    //#when reading the Compression row
    //#then proactive wording present, no CRITICAL WARNING, no sole-gate phrasing, no "immediate"
    expect(guided).toContain("proactive on closed sections")
    expect(guided).toContain("ctx_stats")
    expect(guided).not.toContain("CRITICAL WARNING")
    expect(guided).not.toContain("only with trigger/nudge")
    expect(guided).not.toContain("only after")
    expect(guided.toLowerCase()).not.toContain("immediate")
  })

  it("guided compact-table row permits proactive compress on closed sections with IDs + usage signals", () => {
    //#given guided DCP auto-mode compact fallback discipline
    const guided = fallbackCompactDiscipline(true, "guided")
    //#when reading the Compression row
    //#then same min-band wording as the full table
    expect(guided).toContain("proactive on closed sections")
    expect(guided).toContain("ctx_stats")
    expect(guided).not.toContain("CRITICAL WARNING")
    expect(guided).not.toContain("only with trigger/nudge")
    expect(guided.toLowerCase()).not.toContain("immediate")
  })

  it("guided wording retains the never-bare-without-IDs ban in all three builders", () => {
    //#given guided mode across full, compact, and headroom builders
    const full = fallbackFullDiscipline(true, "guided")
    const compact = fallbackCompactDiscipline(true, "guided")
    const headroom = buildHeadroomSection(true, "guided")
    //#when reading compression guidance
    //#then bare calls without message IDs stay banned everywhere
    expect(full).toContain("never bare without message IDs")
    expect(compact).toContain("never bare without message IDs")
    expect(headroom).toContain("never bare without message IDs")
  })

  it("headroom guided clause keeps DCP ownership and the /dcp-compress ban", () => {
    //#given headroom available in guided mode
    const guided = buildHeadroomSection(true, "guided")
    //#when reading the ownership clause
    //#then ownership + bans retained alongside proactive min-band wording
    expect(guided).toContain("the `compress` tool is DCP's")
    expect(guided).toContain("invoke /dcp-compress")
    expect(guided).toContain("proactive on closed sections")
    expect(guided).toContain("ctx_stats")
    expect(guided).not.toContain("CRITICAL WARNING")
    expect(guided).not.toContain("only with trigger/nudge")
    expect(guided.toLowerCase()).not.toContain("immediate")
  })

  it("manual and none modes stay trigger-only / inactive (no proactive wording)", () => {
    //#given manual and inactive modes
    const manualFull = fallbackFullDiscipline(true, "manual")
    const manualHeadroom = buildHeadroomSection(true, "manual")
    const noneFull = fallbackFullDiscipline(true, "none")
    const noneHeadroom = buildHeadroomSection(true, "none")
    //#when reading their compression guidance
    //#then manual gates on its trigger, none advertises no tool, neither is proactive
    expect(manualFull).toContain("only after trigger prompt")
    expect(manualHeadroom).toContain("only after the manual trigger")
    expect(noneFull).toContain("No `compress` tool")
    expect(noneHeadroom).toContain("No `compress` tool exists (DCP inactive)")
    expect(manualFull).not.toContain("proactive on closed sections")
    expect(noneFull).not.toContain("proactive on closed sections")
  })

  it("min-band synthetic context (IDs + closed sections + rising usage, zero CRIT text) => compress permitted", () => {
    //#given guided guidance plus a synthetic min-band snapshot: anchors +
    // message-ID tags, closed sections, rising usage signals, empty nudge bodies
    const guidance = fallbackFullDiscipline(true, "guided")
    const synthetic =
      "[dcp min-band snapshot] anchors m0001 m0002 m0003; " +
      "closed section: auth exploration (compressed); " +
      "ctx_stats usage rising 42%->58%; headroom signals rising; " +
      "turn/iteration nudge bodies empty"
    //#when classifying with pure string logic (no DCP runtime)
    //#then compress is permitted and no CRIT text is required
    expect(synthetic).not.toContain("CRITICAL WARNING")
    expect(classifyMinBandCompress(synthetic, guidance)).toBe("compress permitted")
  })

  it("synthetic context without message IDs => do not call bare", () => {
    //#given guided guidance plus a snapshot lacking message-ID tags
    const guidance = fallbackFullDiscipline(true, "guided")
    const synthetic =
      "[dcp min-band snapshot] anchors present but message-ID tags absent; " +
      "closed section noted; ctx_stats usage rising"
    //#when classifying with pure string logic (no DCP runtime)
    //#then the never-bare ban holds
    expect(classifyMinBandCompress(synthetic, guidance)).toBe("do not call bare")
  })
})

/**
 * Pure string-logic classifier for the min-band guidance contract.
 * No DCP runtime: decides only from the synthetic snapshot text and the
 * guided guidance strings produced by the prompt builders above.
 */
function classifyMinBandCompress(
  syntheticContext: string,
  guidedGuidance: string,
): "compress permitted" | "do not call bare" {
  const hasIds = /m\d{4,}/.test(syntheticContext)
  const hasClosedSections = /closed section/i.test(syntheticContext)
  const hasUsageSignal = /ctx_stats|headroom/i.test(syntheticContext)
  const guidancePermitsProactive = guidedGuidance.includes("proactive on closed sections")
  const guidanceBansBare = guidedGuidance.includes("never bare without message IDs")
  if (hasIds && hasClosedSections && hasUsageSignal && guidancePermitsProactive) return "compress permitted"
  if (!hasIds && guidanceBansBare) return "do not call bare"
  return "do not call bare"
}

describe("buildCompactContextDisciplineSection", () => {
  it("should return empty string when not available", () => {
    //#given: false
    expect(buildCompactContextDisciplineSection(false)).toBe("")
    //#then: empty
  })

  it("should return empty string by default", () => {
    //#given: default
    expect(buildCompactContextDisciplineSection()).toBe("")
    //#then: empty
  })

  it("should render compact table when available", () => {
    //#given: true (runtime file or fallback)
    const result = buildCompactContextDisciplineSection(true)
    //#then: non-empty discipline in either form
    expect(result.length).toBeGreaterThan(50)
    expect(result.includes("Context Discipline") || result.includes("context-mode")).toBe(true)
    expect(result).not.toContain("ALWAYS")
  })

  it("should contain 5 compact scenarios", () => {
    //#given (runtime file or fallback)
    const result = buildCompactContextDisciplineSection(true)
    //#then: ctx coverage in either form
    expect(result).toContain("ctx_")
    expect(result.includes("ctx_batch_execute") || result.includes("GATHER")).toBe(true)
    expect(result.includes("ctx_search") || result.includes("FOLLOW-UP")).toBe(true)
    expect(result.includes("ctx_fetch_and_index") || result.includes("WEB")).toBe(true)
    expect(result.includes("ctx_stats") || result.includes("PROCESSING")).toBe(true)
  })

  it("should mention read→edit chain exempt", () => {
    //#given (runtime file distinguishes edit-reads; fallback states chain exempt)
    const result = buildCompactContextDisciplineSection(true)
    //#then
    expect(result.includes("LINE#ID") || result.includes("reading correct") || result.includes("ctx_execute_file")).toBe(true)
    expect(result.includes("read→edit") || result.includes("Reading to **edit**") || result.includes("ctx_")).toBe(true)
  })

  it("should not contain full-table rows", () => {
    //#given
    const result = buildCompactContextDisciplineSection(true)
    //#then: compact omits Edits/Observation/State Mutation distinctions
    expect(result).not.toContain("Analysis / Processing")
    expect(result).not.toContain("Observation")
    expect(result).not.toContain("State Mutation")
  })
})

describe("buildExploreDisciplineSection", () => {
  it("should return empty when neither available", () => {
    //#given
    expect(buildExploreDisciplineSection(false, false)).toBe("")
    expect(buildExploreDisciplineSection()).toBe("")
    //#then: empty
  })

  it("should render ctx part when ctx available", () => {
    //#given: ctx only
    const result = buildExploreDisciplineSection(true, false)
    //#then
    expect(result).toContain("when available")
    expect(result).toContain("ctx_search")
    expect(result).toContain("grep/glob fallback")
    expect(result).toContain("ctx_batch_execute")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result).not.toContain("headroom_")
  })

  it("should render headroom part when headroom available", () => {
    //#given: headroom only
    const result = buildExploreDisciplineSection(false, true)
    //#then
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("headroom_search")
    expect(result).not.toContain("ctx_search")
  })

  it("should render both parts when both available", () => {
    //#given: both
    const result = buildExploreDisciplineSection(true, true)
    //#then: contains both
    expect(result).toContain("ctx_search")
    expect(result).toContain("ctx_batch_execute")
    expect(result).toContain("ctx_fetch_and_index")
    expect(result).toContain("headroom_retrieve")
    expect(result).toContain("NEVER re-read full history")
  })

  it("should always mention fallback semantics for explore", () => {
    //#given
    const result = buildExploreDisciplineSection(true, false)
    //#then: explore tier emphasizes fallback not NEVER",
    expect(result).toContain("→ grep/glob fallback")
    expect(result).not.toContain("NEVER raw")
  })
})

describe("categorizeTools extended", () => {
  it("should categorize headroom_* as sandbox", () => {
    //#given: headroom tools
    const result = categorizeTools(["headroom_retrieve", "headroom_search", "headroom_stats"])
    //#then: sandbox
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
  })

  it("should categorize ctx_stats and ctx_index as sandbox", () => {
    //#given
    const result = categorizeTools(["ctx_stats", "ctx_index"])
    //#then
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
  })

  it("should categorize n and n_file as sandbox", () => {
    //#given: context-mode aliases
    const result = categorizeTools(["n", "n_file"])
    //#then: both sandbox
    expect(result.every((t) => t.category === "sandbox")).toBe(true)
  })

  it("should categorize n and n_file alongside ctx_* as sandbox in mixed list", () => {
    //#given: n/n_file mixed with ctx_* and other tools
    const result = categorizeTools(["n", "ctx_execute", "n_file", "ctx_batch_execute", "grep", "read"])
    //#then: n/n_file categorized as sandbox alongside ctx_* tools
    const byCategory = (c: string) => result.filter((t) => t.category === c).map((t) => t.name)
    expect(byCategory("sandbox")).toEqual(["n", "ctx_execute", "n_file", "ctx_batch_execute"])
    expect(byCategory("search")).toEqual(["grep"])
    expect(byCategory("other")).toEqual(["read"])
  })

  it("should categorize session_* as session and slashcommand as command", () => {
    //#given
    const result = categorizeTools(["session_list", "session_get", "slashcommand"])
    //#then
    expect(result.find((t) => t.name === "session_list")?.category).toBe("session")
    expect(result.find((t) => t.name === "slashcommand")?.category).toBe("command")
  })

  it("should keep ctx and headroom mixed as sandbox in mixed list", () => {
    //#given: mixed ctx/headroom plus plain
    const result = categorizeTools(["ctx_search", "headroom_retrieve", "grep", "read"])
    //#then
    const byCategory = (c: string) => result.filter((t) => t.category === c).map((t) => t.name)
    expect(byCategory("sandbox")).toEqual(["ctx_search", "headroom_retrieve"])
    expect(byCategory("search")).toEqual(["grep"])
    expect(byCategory("other")).toEqual(["read"])
  })
})

describe("buildArchitectReferralSection (issue #111 option b)", () => {
  it("points Morpheus to /start-work and forbids task(subagent_type=architect)", () => {
    //#given
    //#when
    const result = buildArchitectReferralSection()

    //#then
    expect(result).toContain("/start-work")
    expect(result).toContain("rchitect")
    expect(result).toContain('task(subagent_type="architect")')
  })
})
