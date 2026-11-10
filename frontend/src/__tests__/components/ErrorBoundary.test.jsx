import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary, { isChunkLoadError } from '../../components/ui/ErrorBoundary';

const Thrower = ({ error }) => {
  if (error) {
    throw error;
  }
  return <div>Normal Content</div>;
};

describe('ErrorBoundary & isChunkLoadError', () => {
  let originalLocation;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    originalLocation = window.location;
    delete window.location;
    window.location = { reload: vi.fn() };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.location = originalLocation;
  });

  describe('isChunkLoadError helper', () => {
    it('detects dynamic import / chunk errors', () => {
      expect(
        isChunkLoadError(
          new TypeError('Failed to fetch dynamically imported module: https://room-allocation-six.vercel.app/assets/Bookings-DLEdwvEK.js')
        )
      ).toBe(true);

      expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
      expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
      expect(isChunkLoadError(new Error('Loading chunk 123 failed'))).toBe(true);
    });

    it('returns false for standard runtime errors', () => {
      expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
      expect(isChunkLoadError(new Error('Network error: 500'))).toBe(false);
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
    });
  });

  describe('Component Rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Everything is fine</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Everything is fine')).toBeInTheDocument();
    });

    it('renders standard error fallback for ordinary errors', () => {
      render(
        <ErrorBoundary>
          <Thrower error={new Error('Standard application failure')} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
      expect(screen.getByText('Error Details')).toBeInTheDocument();
      expect(screen.getByText('Standard application failure')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
    });

    it('renders update-available fallback for dynamic import errors', () => {
      const chunkError = new TypeError(
        'Failed to fetch dynamically imported module: https://room-allocation-six.vercel.app/assets/Bookings-DLEdwvEK.js'
      );

      render(
        <ErrorBoundary>
          <Thrower error={chunkError} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Update Available')).toBeInTheDocument();
      expect(screen.getByText('New Version Detected')).toBeInTheDocument();
      expect(
        screen.getByText(/newer version of the application was deployed/i)
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /refresh to update/i })).toBeInTheDocument();
    });

    it('triggers window.location.reload when Refresh to Update is clicked', () => {
      const chunkError = new TypeError(
        'Failed to fetch dynamically imported module: https://room-allocation-six.vercel.app/assets/Bookings-DLEdwvEK.js'
      );

      render(
        <ErrorBoundary>
          <Thrower error={chunkError} />
        </ErrorBoundary>
      );

      const refreshButton = screen.getByRole('button', { name: /refresh to update/i });
      fireEvent.click(refreshButton);

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it('reloads page when reset is invoked on a chunk load error', () => {
      const chunkError = new TypeError('Failed to fetch dynamically imported module');
      const onReset = vi.fn();

      const { container } = render(
        <ErrorBoundary onReset={onReset}>
          <Thrower error={chunkError} />
        </ErrorBoundary>
      );

      // Even if resetErrorBoundary is called directly
      const buttons = container.querySelectorAll('button');
      fireEvent.click(buttons[0]);

      expect(window.location.reload).toHaveBeenCalled();
      expect(onReset).not.toHaveBeenCalled();
    });
  });
});
