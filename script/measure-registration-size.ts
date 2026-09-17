#!/usr/bin/env bun
//#given dev HEAD post-PR112 baseline
//#when script runs without plugin init
//#then JSON with counts and byte sizes for tuning allowlists and caps
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createSkillTool } from "../src/tools/skill/tools";
import {
  buildCompactContextDisciplineSection,
  buildExploreDisciplineSection,
  buildHeadroomSection,
} from "../src/agents/dynamic-agent-prompt-builder";
import {
  MAX_MERGED_CHARS,
  MAX_PER_SOURCE_CHARS,
} from "../src/features/context-injector/collector";

function dirSize(dir: string): number {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else total += statSync(p).size;
  }
  return total;
}

function countOccurrences(root: string, needle: RegExp): number {
  let n = 0;
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) {
        const s = readFileSync(p, "utf8");
        const m = s.match(needle);
        if (m) n += m.length;
      }
    }
  };
  walk(root);
  return n;
}

const skillTool = createSkillTool();
const skillDesc = skillTool.description as string;
const compact = buildCompactContextDisciplineSection(true, true);
const explore = buildExploreDisciplineSection(true, true, true);
const headroom = buildHeadroomSection(true);
const emptyDiscipline = buildExploreDisciplineSection(false, false, true);

const out = {
  skillToolDescriptionChars: skillDesc.length,
  skillToolDescriptionTokens: Math.ceil(skillDesc.length / 4),
  disciplineCompactChars: compact.length,
  disciplineExploreChars: explore.length,
  disciplineHeadroomChars: headroom.length,
  disciplineInactiveChars: emptyDiscipline.length,
  collectorMaxMergedChars: MAX_MERGED_CHARS,
  collectorMaxPerSourceChars: MAX_PER_SOURCE_CHARS,
  toolCallOccurrences: countOccurrences("src/tools", /tool\(\{/g),
  hookDirs: readdirSync("src/hooks", { withFileTypes: true }).filter((e) => e.isDirectory()).length,
  toolDirs: readdirSync("src/tools", { withFileTypes: true }).filter((e) => e.isDirectory()).length,
  agentsBytes: {
    morpheus: statSync("src/agents/morpheus.ts").size,
    keymaker: statSync("src/agents/keymaker.ts").size,
  },
  srcAgentsBytes: dirSize("src/agents"),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out, null, 2));
} else {
  for (const [k, v] of Object.entries(out)) console.log(`${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
}
