import * as Calendar from 'expo-calendar/legacy';

/**
 * The real OS calendar permission, requested once for all four calendar
 * connectors (task 10.1) rather than once per connector.
 *
 * All four calendar manifests (`../calendar/manifest.ts`) share one
 * underlying OS permission domain — there is exactly one "Calendar" entry
 * in iOS/Android system settings, regardless of the app's own finer-grained
 * `calendar.read`/`calendar.write` grant scopes. Prompting once per
 * connector row would show the same system dialog up to four times, which
 * the OS itself would only actually display once anyway (it remembers a
 * decided status and returns it immediately on a repeat request) — but
 * checking status first, rather than calling `requestCalendarPermissionsAsync`
 * unconditionally, keeps that "already decided" case a plain status read
 * with no request round trip.
 *
 * This is deliberately separate from the app's own `grant()`
 * (`permissions/grants.ts`) — that call records the user's in-app consent
 * for one connector; this one is the OS's own decision, which every
 * calendar connector's grant depends on but none of them owns. The caller
 * (`ConnectorsScreen.tsx`) must call this and see `granted: true` before
 * calling `grant()` — never the other way around, or the app would record
 * "granted" for a connector the OS will actually refuse to run.
 */
export async function ensureCalendarAccess(): Promise<{ granted: boolean }> {
  const current = await Calendar.getCalendarPermissionsAsync();
  if (current.status === 'granted') {
    return { granted: true };
  }
  const requested = await Calendar.requestCalendarPermissionsAsync();
  return { granted: requested.status === 'granted' };
}
