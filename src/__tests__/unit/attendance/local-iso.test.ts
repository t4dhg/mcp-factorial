import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLocalIso, localToday } from '../../../api/attendance.js';

/** A Date whose local getters report a fixed offset, independent of the machine zone */
function fakeDate(iso: string, offsetMinutes: number): Date {
  const date = new Date(iso);
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  vi.spyOn(date, 'getTimezoneOffset').mockReturnValue(-offsetMinutes);
  vi.spyOn(date, 'getFullYear').mockReturnValue(local.getUTCFullYear());
  vi.spyOn(date, 'getMonth').mockReturnValue(local.getUTCMonth());
  vi.spyOn(date, 'getDate').mockReturnValue(local.getUTCDate());
  vi.spyOn(date, 'getHours').mockReturnValue(local.getUTCHours());
  vi.spyOn(date, 'getMinutes').mockReturnValue(local.getUTCMinutes());
  vi.spyOn(date, 'getSeconds').mockReturnValue(local.getUTCSeconds());
  return date;
}

describe('formatLocalIso', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders the offset with its sign, including half-hour and negative zones', () => {
    expect(formatLocalIso(fakeDate('2026-09-05T07:12:00Z', 120))).toBe('2026-09-05T09:12:00+02:00');
    expect(formatLocalIso(fakeDate('2026-09-05T07:12:00Z', -300))).toBe(
      '2026-09-05T02:12:00-05:00'
    );
    expect(formatLocalIso(fakeDate('2026-09-05T07:12:00Z', 330))).toBe('2026-09-05T12:42:00+05:30');
    expect(formatLocalIso(fakeDate('2026-09-05T07:12:00Z', -210))).toBe(
      '2026-09-05T03:42:00-03:30'
    );
    expect(formatLocalIso(fakeDate('2026-09-05T07:12:00Z', 0))).toBe('2026-09-05T07:12:00+00:00');
  });

  it('localToday follows the local date across midnight', () => {
    expect(localToday(fakeDate('2026-09-05T23:30:00Z', 120))).toBe('2026-09-06');
    expect(localToday(fakeDate('2026-09-05T01:30:00Z', -300))).toBe('2026-09-04');
  });
});
