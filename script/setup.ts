import { executeSetup } from "../src/cli/setup/index.ts";

const dryRun = process.argv.includes("--dry-run");
const yes = process.argv.includes("--yes") || process.argv.includes("-y");
const out = await executeSetup({ dryRun, yes });
console.log(out);
