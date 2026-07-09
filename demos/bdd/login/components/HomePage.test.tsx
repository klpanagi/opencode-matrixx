import { describe, expect, test, afterEach } from 'bun:test';
import './test-utils';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HomePage } from './HomePage';

afterEach(() => {
  cleanup();
});

describe('HomePage', () => {
  test('renders the home page placeholder', () => {
    const { getByTestId } = render(<HomePage />);
    expect(getByTestId('home-page')).toBeInTheDocument();
    expect(getByTestId('home-page')).toHaveTextContent('Home');
  });
});
