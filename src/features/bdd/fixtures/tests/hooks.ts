import { After, AfterAll, Before, BeforeAll } from "@cucumber/cucumber"
import { type Browser, type BrowserContext, chromium, type Page } from "@playwright/test"
import type { CustomWorld } from "./world"

let browser: Browser

BeforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})

Before(async function (this: CustomWorld) {
  const baseURL = process.env.BASE_URL || "http://localhost:3000"
  const context: BrowserContext = await browser.newContext({ baseURL })
  this.page = await context.newPage()
})

After(async function (this: CustomWorld) {
  if (this.page) {
    await this.page.close()
  }
})

AfterAll(async () => {
  if (browser) {
    await browser.close()
  }
})
