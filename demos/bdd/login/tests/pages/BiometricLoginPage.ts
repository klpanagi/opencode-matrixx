import type { Page, Locator } from "playwright";
import { expect } from "@playwright/test";

export class BiometricLoginPage {
  readonly page: Page;
  readonly pageMarker: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageMarker = page.getByTestId("biometric-login-page");
  }

  async expectOnBiometricLoginScreen(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login\/biometric$/, { timeout: 30_000 });
    await expect(this.pageMarker).toBeVisible({ timeout: 30_000 });
  }
}
