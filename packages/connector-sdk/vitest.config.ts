import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `validate.test.ts` is relocated verbatim from apps/mobile, which
    // relies on Jest's global describe/it/expect rather than importing
    // them explicitly. `globals: true` lets it run unmodified.
    globals: true,
  },
});
