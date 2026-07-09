import { Window } from 'happy-dom';
import { afterEach } from 'bun:test';

const happyWindow = new Window({ url: 'http://localhost:3000' });

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

{
  const preserved = new Set([
    'Bun',
    'fetch',
    'Request',
    'Response',
    'Headers',
    'URL',
    'URLSearchParams',
    'Blob',
    'FormData',
    'File',
    'ReadableStream',
    'WritableStream',
    'TransformStream',
    'TextEncoder',
    'TextDecoder',
    'crypto',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'queueMicrotask',
    'console',
    'performance',
  ]);

  for (const key of Object.getOwnPropertyNames(
    happyWindow.constructor.prototype,
  )) {
    if (preserved.has(key)) continue;
    const desc = Object.getOwnPropertyDescriptor(
      happyWindow.constructor.prototype,
      key,
    );
    if (desc) {
      Object.defineProperty(globalThis, key, {
        get: () =>
          (happyWindow as unknown as Record<string, unknown>)[key],
        set: (v: unknown) => {
          ((happyWindow as unknown) as Record<string, unknown>)[key] = v;
        },
        configurable: true,
      });
    }
  }

  for (const key of Object.getOwnPropertyNames(happyWindow)) {
    if (preserved.has(key) || key in globalThis) continue;
    const desc = Object.getOwnPropertyDescriptor(happyWindow, key);
    if (desc) {
      Object.defineProperty(globalThis, key, {
        get: () =>
          (happyWindow as unknown as Record<string, unknown>)[key],
        set: (v: unknown) => {
          ((happyWindow as unknown) as Record<string, unknown>)[key] = v;
        },
        configurable: true,
      });
    }
  }
}

if (!document.body) {
  const body = document.createElement('body');
  document.documentElement!.appendChild(body);
}

afterEach(() => {
  document.body.innerHTML = '';
  happyWindow.sessionStorage.clear();
  happyWindow.localStorage.clear();
  happyWindow.history.pushState(null, '', '/');
});
