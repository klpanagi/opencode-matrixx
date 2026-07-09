import { describe, expect, test, afterEach } from 'bun:test';
import './test-utils';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BiometricLoginPage } from './BiometricLoginPage';

afterEach(() => {
  cleanup();
});

describe('BiometricLoginPage', () => {
  test('renders the biometric login page placeholder', () => {
    const { getByTestId } = render(<BiometricLoginPage />);
    expect(getByTestId('biometric-login-page')).toBeInTheDocument();
    expect(getByTestId('biometric-login-page')).toHaveTextContent(
      'Biometric login',
    );
  });
});
