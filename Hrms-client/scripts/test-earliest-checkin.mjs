/**
 * Mirrors services/utils.ts — isBeforeEarliestCheckIn (keep logic in sync when changing rules).
 * Run: npm run test:checkin-window
 *      node scripts/test-earliest-checkin.mjs
 */

const EARLIEST_HOUR = 8;
const EARLIEST_MINUTE = 30;

/** @param {Date} date @param {string} timeZone */
function isBeforeEarliestCheckIn(date, timeZone = 'Asia/Kolkata') {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const h = parseInt(parts.find((p) => p.type === 'hour').value, 10);
    const m = parseInt(parts.find((p) => p.type === 'minute').value, 10);
    return h < EARLIEST_HOUR || (h === EARLIEST_HOUR && m < EARLIEST_MINUTE);
  } catch {
    const h = date.getHours();
    const m = date.getMinutes();
    return h < EARLIEST_HOUR || (h === EARLIEST_HOUR && m < EARLIEST_MINUTE);
  }
}

function assert(name, condition) {
  if (!condition) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok  ${name}`);
  return true;
}

const TZ_IST = 'Asia/Kolkata';
const TZ_UTC = 'UTC';

/** expectBefore: true = UI should disable Check In (before 8:30 in that zone) */
const cases = [
  { name: '08:15 IST → before window (restricted)', date: new Date('2026-04-09T02:45:00.000Z'), tz: TZ_IST, expectBefore: true },
  { name: '08:29 IST → before window (restricted)', date: new Date('2026-04-09T02:59:00.000Z'), tz: TZ_IST, expectBefore: true },
  { name: '08:30 IST → not before (allowed)', date: new Date('2026-04-09T03:00:00.000Z'), tz: TZ_IST, expectBefore: false },
  { name: '09:00 IST → not before (allowed)', date: new Date('2026-04-09T03:30:00.000Z'), tz: TZ_IST, expectBefore: false },
  { name: 'UTC zone 08:15 → before window', date: new Date('2026-04-09T08:15:00.000Z'), tz: TZ_UTC, expectBefore: true },
  { name: 'UTC zone 08:30 → not before', date: new Date('2026-04-09T08:30:00.000Z'), tz: TZ_UTC, expectBefore: false }
];

console.log(
  `Client earliest check-in gate (isBeforeEarliestCheckIn): before ${EARLIEST_HOUR}:${String(EARLIEST_MINUTE).padStart(2, '0')} in company TZ\n`
);

for (const { name, date, tz, expectBefore } of cases) {
  const got = isBeforeEarliestCheckIn(date, tz);
  assert(name, got === expectBefore);
}

if (process.exitCode === 1) {
  console.error('\nSome tests failed.');
  process.exit(1);
}

console.log('\nAll client gate tests passed.');
