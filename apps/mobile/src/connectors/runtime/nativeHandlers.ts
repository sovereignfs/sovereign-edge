import * as Device from 'expo-device';

import {
  createEvent,
  deleteEvent,
  queryEvents,
  updateEvent,
} from '../calendar/handlers';
import { setBrightness } from '../device/handlers';
import type { ExecutionResult } from './types';

/**
 * The Tier 3 native handler registry (task 2.6).
 *
 * A Tier 1 connector is entirely described by its manifest; a Tier 3
 * connector is its manifest plus exactly one entry here. This map is the
 * whole of that extension point — `executeConnectorCall`'s `case 3` looks up
 * a manifest's `handler.capability` here and calls whatever it finds, with no
 * other connector-specific code in the runtime.
 *
 * A handler receives the model's arguments (already an object; empty when the
 * tool call carried none) and returns an `ExecutionResult` directly, the same
 * shape `executeTier1` produces — a native failure and an HTTP failure are
 * both just "the connector didn't answer" to whatever calls this.
 *
 * `isAllowed()` is checked by the caller before dispatch, same as Tier 1 —
 * a handler here is never reached for a capability the user hasn't granted.
 *
 * `device.info` was this task's original proof-of-life handler:
 * reserved-but-real scaffolding, not a shipped connector, proving the
 * extension point worked end to end before any real Tier 3 connector
 * needed it. Calendar (task 10.1, `../calendar/handlers.ts`) and Device
 * brightness (task 11.1, `../device/handlers.ts`) are the real ones.
 */
export type NativeHandler = (
  args: Record<string, unknown>,
) => Promise<ExecutionResult>;

const NATIVE_HANDLERS: Record<string, NativeHandler> = {
  'device.info': async () => {
    const parts = [
      Device.modelName,
      Device.osName,
      Device.osVersion ? `(${Device.osVersion})` : null,
    ].filter((part): part is string => Boolean(part));
    return {
      ok: true,
      text: parts.length > 0 ? parts.join(' ') : 'Unknown device',
    };
  },
  'calendar.event.create': createEvent,
  'calendar.event.update': updateEvent,
  'calendar.event.delete': deleteEvent,
  'calendar.event.query': queryEvents,
  'device.brightness': setBrightness,
};

export function nativeHandlerFor(
  capability: string,
): NativeHandler | undefined {
  return NATIVE_HANDLERS[capability];
}
