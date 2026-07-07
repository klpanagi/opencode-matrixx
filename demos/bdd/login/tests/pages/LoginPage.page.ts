import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Username and Password Login screen.
 * Covers: /login route
 * Test IDs: username_field, password_field, sign_in_button,
 *            biometric_shortcut_button, error_message, success_message, lockout_banner
 */
export class LoginPage {
  readonly page: Page;

  // --- Locators (testid-based) ---
  readonly usernameField: Locator;
  readonly passwordField: Locator;
  readonly signInButton: Locator;
  readonly biometricShortcutButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly lockoutBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameField = page.getByTestId('username_field');
    this.passwordField = page.getByTestId('password_field');
    this.signInButton = page.getByTestId('sign_in_button');
    this.biometricShortcutButton = page.getByTestId('biometric_shortcut_button');
    this.errorMessage = page.getByTestId('error_message');
    this.successMessage = page.getByTestId('success_message');
    this.lockoutBanner = page.getByTestId('lockout_banner');
  }

  // --- Navigation ---

  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.usernameField.waitFor({ state: 'visible' });
    await this.passwordField.waitFor({ state: 'visible' });
    await this.signInButton.waitFor({ state: 'visible' });
  }

  // --- Actions ---

  async enterUsername(username: string): Promise<void> {
    await this.usernameField.fill(username);
  }

  async enterPassword(password: string): Promise<void> {
    await this.passwordField.fill(password);
  }

  async enterCredentials(username: string, password: string): Promise<void> {
    await this.enterUsername(username);
    await this.enterPassword(password);
  }

  async tapSignIn(): Promise<void> {
    await this.signInButton.click();
  }

  async submitValidCredentials(username: string, password: string): Promise<void> {
    await this.enterCredentials(username, password);
    await this.tapSignIn();
  }

  async submitEmptyFields(): Promise<void> {
    await this.tapSignIn();
  }

  async tapBiometricShortcut(): Promise<void> {
    await this.biometricShortcutButton.click();
  }

  async clearUsernameField(): Promise<void> {
    await this.usernameField.clear();
  }

  async clearPasswordField(): Promise<void> {
    await this.passwordField.clear();
  }

  // --- Assertions: Success state ---

  async expectLoginSuccessfulMessage(): Promise<void> {
    await expect(this.successMessage).toBeVisible();
    await expect(this.successMessage).toContainText('Login successful!');
  }

  async expectNavigatedToHome(): Promise<void> {
    await this.page.waitForURL('**/home', { timeout: 2000 });
  }

  async expectSigningInProgress(): Promise<void> {
    await expect(this.signInButton).toHaveText('Signing in...');
    await expect(this.signInButton).toBeDisabled();
  }

  async expectButtonActive(): Promise<void> {
    await expect(this.signInButton).toBeEnabled();
    await expect(this.signInButton).toHaveText('Sign in');
  }

  // --- Assertions: Error state ---

  async expectEmptyFieldsError(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(
      'Please enter both username and password.',
    );
  }

  async expectInvalidCredentialsError(): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    await expect(this.errorMessage).toContainText(
      'Invalid username or password. Please try again.',
    );
  }

  async expectAccountLockedError(): Promise<void> {
    await expect(this.lockoutBanner).toBeVisible();
    await expect(this.lockoutBanner).toContainText(
      'Your account has been locked due to multiple failed login attempts.',
    );
  }

  async expectQuickLoginExpiredBanner(): Promise<void> {
    await expect(this.lockoutBanner).toBeVisible();
    await expect(this.lockoutBanner).toContainText(
      'Quick Login Expired. For your security, please sign in again with your email and password.',
    );
  }

  async expectNoAttemptCountDisclosure(): Promise<void> {
    const text = await this.page.textContent('body');
    expect(text).not.toMatch(/attempts?\s+(left|remaining)/i);
  }

  // --- Assertions: Password masking ---

  async expectPasswordFieldMasked(): Promise<void> {
    await expect(this.passwordField).toHaveAttribute('type', 'password');
  }

  async expectNoPasswordToggle(): Promise<void> {
    const toggle = this.page.locator(
      '[data-testid="password_toggle"], [aria-label="Show password"], [aria-label="Hide password"]',
    );
    await expect(toggle).toHaveCount(0);
  }

  // --- Assertions: Loading / disabled states ---

  async expectLoadingState(): Promise<void> {
    await expect(this.signInButton).toBeDisabled();
  }

  async expectNoSuccessPage(): Promise<void> {
    const successPage = this.page.locator('[data-testid="success_page"]');
    await expect(successPage).toHaveCount(0);
  }

  // --- Utility ---

  async getUsernameValue(): Promise<string> {
    return (await this.usernameField.inputValue()) ?? '';
  }

  async isUsernameFieldEmpty(): Promise<boolean> {
    const value = await this.getUsernameValue();
    return value.length === 0;
  }

  async isPasswordFieldEmpty(): Promise<boolean> {
    const value = (await this.passwordField.inputValue()) ?? '';
    return value.length === 0;
  }
}
