import type { Locator, Page } from "@playwright/test"

/**
 * Page object for the Login screen.
 * Mapped from contract annotations:
 *   - @ui:route /login
 *   - @ui:testid form=login-form-component
 *   - @ui:testid button=login-submit-button
 *   - @api:endpoint POST /api/v1/auth/login
 */
export class LoginPage {
  readonly page: Page
  readonly emailInput: Locator
  readonly passwordInput: Locator
  readonly submitButton: Locator
  readonly loginForm: Locator

  constructor(page: Page) {
    this.page = page
    this.loginForm = page.getByTestId("login-form-component")
    this.emailInput = this.loginForm.getByLabel("Email")
    this.passwordInput = this.loginForm.getByLabel("Password")
    this.submitButton = page.getByTestId("login-submit-button")
  }

  /** Navigate to the login page at /login */
  async goto(): Promise<void> {
    await this.page.goto("/login")
  }

  /**
   * Fill the email field with the given value.
   * @param email - User email address
   */
  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email)
  }

  /**
   * Fill the password field with the given value.
   * @param password - User password
   */
  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password)
  }

  /**
   * Click the login submit button.
   * Equivalent to submitting credentials to POST /api/v1/auth/login.
   */
  async clickSubmit(): Promise<void> {
    await this.submitButton.click()
  }

  /**
   * Complete login flow: navigate, enter credentials, submit.
   * @param email - User email
   * @param password - User password
   */
  async loginAs(email: string, password: string): Promise<void> {
    await this.goto()
    await this.fillEmail(email)
    await this.fillPassword(password)
    await this.clickSubmit()
  }

  /** Wait for redirection to the dashboard after successful login */
  async waitForDashboard(): Promise<void> {
    await this.page.waitForURL(/\/dashboard/)
  }

  /** Check that a welcome message is visible on the dashboard */
  async welcomeMessageIsVisible(): Promise<boolean> {
    return this.page.getByRole("heading", { name: /welcome/i }).isVisible()
  }
}
