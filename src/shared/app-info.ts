/** Display name, kept out of `app.json` so UI code has one import for it. */
export const APP_NAME = 'Sovereign Edge';

/**
 * Kept in step with `package.json` and `app.json` by hand.
 *
 * Reading it from `expo-constants` at runtime would avoid the duplication,
 * but pulls a native module in for a string that changes once per task.
 */
export const APP_VERSION = '0.1.14';
