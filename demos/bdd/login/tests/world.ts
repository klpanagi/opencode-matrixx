import { World as CucumberWorld, setWorldConstructor } from '@cucumber/cucumber';
import { type Browser, type BrowserContext, type Page, chromium } from '@playwright/test';

export class World extends CucumberWorld {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  private state: Map<string, unknown> = new Map();

  async init(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      baseURL: process.env.BDD_BASE_URL || 'http://localhost:4000',
    });
    this.page = await this.context.newPage();
  }

  async destroy(): Promise<void> {
    await this.page?.close();
    await this.context?.close();
    await this.browser?.close();
  }

  set<T>(key: string, value: T): void {
    this.state.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }
}

setWorldConstructor(World);
