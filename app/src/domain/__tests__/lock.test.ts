import {INITIAL_LOCK, LOCK_AFTER_MS, onBackground, onForeground, onUnlocked} from '../lock';

describe('lock', () => {
  test('starts locked', () => {
    expect(INITIAL_LOCK.locked).toBe(true);
    expect(onForeground(INITIAL_LOCK, 0).locked).toBe(true);
  });

  test.each([
    [59_000, false],
    [LOCK_AFTER_MS - 1, false],
    [LOCK_AFTER_MS, true],
    [61_000, true],
    [3_600_000, true],
  ])('background for %i ms -> locked %s', (ms, locked) => {
    const away = onBackground(onUnlocked(), 1_000);
    expect(onForeground(away, 1_000 + ms).locked).toBe(locked);
  });

  test('a second background event keeps the first time', () => {
    const first = onBackground(onUnlocked(), 0);
    const second = onBackground(first, 50_000);
    expect(onForeground(second, 60_000).locked).toBe(true);
  });

  test('foreground without background stays unlocked; a short trip resets the clock', () => {
    expect(onForeground(onUnlocked(), 999_999).locked).toBe(false);
    const back = onForeground(onBackground(onUnlocked(), 0), 30_000);
    expect(back.locked).toBe(false);
    expect(onForeground(onBackground(back, 40_000), 90_000).locked).toBe(false);
  });
});
