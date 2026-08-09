import { ensureCalendarAccess } from './calendarAccess';

const mockGetCalendarPermissionsAsync = jest.fn();
const mockRequestCalendarPermissionsAsync = jest.fn();

jest.mock('expo-calendar/legacy', () => ({
  getCalendarPermissionsAsync: () => mockGetCalendarPermissionsAsync(),
  requestCalendarPermissionsAsync: () => mockRequestCalendarPermissionsAsync(),
}));

describe('ensureCalendarAccess', () => {
  beforeEach(() => {
    mockGetCalendarPermissionsAsync.mockReset();
    mockRequestCalendarPermissionsAsync.mockReset();
  });

  it('skips prompting when already granted', async () => {
    mockGetCalendarPermissionsAsync.mockResolvedValue({ status: 'granted' });
    const result = await ensureCalendarAccess();
    expect(result).toEqual({ granted: true });
    expect(mockRequestCalendarPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prompts when undetermined and reports a granted result', async () => {
    mockGetCalendarPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
    });
    mockRequestCalendarPermissionsAsync.mockResolvedValue({
      status: 'granted',
    });
    const result = await ensureCalendarAccess();
    expect(result).toEqual({ granted: true });
    expect(mockRequestCalendarPermissionsAsync).toHaveBeenCalled();
  });

  it('reports a denied result without granting', async () => {
    mockGetCalendarPermissionsAsync.mockResolvedValue({ status: 'denied' });
    mockRequestCalendarPermissionsAsync.mockResolvedValue({
      status: 'denied',
    });
    const result = await ensureCalendarAccess();
    expect(result).toEqual({ granted: false });
  });
});
