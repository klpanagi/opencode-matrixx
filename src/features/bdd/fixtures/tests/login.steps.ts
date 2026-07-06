import { Given, Then, When } from "@cucumber/cucumber"
import type { Page } from "@playwright/test"
import { LoginPage } from "./LoginPage.page"
import type { CustomWorld } from "./world"

/* ------------------------------------------------------------------ */
/*  Fixture: login.feature — User Login                               */
/*  @ui:route /login                                                  */
/*  @api:endpoint POST /api/v1/auth/login                             */
/* ------------------------------------------------------------------ */

Given("the user is on the login page", async function (this: CustomWorld) {
  const page: Page = this.page!
  const loginPage = new LoginPage(page)
  await loginPage.goto()
})

When(
  'the user enters {string} as the email',
  async function (this: CustomWorld, email: string) {
    const page: Page = this.page!
    const loginPage = new LoginPage(page)
    await loginPage.fillEmail(email)
  },
)

When(
  'the user enters {string} as the password',
  async function (this: CustomWorld, password: string) {
    const page: Page = this.page!
    const loginPage = new LoginPage(page)
    await loginPage.fillPassword(password)
    await loginPage.clickSubmit()
  },
)

Then(
  "the user should be redirected to the dashboard",
  async function (this: CustomWorld) {
    const page: Page = this.page!
    const loginPage = new LoginPage(page)
    await loginPage.waitForDashboard()
  },
)

Then(
  "a welcome message should be displayed",
  async function (this: CustomWorld) {
    const page: Page = this.page!
    const loginPage = new LoginPage(page)
    const visible = await loginPage.welcomeMessageIsVisible()
    if (!visible) {
      throw new Error("Welcome message is not displayed on the dashboard")
    }
  },
)
