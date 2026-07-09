/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Cucumber-js configuration for the 1001_username_password BDD feature.
 *
 * The .cjs extension is mandatory because matrixx's package.json declares
 * "type": "module" — Node would otherwise interpret this file as ESM and fail
 * with "module is not defined".
 *
 * Step definitions + page objects + world + hooks all live under tests/ and
 * are loaded together so the tsx loader transpiles every .ts file on import.
 */

const path = require("path");
const fs = require("fs");

const FEATURE_DIR = __dirname;
const CONFIG_PATH = path.join(FEATURE_DIR, "bdd.config.json");
const rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const config = {
  baseUrl: process.env.BDD_BASE_URL || rawConfig.baseUrl,
  browser: process.env.BDD_BROWSER || rawConfig.browser || "chromium",
  headless: process.env.BDD_HEADLESS
    ? process.env.BDD_HEADLESS !== "false"
    : rawConfig.headless !== false,
};

module.exports = {
  default: {
    require: [
      "tests/**/*.ts",
      "tests/**/*.steps.ts",
      path.join(FEATURE_DIR, "tests/world.ts"),
      path.join(FEATURE_DIR, "tests/hooks.ts"),
    ],
    requireModule: ["tsx/esm"],
    paths: [path.join(FEATURE_DIR, "1001_username_password.feature")],
    format: [
      "progress",
      "summary",
      "html:reports/1001_username_password.html",
      "json:reports/1001_username_password.json",
    ],
    formatOptions: { snippetInterface: "async-await" },
    publishQuiet: true,
    worldParameters: { baseUrl: config.baseUrl, browser: config.browser, headless: config.headless },
    timeout: 30000,
  },
};
