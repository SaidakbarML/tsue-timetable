// All date/time handling for the app lives here.
//
// Two separate concerns are kept apart on purpose:
//  - "wall clock now" in Tashkent, read via Intl so it is correct no matter
//    what timezone the machine running this process is set to.
//  - calendar-date arithmetic (which weekday is a date, how many weeks since
//    the timetable's start date), done entirely with UTC epoch-days so host
//    timezone/DST can never shift a date by one day.
const config = require('./config');

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Current wall-clock date/time in Asia/Tashkent, independent of host TZ.
function tashkentNow(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = parts.hour === '24' ? 0 : Number(parts.hour); // some ICU builds print midnight as 24
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    jsDay: weekdayMap[parts.weekday],
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${pad2(hour)}:${parts.minute}`,
  };
}

function toEpochDay(y, m, d) {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

// 0 = Sunday .. 6 = Saturday, matching JS Date#getUTCDay()
function jsWeekdayForDate(dateStr) {
  const { y, m, d } = parseDateStr(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// The timetable's own day table only has Monday(0)..Saturday(5); Sunday has
// no periods, so it maps to null.
function schemaDayIndexForDate(dateStr) {
  const jsDay = jsWeekdayForDate(dateStr);
  return jsDay === 0 ? null : jsDay - 1;
}

function mondayEpochDay(epochDay) {
  const jsDow = new Date(epochDay * 86400000).getUTCDay(); // 0=Sun..6=Sat
  const deltaToMonday = jsDow === 0 ? -6 : 1 - jsDow;
  return epochDay + deltaToMonday;
}

// 0 = "week A", 1 = "week B", alternating from the Monday of the timetable's
// datefrom. EduPage/aSc doesn't expose which real week is A/B beyond that
// rotation, so datefrom's week is defined as week A.
function weekParityForDate(dateStr, anchorDateStr) {
  const a = parseDateStr(dateStr);
  const b = parseDateStr(anchorDateStr);
  const thisMonday = mondayEpochDay(toEpochDay(a.y, a.m, a.d));
  const anchorMonday = mondayEpochDay(toEpochDay(b.y, b.m, b.d));
  const weeksSince = Math.round((thisMonday - anchorMonday) / 7);
  return ((weeksSince % 2) + 2) % 2;
}

function addDaysToDateStr(dateStr, n) {
  const { y, m, d } = parseDateStr(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// Whole minutes from (dateStr1, hhmm1) to (dateStr2, hhmm2); negative if the
// second point is earlier. Used for "starts in X min" / "ends in X min".
function minutesBetween(dateStr1, hhmm1, dateStr2, hhmm2) {
  const a = parseDateStr(dateStr1);
  const b = parseDateStr(dateStr2);
  const dayDiff = toEpochDay(b.y, b.m, b.d) - toEpochDay(a.y, a.m, a.d);
  const [h1, m1] = hhmm1.split(':').map(Number);
  const [h2, m2] = hhmm2.split(':').map(Number);
  return dayDiff * 24 * 60 + (h2 * 60 + m2) - (h1 * 60 + m1);
}

module.exports = {
  tashkentNow,
  schemaDayIndexForDate,
  weekParityForDate,
  addDaysToDateStr,
  addMinutesToHHMM,
  minutesBetween,
};
