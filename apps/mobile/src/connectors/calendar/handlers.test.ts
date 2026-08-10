import { Platform } from 'react-native';

import { createEvent, deleteEvent, queryEvents, updateEvent } from './handlers';

const mockGetDefaultCalendarAsync = jest.fn();
const mockGetCalendarsAsync = jest.fn();
const mockCreateEventAsync = jest.fn();
const mockUpdateEventAsync = jest.fn();
const mockDeleteEventAsync = jest.fn();
const mockGetEventsAsync = jest.fn();

jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  getDefaultCalendarAsync: (...args: unknown[]) =>
    mockGetDefaultCalendarAsync(...args),
  getCalendarsAsync: (...args: unknown[]) => mockGetCalendarsAsync(...args),
  createEventAsync: (...args: unknown[]) => mockCreateEventAsync(...args),
  updateEventAsync: (...args: unknown[]) => mockUpdateEventAsync(...args),
  deleteEventAsync: (...args: unknown[]) => mockDeleteEventAsync(...args),
  getEventsAsync: (...args: unknown[]) => mockGetEventsAsync(...args),
}));

describe('calendar handlers', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    mockGetDefaultCalendarAsync.mockReset().mockResolvedValue({ id: 'cal-1' });
    mockGetCalendarsAsync
      .mockReset()
      .mockResolvedValue([
        { id: 'cal-1', isPrimary: true, allowsModifications: true },
      ]);
    mockCreateEventAsync.mockReset().mockResolvedValue('event-1');
    mockUpdateEventAsync.mockReset().mockResolvedValue('event-1');
    mockDeleteEventAsync.mockReset().mockResolvedValue(undefined);
    mockGetEventsAsync.mockReset().mockResolvedValue([]);
  });

  describe('createEvent', () => {
    it('refuses without title/startDate/endDate', async () => {
      const result = await createEvent({});
      expect(result).toEqual({
        ok: false,
        reason: 'invalid-arguments',
        detail: 'title, startDate, and endDate are required.',
      });
      expect(mockCreateEventAsync).not.toHaveBeenCalled();
    });

    it('creates an event on the default calendar (iOS)', async () => {
      const result = await createEvent({
        title: 'Standup',
        startDate: '2026-08-10T09:00:00.000Z',
        endDate: '2026-08-10T09:30:00.000Z',
      });
      expect(mockGetDefaultCalendarAsync).toHaveBeenCalled();
      expect(mockCreateEventAsync).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({ title: 'Standup', alarms: [] }),
      );
      expect(result).toEqual({
        ok: true,
        text: 'Created event "Standup" (id: event-1).',
      });
    });

    it('picks the primary calendar on Android instead of getDefaultCalendarAsync', async () => {
      Platform.OS = 'android';
      await createEvent({
        title: 'Standup',
        startDate: '2026-08-10T09:00:00.000Z',
        endDate: '2026-08-10T09:30:00.000Z',
      });
      expect(mockGetDefaultCalendarAsync).not.toHaveBeenCalled();
      expect(mockGetCalendarsAsync).toHaveBeenCalledWith('event');
      expect(mockCreateEventAsync).toHaveBeenCalledWith(
        'cal-1',
        expect.anything(),
      );
    });

    it('converts a positive alertMinutesBefore into a negative relativeOffset', async () => {
      await createEvent({
        title: 'Standup',
        startDate: '2026-08-10T09:00:00.000Z',
        endDate: '2026-08-10T09:30:00.000Z',
        alertMinutesBefore: 10,
      });
      expect(mockCreateEventAsync).toHaveBeenCalledWith(
        'cal-1',
        expect.objectContaining({ alarms: [{ relativeOffset: -10 }] }),
      );
    });

    it('reports a handler-error when no writable calendar exists on Android', async () => {
      Platform.OS = 'android';
      mockGetCalendarsAsync.mockResolvedValue([]);
      const result = await createEvent({
        title: 'Standup',
        startDate: '2026-08-10T09:00:00.000Z',
        endDate: '2026-08-10T09:30:00.000Z',
      });
      expect(result).toEqual({
        ok: false,
        reason: 'handler-error',
        detail: 'No writable calendar found on this device.',
      });
    });
  });

  describe('updateEvent', () => {
    it('refuses without eventId', async () => {
      const result = await updateEvent({ title: 'New title' });
      expect(result).toEqual({
        ok: false,
        reason: 'invalid-arguments',
        detail: 'eventId is required.',
      });
    });

    it('updates only the fields provided', async () => {
      const result = await updateEvent({
        eventId: 'event-1',
        title: 'New title',
      });
      expect(mockUpdateEventAsync).toHaveBeenCalledWith('event-1', {
        title: 'New title',
      });
      expect(result).toEqual({ ok: true, text: 'Updated event event-1.' });
    });
  });

  describe('deleteEvent', () => {
    it('refuses without eventId', async () => {
      const result = await deleteEvent({});
      expect(result).toEqual({
        ok: false,
        reason: 'invalid-arguments',
        detail: 'eventId is required.',
      });
    });

    it('deletes the event', async () => {
      const result = await deleteEvent({ eventId: 'event-1' });
      expect(mockDeleteEventAsync).toHaveBeenCalledWith('event-1');
      expect(result).toEqual({ ok: true, text: 'Deleted event event-1.' });
    });
  });

  describe('queryEvents', () => {
    it('refuses without startDate/endDate', async () => {
      const result = await queryEvents({});
      expect(result).toEqual({
        ok: false,
        reason: 'invalid-arguments',
        detail: 'startDate and endDate are required.',
      });
    });

    it('reports no events found', async () => {
      const result = await queryEvents({
        startDate: '2026-08-10T00:00:00.000Z',
        endDate: '2026-08-11T00:00:00.000Z',
      });
      expect(result).toEqual({
        ok: true,
        text: 'No events found in that range.',
      });
    });

    it('lists events found across every readable calendar', async () => {
      mockGetEventsAsync.mockResolvedValue([
        {
          id: 'event-1',
          title: 'Standup',
          startDate: '2026-08-10T09:00:00.000Z',
          endDate: '2026-08-10T09:30:00.000Z',
        },
      ]);
      const result = await queryEvents({
        startDate: '2026-08-10T00:00:00.000Z',
        endDate: '2026-08-11T00:00:00.000Z',
      });
      expect(mockGetEventsAsync).toHaveBeenCalledWith(
        ['cal-1'],
        expect.any(Date),
        expect.any(Date),
      );
      expect(result.ok).toBe(true);
      expect((result as { text: string }).text).toContain('Standup');
      expect((result as { text: string }).text).toContain('event-1');
    });
  });
});
