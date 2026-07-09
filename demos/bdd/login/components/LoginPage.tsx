import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { LoginPageProps } from './LoginTypes';
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

// Biometric username preservation strategy:
// We use sessionStorage to persist the partially-entered username across
// route transitions. When the biometric shortcut is tapped, the current
// username is saved to sessionStorage. On mount, we restore it if present.
// This avoids requiring the parent to hold form state across navigation.

const LoginPage: React.FC<LoginPageProps> = ({
  quickLoginExpired = false,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const preserved = sessionStorage.getItem('preservedUsername');
    if (preserved) {
      setUsername(preserved);
      sessionStorage.removeItem('preservedUsername');
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (loadingRef.current) return;

      setError(null);
      setSuccessMessage(null);

      if (!username.trim() || !password.trim()) {
        setError(AUTH_EMPTY_FIELDS_ERROR);
        return;
      }

      setIsLoading(true);
      loadingRef.current = true;

      try {
        const response = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            password,
          }),
        });

        if (response.ok) {
          setSuccessMessage(AUTH_LOGIN_SUCCESS);
          window.location.href = '/home';
        } else if (response.status === 401) {
          setError(AUTH_INVALID_CREDENTIALS_ERROR);
        } else if (response.status === 423) {
          setError(AUTH_ACCOUNT_LOCKED_ERROR);
        } else if (response.status === 403) {
          setError(AUTH_ACCOUNT_SUSPENDED_MESSAGE);
        } else {
          setError(AUTH_GENERIC_ERROR);
        }
      } catch {
        setError(AUTH_GENERIC_ERROR);
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    },
    [username, password],
  );

  const handleBiometricClick = useCallback(() => {
    if (username.trim()) {
      sessionStorage.setItem('preservedUsername', username.trim());
    }
    window.location.href = '/login/biometric';
  }, [username]);

  return (
    <div>
      {quickLoginExpired && (
        <div
          data-testid="quick-login-expired-banner"
          style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            padding: '12px',
            marginBottom: '16px',
            borderRadius: '4px',
          }}
        >
          {AUTH_QUICK_LOGIN_EXPIRED}
        </div>
      )}

      {successMessage && (
        <div
          data-testid="login-success-message"
          style={{ color: 'green', marginBottom: '12px' }}
        >
          {successMessage}
        </div>
      )}

      {error && (
        <div
          data-testid="login-error-message"
          style={{ color: 'red', marginBottom: '12px' }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            data-testid="username-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            data-testid="password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          data-testid="sign-in-button"
          disabled={isLoading}
        >
          {isLoading ? AUTH_SIGNING_IN : AUTH_SIGN_IN}
        </button>
      </form>

        <button
          type="button"
          data-testid="biometric-shortcut-button"
          onClick={handleBiometricClick}
          disabled={isLoading}
        >
          Biometric Login
        </button>

        {isLoading && (
          <div
            data-testid="loading-indicator"
            role="status"
            aria-label="Loading"
            style={{
              textAlign: 'center',
              color: '#666',
              fontSize: '0.875rem',
              marginTop: '8px',
            }}
          >
            Signing in...
          </div>
        )}
      </div>
  );
};

export { LoginPage };
export default LoginPage;
