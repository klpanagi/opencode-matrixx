import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Home screen after successful login.
 * Covers: /home route
 */
export class HomePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // --- Navigation ---

  async waitForReady(): Promise<void> {
    await this.page.waitForURL('**/home', { timeout: 3000 });
  }

  // --- Assertions ---

  async expectOnHomePage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home/);
  }

  async expectNotOnLoginPage(): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/login/);
  }

  async expectDirectTransition(): Promise<void> {
    // No intermediate success page — transition is login → home
    const successOverlay = this.page.locator('[data-testid="success_overlay"]');
    await expect(successOverlay).toHaveCount(0);
  }
}
