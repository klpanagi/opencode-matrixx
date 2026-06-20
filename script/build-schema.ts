#!/usr/bin/env bun
import * as z from "zod"
import { MatrixxConfigSchema } from "../src/config/schema"

const OUTPUT_PATHS = {
  matrixx: "assets/matrixx.schema.json",
  ohMyOpenCode: "assets/oh-my-opencode.schema.json",
}

function buildSchema(targetId: string) {
  const jsonSchema = z.toJSONSchema(MatrixxConfigSchema, {
    target: "draft-7",
    unrepresentable: "any",
  })

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: targetId,
    title: "Matrixx Configuration",
    description: "Configuration schema for matrixx plugin",
    ...jsonSchema,
  }
}

async function main() {
  console.log("Generating JSON Schema...")

  const matrixxSchema = buildSchema(
    "https://raw.githubusercontent.com/klpanagi/matrixx/dev/assets/matrixx.schema.json",
  )
  const ohMyOpenCodeSchema = buildSchema(
    "https://raw.githubusercontent.com/klpanagi/matrixx/dev/assets/oh-my-opencode.schema.json",
  )

  await Bun.write(OUTPUT_PATHS.matrixx, JSON.stringify(matrixxSchema, null, 2))
  await Bun.write(OUTPUT_PATHS.ohMyOpenCode, JSON.stringify(ohMyOpenCodeSchema, null, 2))

  console.log(`✓ ${OUTPUT_PATHS.matrixx} regenerated`)
  console.log(`✓ ${OUTPUT_PATHS.ohMyOpenCode} regenerated`)
}

main()
