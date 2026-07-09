import type { Page, Locator } from "playwright";
import { expect } from "@playwright/test";

export class HomePage {
  readonly page: Page;
  readonly pageMarker: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageMarker = page.getByTestId("home-page");
  }

  async expectOnHomeScreen(): Promise<void> {
    await expect(this.page).toHaveURL(/\/home$/, { timeout: 30_000 });
    await expect(this.pageMarker).toBeVisible({ timeout: 30_000 });
  }
}
