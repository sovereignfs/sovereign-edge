import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library's automatic per-test cleanup is wired to Jest's global
// afterEach by default; this project runs Vitest with `globals: false`
// (explicit imports everywhere else in this codebase), so it's wired by
// hand here instead — without this, a component left mounted by one test
// would still be in the DOM when the next test queries it.
afterEach(() => {
  cleanup();
});

// jsdom implements no media-query machinery at all — `desktop-ui`'s
// `ThemeProvider` calls `window.matchMedia(...)` unconditionally on mount
// to read the OS light/dark preference, so every test that renders under
// `ThemeProvider` needs this to exist. Always reports "not dark" (light):
// deterministic across CI machines regardless of their real OS setting,
// and every test that cares about a specific scheme sets `preference`
// explicitly rather than relying on this default.
// jsdom implements no scroll machinery either — `ChatScreen.tsx` calls
// `Element.scrollTo(...)` to keep the transcript pinned to the bottom as
// new messages arrive; a no-op here is correct for tests, which don't
// have a real viewport to scroll anyway.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
