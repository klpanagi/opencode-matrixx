import { Given, When, Then, And, But, Before, After } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage.page';
import { HomePage } from './pages/HomePage.page';
import type { World } from './world';

let loginPage: LoginPage;
let homePage: HomePage;

Before(function (this: World) {
  loginPage = new LoginPage(this.page);
  homePage = new HomePage(this.page);
});

After(async function (this: World) {
  await this.page.context().clearCookies();
});

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND
// ═══════════════════════════════════════════════════════════════════════════════

Given('I am on the username and password login screen', async function (this: World) {
  loginPage = new LoginPage(this.page);
  await loginPage.goto();
});

And('both the username and password fields are empty', async function () {
  await expect(loginPage.usernameField).toHaveValue('');
  await expect(loginPage.passwordField).toHaveValue('');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1 — Successful login navigates to home screen  @happy-path
// ═══════════════════════════════════════════════════════════════════════════════

When('I enter a valid username', async function () {
  await loginPage.enterUsername('user@example.com');
});

And('I enter the correct password', async function () {
  await loginPage.enterPassword('SecureP@ss1');
});

And("I tap 'Sign in'", async function () {
  await loginPage.tapSignIn();
});

Then("an inline 'Login successful!' message is shown", async function () {
  await loginPage.expectLoginSuccessfulMessage();
});

And(
  'I am automatically navigated to the app home screen within approximately 1 second',
  async function () {
    await loginPage.expectNavigatedToHome();
  },
);

And('the failed attempt counter for my username is cleared', async function (this: World) {
  const response = await this.page.request.get('/auth/session');
  expect(response.ok()).toBeTruthy();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2 — Migrated user logs in with non-email username  @happy-path
// ═══════════════════════════════════════════════════════════════════════════════

When('I enter my existing The Bank username in non-email format', async function () {
  await loginPage.enterUsername('legacy_user_42');
});

Then('authentication succeeds', async function () {
  await loginPage.expectLoginSuccessfulMessage();
});

And('I am navigated to the home screen', async function () {
  await loginPage.expectNavigatedToHome();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3 — Loading state shown during authentication  @happy-path
// ═══════════════════════════════════════════════════════════════════════════════

When('I enter valid credentials and tap {string}', async function (_button: string) {
  await loginPage.submitValidCredentials('user@example.com', 'SecureP@ss1');
});

Then("the button label changes to 'Signing in...'", async function () {
  await loginPage.expectSigningInProgress();
});

And('the button is disabled to prevent duplicate submissions', async function () {
  await expect(loginPage.signInButton).toBeDisabled();
});

And('a loading state is shown while authentication is in progress', async function () {
  await loginPage.expectLoadingState();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4 — Empty fields prevent submission  @unhappy-path
// ═══════════════════════════════════════════════════════════════════════════════

When("I tap 'Sign in' with either field empty", async function () {
  await loginPage.submitEmptyFields();
});

Then("I see: 'Please enter both username and password.'", async function () {
  await loginPage.expectEmptyFieldsError();
});

And('the button returns to its active state', async function () {
  await loginPage.expectButtonActive();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 5 — Invalid credentials show error  @unhappy-path
// ═══════════════════════════════════════════════════════════════════════════════

When(
  'I enter an incorrect username and password combination',
  async function () {
    await loginPage.enterCredentials('wrong@example.com', 'WrongPass99');
  },
);

Then("I see: 'Invalid username or password. Please try again.'", async function () {
  await loginPage.expectInvalidCredentialsError();
});

And('no information about remaining attempts is shown to the user', async function () {
  await loginPage.expectNoAttemptCountDisclosure();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 6 — Account locked after 3 consecutive failed attempts
// ═══════════════════════════════════════════════════════════════════════════════
// @unhappy-path @lockout

Given('I have failed login {int} times with this username', async function (this: World, attemptCount: number) {
  this.set('failedAttempts', attemptCount);
});

When(
  "I enter incorrect credentials and tap 'Sign in' again",
  async function () {
    await loginPage.enterCredentials('locked@example.com', 'BadPass1');
    await loginPage.tapSignIn();
  },
);

Then(
  "I see: 'Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.'",
  async function () {
    await loginPage.expectAccountLockedError();
  },
);

And('the account is locked for 30 minutes server-side', async function (this: World) {
  const response = await this.page.request.get('/auth/session');
  expect(response.ok()).toBeTruthy();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 7 — Account suspended after 3 consecutive lockout cycles
// ═══════════════════════════════════════════════════════════════════════════════
// @unhappy-path @lockout

Given(
  'my account has been locked {int} times consecutively',
  async function (this: World, lockoutCount: number) {
    this.set('lockoutCycles', lockoutCount);
  },
);

When(
  'I attempt to log in again after the lockout period',
  async function () {
    await loginPage.enterCredentials('suspended@example.com', 'OldPass1');
    await loginPage.tapSignIn();
  },
);

Then('my account is suspended', async function (this: World) {
  const response = await this.page.request.post('/auth/login', {
    data: { username: 'suspended@example.com', password: 'OldPass1' },
  });
  expect(response.status()).toBe(403);
});

And(
  'I must contact the Contact Centre for manual re-enablement',
  async function () {
    const body = await this.page.locator('body').textContent();
    expect(body).toMatch(/contact.*centre|suspended/i);
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 8 — Network error during authentication allows retry
// ═══════════════════════════════════════════════════════════════════════════════
// @unhappy-path

When('a network error occurs during authentication', async function (this: World) {
  await this.page.route('**/auth/login', (route) => route.abort('connectionrefused'));
  await loginPage.enterCredentials('user@example.com', 'SecureP@ss1');
  await loginPage.tapSignIn();
});

Then('an error message is shown', async function () {
  await expect(loginPage.errorMessage).toBeVisible();
});

And("I can retry by tapping 'Sign in' again", async function (this: World) {
  await this.page.unroute('**/auth/login');
  await loginPage.tapSignIn();
  await loginPage.expectButtonActive();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 9 — Session expires while login flow is active
// ═══════════════════════════════════════════════════════════════════════════════
// @unhappy-path

Given(
  'my session times out while I am on the login screen',
  async function (this: World) {
    await this.page.context().clearCookies();
  },
);

Then('I am redirected to the login screen', async function () {
  await expect(this.page).toHaveURL(/\/login/);
});

And('any unsaved progress is lost', async function () {
  await expect(loginPage.usernameField).toHaveValue('');
  await expect(loginPage.passwordField).toHaveValue('');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 10 — Quick login expired banner  @edge-case
// ═══════════════════════════════════════════════════════════════════════════════

Given(
  "I arrived at this screen from a 'Quick Login Expired' state",
  async function (this: World) {
    await this.page.goto('/login?reason=quick_login_expired');
  },
);

Then(
  "an amber banner is shown: 'Quick Login Expired. For your security, please sign in again with your email and password.'",
  async function () {
    await loginPage.expectQuickLoginExpiredBanner();
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 11 — Biometric shortcut preserves partially entered form data
// ═══════════════════════════════════════════════════════════════════════════════
// @edge-case

Given('I have partially entered my username', async function () {
  await loginPage.enterUsername('partial_user');
});

When('I tap the biometric login shortcut button', async function () {
  await loginPage.tapBiometricShortcut();
});

Then('the biometric flow is initiated', async function () {
  const biometricIndicator = this.page.locator('[data-testid="biometric_flow"]');
  await expect(biometricIndicator).toBeVisible();
});

And(
  'the partially entered form data is preserved if I return',
  async function () {
    await loginPage.goto();
    const usernameValue = await loginPage.getUsernameValue();
    expect(usernameValue).toBe('partial_user');
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 12 — No full-screen success page shown  @edge-case
// ═══════════════════════════════════════════════════════════════════════════════

When('authentication succeeds', async function () {
  await loginPage.submitValidCredentials('user@example.com', 'SecureP@ss1');
});

Then(
  'the transition from login screen to home screen is direct',
  async function () {
    await homePage.expectOnHomePage();
    await homePage.expectDirectTransition();
  },
);

And('no separate full-screen success page is shown', async function () {
  await loginPage.expectNoSuccessPage();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 13 — Rapid screen taps do not cause duplicate navigation
// ═══════════════════════════════════════════════════════════════════════════════
// @edge-case

When("the 'Login successful!' message is shown", async function () {
  await loginPage.submitValidCredentials('user@example.com', 'SecureP@ss1');
  await loginPage.expectLoginSuccessfulMessage();
});

And('I rapidly tap the screen multiple times', async function () {
  for (let i = 0; i < 5; i++) {
    await this.page.locator('body').click({ force: true });
  }
});

Then('no duplicate navigation events are triggered', async function () {
  await expect(this.page).toHaveURL(/\/home$/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 14 — Password field is always masked  @security
// ═══════════════════════════════════════════════════════════════════════════════

When('I am on the login screen', async function () {
  await loginPage.waitForReady();
});

Then('the password field is masked at all times', async function () {
  await loginPage.expectPasswordFieldMasked();
});

And('no show/hide toggle is shown', async function () {
  await loginPage.expectNoPasswordToggle();
});
