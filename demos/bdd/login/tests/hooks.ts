import { Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import type { World } from './world';

setDefaultTimeout(30_000);

Before(async function (this: World) {
  await this.init();
});

After(async function (this: World) {
  await this.destroy();
});
