import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  Status,
  setDefaultTimeout,
} from "@cucumber/cucumber";
import type { World } from "./world";

setDefaultTimeout(30000);

BeforeAll(async function () {});

AfterAll(async function () {});

Before(async function (this: World) {
  await this.openBrowser();
  await this.resetMockState();
});

After(async function (this: World, scenario) {
  if (scenario.result?.status === Status.FAILED) {
    const name = scenario.pickle.name.replace(/[^a-z0-9-]/gi, "_").toLowerCase();
    try {
      const buffer = await this.page.screenshot({ fullPage: true });
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const dir = path.join(process.cwd(), "reports", "screenshots");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${name}.png`), buffer);
    } catch {
      // best-effort
    }
  }
  await this.closeBrowser();
});
