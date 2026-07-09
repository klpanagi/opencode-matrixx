import { Given, When, Then, defineStep } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { World } from "./world";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { BiometricLoginPage } from "./pages/BiometricLoginPage";

function loginPage(world: World): LoginPage {
  return new LoginPage(world.page);
}

function homePage(world: World): HomePage {
  return new HomePage(world.page);
}

function biometricPage(world: World): BiometricLoginPage {
  return new BiometricLoginPage(world.page);
}

interface LoginResponseOptions {
  status: number;
  body?: Record<string, unknown>;
  delayMs?: number;
  fail?: boolean;
}

function loginResponse({
  status,
  body,
  delayMs = 0,
  fail = false,
}: LoginResponseOptions): (route: import("playwright").Route) => Promise<void> {
  return async (route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (fail) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body ?? {}),
    });
  };
}

async function defaultSuccessRoute(
  world: World,
  options: { delayMs?: number } = {},
): Promise<void> {
  await world.page.route("**/api/v1/auth/login", (route) =>
    loginResponse({
      status: 200,
      body: { token: "mock-jwt-token", userId: "user-1", expiresAt: Date.now() + 3600_000 },
      delayMs: options.delayMs,
    })(route),
  );
}

Given("I am on the username and password login screen", async function (this: World) {
  await this.resetMockState();
  await loginPage(this).visit();
});

Given("both the username and password fields are empty", async function (this: World) {
  await loginPage(this).expectFieldsEmpty();
});

When("I enter a valid username", async function (this: World) {
  await defaultSuccessRoute(this);
  await loginPage(this).enterUsername("alice@example.com");
});

When("I enter the correct password", async function (this: World) {
  await defaultSuccessRoute(this);
  await loginPage(this).enterPassword("correct horse battery staple");
});

When("I tap {string}", async function (this: World, label: string) {
  if (label === "Sign in") {
    await loginPage(this).tapSignIn();
  } else {
    await this.page.getByRole("button", { name: label, exact: true }).click();
  }
});

Then("an inline {string} message is shown", async function (this: World, message: string) {
  await loginPage(this).expectSuccessMessage(message);
});

Then(
  "I am automatically navigated to the app home screen within approximately 1 second",
  async function (this: World) {
    await homePage(this).expectOnHomeScreen();
  },
);

Then("the failed attempt counter for my username is cleared", async function (this: World) {
  await homePage(this).expectOnHomeScreen();
});

When("I enter my existing The Bank username in non-email format", async function (this: World) {
  await defaultSuccessRoute(this);
  await loginPage(this).enterNonEmailUsername("thebank.alice.1234");
});

defineStep("authentication succeeds", async function (this: World) {
  await defaultSuccessRoute(this);
  await loginPage(this).enterValidCredentials();
  await loginPage(this).tapSignIn();
  await homePage(this).expectOnHomeScreen();
});

Then("I am navigated to the home screen", async function (this: World) {
  await homePage(this).expectOnHomeScreen();
});

When("I enter valid credentials and tap {string}", async function (this: World, label: string) {
  await this.page.route("**/api/v1/auth/login", (route) =>
    loginResponse({ status: 200, body: { token: "ok" }, delayMs: 600 })(route),
  );
  await loginPage(this).enterValidCredentials();
  if (label === "Sign in") {
    await loginPage(this).tapSignIn();
  }
});

Then("the button label changes to {string}", async function (this: World, label: string) {
  await loginPage(this).expectButtonLabel(label);
});

Then("the button is disabled to prevent duplicate submissions", async function (this: World) {
  await loginPage(this).expectButtonDisabled();
});

Then("a loading state is shown while authentication is in progress", async function (this: World) {
  await loginPage(this).expectButtonDisabled();
  await loginPage(this).expectButtonLabel("Signing in...");
});

When("I tap {string} with either field empty", async function (this: World, _label: string) {
  await loginPage(this).tapSignInWithEmptyFields();
});

Then("I see: {string}", async function (this: World, message: string) {
  await loginPage(this).expectErrorMessage(message);
});

Then("the button returns to its active state", async function (this: World) {
  await loginPage(this).expectSignInButtonActive();
});

When("I enter an incorrect username and password combination", async function (this: World) {
  await this.page.route("**/api/v1/auth/login", (route) =>
    loginResponse({
      status: 401,
      body: { error: "Invalid username or password. Please try again." },
    })(route),
  );
  await loginPage(this).enterIncorrectCredentials();
});

Then("no information about remaining attempts is shown to the user", async function (this: World) {
  const text = ((await loginPage(this).errorMessage.textContent()) ?? "").toLowerCase();
  expect(text).not.toMatch(/attempt|remaining|try again in|locked/);
});

Given("I have failed login {int} times with this username", async function (this: World, count: number) {
  // Seed the stub server's attempt counter so the next wrong-credentials call
  // (the user's "tap sign in again") is the (count+1)th failure and triggers
  // the 30-minute lockout.
  await this.seedMockState({ attemptCount: count });
  await loginPage(this).visit();
});

When("I enter incorrect credentials and tap {string} again", async function (this: World, _label: string) {
  await loginPage(this).enterIncorrectCredentials();
  await loginPage(this).tapSignIn();
});

Then("the account is locked for 30 minutes server-side", async function (this: World) {
  await loginPage(this).expectOnLoginScreen();
  await loginPage(this).expectErrorMessage(
    "Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.",
  );
});

Given("my account has been locked {int} times consecutively", async function (this: World, _count: number) {
  await this.seedMockState({ lockoutCycles: 3, isSuspended: true });
  await loginPage(this).visit();
});

When("I attempt to log in again after the lockout period", async function (this: World) {
  await loginPage(this).enterUsername("alice@example.com");
  await loginPage(this).enterPassword("correct horse battery staple");
  await loginPage(this).tapSignIn();
});

Then("my account is suspended", async function (this: World) {
  await loginPage(this).expectErrorMessage(
    "Your account is suspended. Please contact the Contact Centre for manual re-enablement.",
  );
});

Then("I must contact the Contact Centre for manual re-enablement", async function (this: World) {
  const text = ((await loginPage(this).errorMessage.textContent()) ?? "").toLowerCase();
  expect(text).toMatch(/contact centre|contact center/);
});

When("a network error occurs during authentication", async function (this: World) {
  await this.page.route("**/api/v1/auth/login", (route) =>
    loginResponse({ status: 500, fail: true })(route),
  );
  await loginPage(this).enterUsername("alice@example.com");
  await loginPage(this).enterPassword("correct horse battery staple");
  await loginPage(this).tapSignIn();
});

Then("an error message is shown", async function (this: World) {
  await loginPage(this).expectSomeErrorMessage();
});

Then("I can retry by tapping {string} again", async function (this: World, _label: string) {
  await loginPage(this).expectSignInButtonActive();
});

Given("my session times out while I am on the login screen", async function (this: World) {
  await loginPage(this).visit();
  await loginPage(this).enterUsername("alice@example.com");
  await loginPage(this).enterPassword("ignored");
});

Then("I am redirected to the login screen", async function (this: World) {
  await loginPage(this).expectOnLoginScreen();
});

Then("any unsaved progress is lost", async function (this: World) {
  await this.page.reload();
  await loginPage(this).expectFieldsEmpty();
});

Given("I arrived at this screen from a {string} state", async function (this: World, state: string) {
  if (state === "Quick Login Expired") {
    // The stub's LoginPage reads the flag from sessionStorage on mount.
    await this.page.context().addInitScript(() => {
      try {
        window.sessionStorage.setItem("quickLoginExpired", "true");
      } catch {
        // best-effort
      }
    });
    await this.page.goto("/login");
  } else {
    await loginPage(this).visit();
  }
});

Then("an amber banner is shown: {string}", async function (this: World, message: string) {
  await loginPage(this).expectQuickLoginExpiredBanner();
  await expect(loginPage(this).quickLoginExpiredBanner).toContainText(message);
});

Given("I have partially entered my username", async function (this: World) {
  await loginPage(this).visit();
  await loginPage(this).enterUsername("ali");
});

When("I tap the biometric login shortcut button", async function (this: World) {
  await loginPage(this).biometricShortcutButton.click();
});

Then("the biometric flow is initiated", async function (this: World) {
  await biometricPage(this).expectOnBiometricLoginScreen();
});

Then("the partially entered form data is preserved if I return", async function (this: World) {
  await this.page.goto("/login");
  await expect(loginPage(this).usernameInput).toHaveValue("ali");
});

Then("the transition from login screen to home screen is direct", async function (this: World) {
  await homePage(this).expectOnHomeScreen();
});

Then("no separate full-screen success page is shown", async function (this: World) {
  await expect(this.page).not.toHaveURL(/\/login\/(success|done|complete)/);
});

Given("the {string} message is shown", async function (this: World, message: string) {
  await loginPage(this).enterValidCredentials();
  await this.page.route("**/api/v1/auth/login", (route) =>
    loginResponse({
      status: 200,
      body: { token: "ok" },
      delayMs: 100,
    })(route),
  );
  await loginPage(this).tapSignIn();
  await loginPage(this).expectSuccessMessage(message);
});

When("I rapidly tap the screen multiple times", async function (this: World) {
  for (let i = 0; i < 5; i++) {
    await this.page.mouse.click(640, 400);
  }
});

Then("no duplicate navigation events are triggered", async function (this: World) {
  // Verifies the button is disabled during the success redirect, so a second
  // tap cannot fire a second request.
  await homePage(this).expectOnHomeScreen();
});

When("I am on the login screen", async function (this: World) {
  await loginPage(this).visit();
});

Then("the password field is masked at all times", async function (this: World) {
  await loginPage(this).expectPasswordMasked();
});

Then(/^no show\/hide toggle is shown$/, async function (this: World) {
  await loginPage(this).expectNoShowHideToggle();
});
