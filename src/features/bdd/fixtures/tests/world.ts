import { setWorldConstructor, type World } from "@cucumber/cucumber"
import type { Page } from "@playwright/test"

/**
 * Custom World shared context for login feature step definitions.
 * Holds the Playwright Page instance used across all steps in a scenario.
 */
export interface CustomWorld extends World {
  page?: Page
}

class LoginWorld implements CustomWorld {
  readonly attach: World["attach"]
  readonly log: World["log"]
  readonly link: World["link"]
  readonly parameters: World["parameters"]
  page?: Page

  constructor({ attach, log, link, parameters }: { attach: World["attach"]; log: World["log"]; link: World["link"]; parameters: World["parameters"] }) {
    this.attach = attach
    this.log = log
    this.link = link
    this.parameters = parameters
  }
}

setWorldConstructor(LoginWorld)
