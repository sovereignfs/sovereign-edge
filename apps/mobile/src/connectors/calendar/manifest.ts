import type { ConnectorManifestTier3 } from '@sovereignfs/connector-sdk';

/**
 * The Calendar connector's manifests (task 10.1).
 *
 * Four tools, four manifests — not one manifest with four tools. The Tier 3
 * schema (`packages/connector-sdk/src/schema.ts`) gives every manifest
 * exactly one `tool` and one `handler.capability`; there is no shape for
 * "one connector, several tools." This is a deliberate fit with the app's
 * existing "no blanket toggle, per-connector consent" model
 * (`permissions/grants.ts`'s own doc comment) rather than a workaround —
 * a user can grant `query_events` without also granting `delete_event`.
 *
 * Each manifest's `permissions.device.capabilities` and `handler.capability`
 * are the same single string (`calendar.event.create` etc.), mirroring
 * `device_info`'s own precedent — the validator's cross-field rule
 * (`packages/connector-sdk/src/validate.ts`'s `tier3CrossFieldIssues`)
 * requires `handler.capability` to actually be a *member* of
 * `permissions.device.capabilities`, so a coarser shared scope like
 * `calendar.write` covering three manifests while each dispatches through
 * its own distinct handler key is not expressible without listing both
 * strings per manifest — which would just make the per-connector "scope"
 * text shown to the user (`connectorScope()`, joined into the
 * `ConnectorsScreen` subtitle) redundant. The real "one shared OS
 * permission for all four" behavior lives entirely in
 * `permissions/calendarAccess.ts`, not in these capability strings — it
 * requests calendar access once regardless of which specific capability
 * string triggered it.
 *
 * MVP scope, per the epic doc: single, non-recurring, timezone-naive events;
 * a reminder is an alert offset on the event, not a separate API surface
 * (Android has no OS-level Reminders list to target); new events go to the
 * device's default calendar — no calendar-picker in v1.
 */

const ID_PREFIX = 'fs.sovereign.calendar';
const PLATFORMS = ['ios', 'android'] as const;

const EVENT_ID_PROPERTY = {
  eventId: {
    type: 'string',
    description: 'The event id returned by a prior create or query call.',
  },
} as const;

const START_END_PROPERTIES = {
  startDate: {
    type: 'string',
    description: 'When the event starts, as an ISO 8601 date-time.',
  },
  endDate: {
    type: 'string',
    description: 'When the event ends, as an ISO 8601 date-time.',
  },
} as const;

const REMINDER_PROPERTY = {
  alertMinutesBefore: {
    type: 'number',
    description:
      'Minutes before the event to show a reminder. Omit for no reminder.',
  },
} as const;

export const CALENDAR_CREATE_EVENT_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: `${ID_PREFIX}.create-event`,
  name: 'Calendar — Create Event',
  version: '1.0.0',
  summary: 'Creates an event on your device calendar.',
  tier: 3,
  platforms: [...PLATFORMS],
  tool: {
    name: 'calendar_create_event',
    description: 'Creates a new event on the device calendar.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The event title.' },
        ...START_END_PROPERTIES,
        notes: { type: 'string', description: 'Optional event notes.' },
        ...REMINDER_PROPERTY,
      },
      required: ['title', 'startDate', 'endDate'],
    },
  },
  permissions: { device: { capabilities: ['calendar.event.create'] } },
  handler: { capability: 'calendar.event.create' },
  pricing: { model: 'free' },
};

export const CALENDAR_UPDATE_EVENT_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: `${ID_PREFIX}.update-event`,
  name: 'Calendar — Update Event',
  version: '1.0.0',
  summary: 'Updates an existing event on your device calendar.',
  tier: 3,
  platforms: [...PLATFORMS],
  tool: {
    name: 'calendar_update_event',
    description:
      'Updates an event previously created or found on the device calendar.',
    parameters: {
      type: 'object',
      properties: {
        ...EVENT_ID_PROPERTY,
        title: { type: 'string', description: 'The new event title.' },
        startDate: {
          type: 'string',
          description: 'The new start time, as an ISO 8601 date-time.',
        },
        endDate: {
          type: 'string',
          description: 'The new end time, as an ISO 8601 date-time.',
        },
        notes: { type: 'string', description: 'The new event notes.' },
        ...REMINDER_PROPERTY,
      },
      required: ['eventId'],
    },
  },
  permissions: { device: { capabilities: ['calendar.event.update'] } },
  handler: { capability: 'calendar.event.update' },
  pricing: { model: 'free' },
};

export const CALENDAR_DELETE_EVENT_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: `${ID_PREFIX}.delete-event`,
  name: 'Calendar — Delete Event',
  version: '1.0.0',
  summary: 'Deletes an event from your device calendar.',
  tier: 3,
  platforms: [...PLATFORMS],
  tool: {
    name: 'calendar_delete_event',
    description: 'Deletes an event from the device calendar.',
    parameters: {
      type: 'object',
      properties: { ...EVENT_ID_PROPERTY },
      required: ['eventId'],
    },
  },
  permissions: { device: { capabilities: ['calendar.event.delete'] } },
  handler: { capability: 'calendar.event.delete' },
  pricing: { model: 'free' },
};

export const CALENDAR_QUERY_EVENTS_MANIFEST: ConnectorManifestTier3 = {
  manifestVersion: 1,
  id: `${ID_PREFIX}.query-events`,
  name: 'Calendar — Query Events',
  version: '1.0.0',
  summary: 'Reads events from your device calendar.',
  tier: 3,
  platforms: [...PLATFORMS],
  tool: {
    name: 'calendar_query_events',
    description: 'Lists events on the device calendar within a date range.',
    parameters: {
      type: 'object',
      properties: { ...START_END_PROPERTIES },
      required: ['startDate', 'endDate'],
    },
  },
  permissions: { device: { capabilities: ['calendar.event.query'] } },
  handler: { capability: 'calendar.event.query' },
  pricing: { model: 'free' },
};

export const CALENDAR_MANIFESTS: ConnectorManifestTier3[] = [
  CALENDAR_CREATE_EVENT_MANIFEST,
  CALENDAR_UPDATE_EVENT_MANIFEST,
  CALENDAR_DELETE_EVENT_MANIFEST,
  CALENDAR_QUERY_EVENTS_MANIFEST,
];

/** Every calendar connector id, for call sites that need to recognize one
 * (e.g. the pre-grant OS permission step) without importing all four
 * manifests just to read their `id` fields. */
export const CALENDAR_CONNECTOR_IDS: string[] = CALENDAR_MANIFESTS.map(
  (m) => m.id,
);
