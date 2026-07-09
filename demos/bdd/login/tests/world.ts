import type { Browser, BrowserContext, Page } from "playwright";
import { chromium, firefox, webkit } from "playwright";
import { setWorldConstructor, World as CucumberWorld } from "@cucumber/cucumber";
import { expect as playwrightExpect } from "@playwright/test";

playwrightExpect.configure({ timeout: 30_000 });

export type BrowserName = "chromium" | "firefox" | "webkit";

export interface WorldParams {
  baseUrl: string;
  browser: BrowserName;
  headless: boolean;
}

export class World extends CucumberWorld<WorldParams> {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;

  baseUrl(): string {
    return this.parameters.baseUrl ?? "http://127.0.0.1:3000";
  }

  browserName(): BrowserName {
    return this.parameters.browser ?? "chromium";
  }

  isHeadless(): boolean {
    return this.parameters.headless !== false;
  }

  async openBrowser(): Promise<void> {
    const launcher =
      this.browserName() === "firefox"
        ? firefox
        : this.browserName() === "webkit"
          ? webkit
          : chromium;
    this.browser = await launcher.launch({ headless: this.isHeadless() });
    this.context = await this.browser.newContext({
      baseURL: this.baseUrl(),
      viewport: { width: 1280, height: 800 },
    });
    this.context.setDefaultTimeout(30_000);
    this.context.setDefaultNavigationTimeout(30_000);
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(30_000);
    this.page.setDefaultNavigationTimeout(30_000);
  }

  async closeBrowser(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async seedMockState(payload: Record<string, unknown>): Promise<void> {
    const res = await this.page.request.post(`${this.baseUrl()}/__test__/seed`, {
      data: payload,
    });
    if (!res.ok()) {
      throw new Error(`Failed to seed mock state: HTTP ${res.status()}`);
    }
  }

  async resetMockState(): Promise<void> {
    const res = await this.page.request.post(`${this.baseUrl()}/__test__/reset`);
    if (!res.ok()) {
      throw new Error(`Failed to reset mock state: HTTP ${res.status()}`);
    }
  }

  async getMockState(): Promise<Record<string, unknown>> {
    const res = await this.page.request.get(`${this.baseUrl()}/__test__/state`);
    if (!res.ok()) {
      throw new Error(`Failed to read mock state: HTTP ${res.status()}`);
    }
    const body = (await res.json()) as { state?: Record<string, unknown> };
    return body.state ?? {};
  }
}

setWorldConstructor(World);
