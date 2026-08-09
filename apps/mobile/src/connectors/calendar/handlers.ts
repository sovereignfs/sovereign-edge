import * as Calendar from 'expo-calendar/legacy';
import { Platform } from 'react-native';

import type { NativeHandler } from '../runtime/nativeHandlers';

/**
 * The Calendar connector's native handlers (task 10.1), registered into
 * `runtime/nativeHandlers.ts`'s `NATIVE_HANDLERS` map under the dispatch
 * keys `manifest.ts` assigns each of the four manifests
 * (`calendar.create-event`/`.update-event`/`.delete-event`/`.query-events` —
 * distinct from the shared `calendar.read`/`calendar.write` permission
 * scope those manifests declare, see `manifest.ts`'s own doc comment).
 *
 * `expo-calendar`'s default export (`'expo-calendar'`) is SDK 57's new,
 * sync-first rewrite, which has no event CRUD at all — `createEventAsync`/
 * `updateEventAsync`/`deleteEventAsync`/`getEventsAsync`/
 * `getDefaultCalendarAsync` only exist under the `'expo-calendar/legacy'`
 * subpath (confirmed by reading the package's own `build/legacy/Calendar.d.ts`
 * and `package.json`'s `exports` map, not assumed from memory of an older
 * SDK's API shape).
 */

async function defaultCalendarId(): Promise<string> {
  // `getDefaultCalendarAsync` is iOS-only (the package's own `@platform ios`
  // doc tag) — Android has no single "default calendar" concept, so this
  // picks the primary calendar, falling back to the first one the app can
  // actually write to.
  if (Platform.OS === 'ios') {
    const calendar = await Calendar.getDefaultCalendarAsync();
    return calendar.id;
  }
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT,
  );
  const target =
    calendars.find((c) => c.isPrimary) ??
    calendars.find((c) => c.allowsModifications);
  if (!target) {
    throw new Error('No writable calendar found on this device.');
  }
  return target.id;
}

/** A reminder is an alert offset on the event, not a separate API surface
 * (research 0005 — Android has no OS-level Reminders list to target).
 * `expo-calendar`'s `Alarm.relativeOffset` is minutes relative to the
 * event's start, negative meaning "before" — `alertMinutesBefore` is always
 * stated as a positive number of minutes before the event, so it is negated
 * here rather than asking the model to reason about sign conventions. */
function alarmsFor(alertMinutesBefore: unknown): Calendar.Alarm[] {
  if (typeof alertMinutesBefore !== 'number') return [];
  return [{ relativeOffset: -alertMinutesBefore }];
}

function stringArg(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export const createEvent: NativeHandler = async (args) => {
  const title = stringArg(args, 'title');
  const startDate = parseDate(stringArg(args, 'startDate'));
  const endDate = parseDate(stringArg(args, 'endDate'));
  if (!title || !startDate || !endDate) {
    return {
      ok: false,
      reason: 'invalid-arguments',
      detail: 'title, startDate, and endDate are required.',
    };
  }

  try {
    const calendarId = await defaultCalendarId();
    const eventId = await Calendar.createEventAsync(calendarId, {
      title,
      startDate,
      endDate,
      notes: stringArg(args, 'notes'),
      alarms: alarmsFor(args.alertMinutesBefore),
    });
    return { ok: true, text: `Created event "${title}" (id: ${eventId}).` };
  } catch (error) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: error instanceof Error ? error.message : 'Could not create the event.',
    };
  }
};

export const updateEvent: NativeHandler = async (args) => {
  const eventId = stringArg(args, 'eventId');
  if (!eventId) {
    return {
      ok: false,
      reason: 'invalid-arguments',
      detail: 'eventId is required.',
    };
  }

  const title = stringArg(args, 'title');
  const startDate = parseDate(stringArg(args, 'startDate'));
  const endDate = parseDate(stringArg(args, 'endDate'));
  const notes = stringArg(args, 'notes');

  try {
    await Calendar.updateEventAsync(eventId, {
      ...(title ? { title } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(notes ? { notes } : {}),
      ...(typeof args.alertMinutesBefore === 'number'
        ? { alarms: alarmsFor(args.alertMinutesBefore) }
        : {}),
    });
    return { ok: true, text: `Updated event ${eventId}.` };
  } catch (error) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: error instanceof Error ? error.message : 'Could not update the event.',
    };
  }
};

export const deleteEvent: NativeHandler = async (args) => {
  const eventId = stringArg(args, 'eventId');
  if (!eventId) {
    return {
      ok: false,
      reason: 'invalid-arguments',
      detail: 'eventId is required.',
    };
  }

  try {
    await Calendar.deleteEventAsync(eventId);
    return { ok: true, text: `Deleted event ${eventId}.` };
  } catch (error) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: error instanceof Error ? error.message : 'Could not delete the event.',
    };
  }
};

export const queryEvents: NativeHandler = async (args) => {
  const startDate = parseDate(stringArg(args, 'startDate'));
  const endDate = parseDate(stringArg(args, 'endDate'));
  if (!startDate || !endDate) {
    return {
      ok: false,
      reason: 'invalid-arguments',
      detail: 'startDate and endDate are required.',
    };
  }

  try {
    // Query spans every calendar the app can read, not just the default
    // one — "what's on my calendar" (research 0005) means the whole
    // device, not only where new events are written.
    const calendars = await Calendar.getCalendarsAsync(
      Calendar.EntityTypes.EVENT,
    );
    const events = await Calendar.getEventsAsync(
      calendars.map((c) => c.id),
      startDate,
      endDate,
    );
    if (events.length === 0) {
      return { ok: true, text: 'No events found in that range.' };
    }
    const lines = events.map(
      (event) =>
        `${event.title} (id: ${event.id}): ${new Date(event.startDate).toISOString()} – ${new Date(event.endDate).toISOString()}`,
    );
    return { ok: true, text: lines.join('\n') };
  } catch (error) {
    return {
      ok: false,
      reason: 'handler-error',
      detail: error instanceof Error ? error.message : 'Could not read the calendar.',
    };
  }
};
