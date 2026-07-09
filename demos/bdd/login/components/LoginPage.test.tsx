import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import './test-utils';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { LoginPage } from './LoginPage';
import {
  AUTH_SIGN_IN,
  AUTH_SIGNING_IN,
  AUTH_LOGIN_SUCCESS,
  AUTH_EMPTY_FIELDS_ERROR,
  AUTH_INVALID_CREDENTIALS_ERROR,
  AUTH_ACCOUNT_LOCKED_ERROR,
  AUTH_ACCOUNT_SUSPENDED_MESSAGE,
  AUTH_QUICK_LOGIN_EXPIRED,
  AUTH_GENERIC_ERROR,
} from './LoginConstants';

function mockFetchResponse(status: number, body: Record<string, unknown>) {
  globalThis.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  ) as unknown as typeof globalThis.fetch;
}

function deferredFetchMock(): {
  resolve: (value: Response) => void;
} {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  globalThis.fetch = mock(() => promise) as unknown as typeof globalThis.fetch;
  return { resolve };
}

const origLocation = window.location;

beforeEach(() => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response('{}', { status: 200 }))) as unknown as typeof globalThis.fetch;
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  if (window.location !== origLocation) {
    Object.defineProperty(window, 'location', {
      value: origLocation,
      writable: true,
      configurable: true,
    });
  }
});

describe('LoginPage', () => {
  test('renders the form with empty fields on mount', () => {
    const { getByTestId } = render(<LoginPage />);

    expect(getByTestId('username-input')).toBeInTheDocument();
    expect(getByTestId('password-input')).toBeInTheDocument();
    expect(getByTestId('sign-in-button')).toBeInTheDocument();

    const usernameInput = getByTestId('username-input') as HTMLInputElement;
    const passwordInput = getByTestId('password-input') as HTMLInputElement;
    expect(usernameInput.value).toBe('');
    expect(passwordInput.value).toBe('');
  });

  test('shows the empty-fields error when Sign in is tapped with empty fields', async () => {
    const user = userEvent.setup();
    const { getByTestId, queryByTestId } = render(<LoginPage />);

    await user.click(getByTestId('sign-in-button'));

    expect(queryByTestId('login-error-message')).toBeInTheDocument();
    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_EMPTY_FIELDS_ERROR,
    );
  });

  test('shows the invalid-credentials error when login returns 401', async () => {
    mockFetchResponse(401, { error: 'Invalid credentials' });
    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'wrong');
    await user.type(getByTestId('password-input'), 'wrong');
    await user.click(getByTestId('sign-in-button'));

    getByTestId('login-error-message');
    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_INVALID_CREDENTIALS_ERROR,
    );
  });

  test('shows the locked error when login returns 423', async () => {
    mockFetchResponse(423, { error: 'Account locked', code: 'ACCOUNT_LOCKED' });
    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'locked-user');
    await user.type(getByTestId('password-input'), 'anything');
    await user.click(getByTestId('sign-in-button'));

    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_ACCOUNT_LOCKED_ERROR,
    );
  });

  test('shows the suspended error when login returns 403', async () => {
    mockFetchResponse(403, {
      error: 'Account suspended',
      code: 'ACCOUNT_SUSPENDED',
    });
    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'suspended-user');
    await user.type(getByTestId('password-input'), 'anything');
    await user.click(getByTestId('sign-in-button'));

    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_ACCOUNT_SUSPENDED_MESSAGE,
    );
  });

  test('shows the success message and navigates to /home on 200', async () => {
    mockFetchResponse(200, {
      token: 'mock-jwt-token',
      userId: 'user-001',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');
    await user.type(getByTestId('password-input'), 'correct');
    await user.click(getByTestId('sign-in-button'));

    expect(getByTestId('login-success-message')).toHaveTextContent(
      AUTH_LOGIN_SUCCESS,
    );
    expect(window.location.href).toBe('/home');
  });

  test('shows the Quick Login Expired banner when the prop is set', () => {
    const { getByTestId } = render(<LoginPage quickLoginExpired={true} />);

    expect(getByTestId('quick-login-expired-banner')).toBeInTheDocument();
    expect(getByTestId('quick-login-expired-banner')).toHaveTextContent(
      AUTH_QUICK_LOGIN_EXPIRED,
    );
  });

  test('does NOT show the Quick Login Expired banner when prop is false', () => {
    const { queryByTestId } = render(
      <LoginPage quickLoginExpired={false} />,
    );

    expect(
      queryByTestId('quick-login-expired-banner'),
    ).not.toBeInTheDocument();
  });

  test('button is disabled and shows "Signing in..." while the request is in flight', async () => {
    deferredFetchMock();
    const user = userEvent.setup({ delay: null });
    const { getByTestId, unmount } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');
    await user.type(getByTestId('password-input'), 'correct');

    // fireEvent + async act drains the fetch micro-task so the in-flight
    // setIsLoading(true) settles inside the act boundary, then the deferred
    // promise is rejected on unmount to release the pending handlers.
    await act(async () => {
      fireEvent.click(getByTestId('sign-in-button'));
    });

    const button = getByTestId('sign-in-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button).toHaveTextContent(AUTH_SIGNING_IN);

    expect(getByTestId('loading-indicator')).toBeInTheDocument();

    unmount();
  });

  test('rapid double-clicks on Sign in do not fire duplicate requests', async () => {
    const { resolve } = deferredFetchMock();
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');
    await user.type(getByTestId('password-input'), 'correct');

    await act(async () => {
      fireEvent.click(getByTestId('sign-in-button'));
      fireEvent.click(getByTestId('sign-in-button'));
    });

    await act(async () => {
      resolve(
        new Response(
          JSON.stringify({
            token: 'mock-jwt-token',
            userId: 'user-001',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('password field is type="password" and no show/hide toggle is present', () => {
    const { getByTestId, queryByTestId } = render(<LoginPage />);

    const passwordInput = getByTestId('password-input') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    expect(queryByTestId(/show|hide|toggle|eye/i)).not.toBeInTheDocument();
  });

  test('tapping the biometric shortcut navigates to /login/biometric', () => {
    const { getByTestId } = render(<LoginPage />);

    fireEvent.click(getByTestId('biometric-shortcut-button'));

    expect(window.location.href).toBe('/login/biometric');
  });

  test('biometric shortcut preserves the partially-entered username', async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');

    act(() => {
      fireEvent.click(getByTestId('biometric-shortcut-button'));
    });

    expect(sessionStorage.getItem('preservedUsername')).toBe('admin');
  });

  test('shows generic error on network failure', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error('Network error')),
    ) as unknown as typeof globalThis.fetch;

    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');
    await user.type(getByTestId('password-input'), 'correct');
    await user.click(getByTestId('sign-in-button'));

    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_GENERIC_ERROR,
    );
  });

  test('shows generic error on non-standard HTTP status (500)', async () => {
    mockFetchResponse(500, { error: 'Server error' });
    const user = userEvent.setup();
    const { getByTestId } = render(<LoginPage />);

    await user.type(getByTestId('username-input'), 'admin');
    await user.type(getByTestId('password-input'), 'correct');
    await user.click(getByTestId('sign-in-button'));

    expect(getByTestId('login-error-message')).toHaveTextContent(
      AUTH_GENERIC_ERROR,
    );
  });
});
