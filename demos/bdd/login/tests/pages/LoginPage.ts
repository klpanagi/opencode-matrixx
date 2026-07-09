import type { Page, Locator } from "playwright";
import { expect } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly biometricShortcutButton: Locator;
  readonly successMessage: Locator;
  readonly errorMessage: Locator;
  readonly quickLoginExpiredBanner: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByTestId("username-input");
    this.passwordInput = page.getByTestId("password-input");
    this.signInButton = page.getByTestId("sign-in-button");
    this.biometricShortcutButton = page.getByTestId("biometric-shortcut-button");
    this.successMessage = page.getByTestId("login-success-message");
    this.errorMessage = page.getByTestId("login-error-message");
    this.quickLoginExpiredBanner = page.getByTestId("quick-login-expired-banner");
    this.loadingIndicator = page.getByTestId("loading-indicator");
  }

  async visit(): Promise<void> {
    await this.page.goto("/login");
    await this.expectOnLoginScreen();
  }

  async expectOnLoginScreen(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 30_000 });
    await expect(this.usernameInput).toBeVisible({ timeout: 30_000 });
    await expect(this.passwordInput).toBeVisible({ timeout: 30_000 });
  }

  async expectFieldsEmpty(): Promise<void> {
    await expect(this.usernameInput).toHaveValue("");
    await expect(this.passwordInput).toHaveValue("");
  }

  async enterUsername(value: string): Promise<void> {
    await this.usernameInput.fill(value);
    return Promise.resolve();
  }

  async enterPassword(value: string): Promise<void> {
    await this.passwordInput.fill(value);
    return Promise.resolve();
  }

  async enterNonEmailUsername(value: string): Promise<void> {
    await this.usernameInput.fill(value);
  }

  async enterValidCredentials(): Promise<void> {
    await this.usernameInput.fill("alice@example.com");
    await this.passwordInput.fill("correct horse battery staple");
  }

  async enterIncorrectCredentials(): Promise<void> {
    await this.usernameInput.fill("alice@example.com");
    await this.passwordInput.fill("WRONG_PASSWORD");
  }

  async tapSignIn(): Promise<void> {
    await this.signInButton.click();
  }

  async tapSignInWithEmptyFields(): Promise<void> {
    await this.signInButton.click();
  }

  async expectSuccessMessage(text: string): Promise<void> {
    await expect(this.successMessage).toBeVisible();
    await expect(this.successMessage).toHaveText(text);
  }

  async expectErrorMessage(text: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toHaveText(text);
  }

  async expectSomeErrorMessage(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    const text = (await this.errorMessage.textContent()) ?? "";
    expect(text.length).toBeGreaterThan(0);
  }

  async expectButtonLabel(label: string): Promise<void> {
    await expect(this.signInButton).toHaveText(label);
  }

  async expectSignInButtonActive(): Promise<void> {
    await expect(this.signInButton).toBeEnabled();
    await expect(this.signInButton).toHaveText("Sign in");
  }

  async expectButtonDisabled(): Promise<void> {
    await expect(this.signInButton).toBeDisabled();
  }

  async expectLoadingIndicator(): Promise<void> {
    await expect(this.loadingIndicator).toBeVisible();
  }

  async expectLoadingIndicatorHidden(): Promise<void> {
    await expect(this.loadingIndicator).toBeHidden();
  }

  async expectQuickLoginExpiredBanner(): Promise<void> {
    await expect(this.quickLoginExpiredBanner).toBeVisible();
    await expect(this.quickLoginExpiredBanner).toContainText(
      "Quick Login Expired. For your security, please sign in again with your email and password.",
    );
  }

  async expectPasswordMasked(): Promise<void> {
    await expect(this.passwordInput).toHaveAttribute("type", "password");
  }

  async expectNoShowHideToggle(): Promise<void> {
    const toggles = this.page.locator(
      '[data-testid*="toggle"], [data-testid*="show-password"], [data-testid*="hide-password"], button[aria-label*="Show password" i], button[aria-label*="Hide password" i]',
    );
    await expect(toggles).toHaveCount(0);
  }

  async typeSlowly(locator: Locator, value: string, perCharMs = 30): Promise<void> {
    await locator.focus();
    for (const char of value) {
      await this.page.keyboard.type(char);
      await this.page.waitForTimeout(perCharMs);
    }
  }

  async clearForm(): Promise<void> {
    await this.usernameInput.fill("");
    await this.passwordInput.fill("");
  }
}
