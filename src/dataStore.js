const fs = require('fs');
const path = require('path');
const config = require('./config');
const time = require('./time');
const buildCache = require('./buildCache');
const { fetchActiveTimetableMeta, fetchRegularTimetableTables } = require('./edupageClient');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cache.json');

let cache = null;

function loadFromDisk() {
  if (fs.existsSync(CACHE_PATH)) {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return true;
  }
  return false;
}

function isStale() {
  if (!cache) return true;
  const ageHours = (Date.now() - new Date(cache.fetchedAt).getTime()) / 3600000;
  return ageHours > config.cacheMaxAgeHours;
}

async function refresh() {
  const year = time.tashkentNow().year;
  const meta = await fetchActiveTimetableMeta(year);
  const tables = await fetchRegularTimetableTables(meta.tt_num);
  const built = buildCache.build(tables, meta);
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(built));
  cache = built;
  return cache;
}

// Loads the on-disk cache if needed and refreshes from EduPage if it's
// missing or stale. If a refresh attempt fails but we still have (even
// stale) data on hand, we keep serving that rather than going down.
async function ensureFresh() {
  if (!cache) loadFromDisk();
  if (isStale()) {
    try {
      await refresh();
    } catch (err) {
      if (!cache) throw err;
      console.error('EduPage refresh failed, serving stale cache instead:', err.message);
    }
  }
  return cache;
}

function findClasses(query, limit = 50) {
  const q = (query || '').trim().toLowerCase();
  const out = [];
  for (const c of cache.classes) {
    if (!q || c.name.toLowerCase().includes(q)) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

function findRooms(query, limit = 50) {
  const q = (query || '').trim().toLowerCase();
  const out = [];
  for (const r of cache.classrooms) {
    if (!q || r.name.toLowerCase().includes(q)) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

function weekLabel(weeks) {
  if (!weeks || weeks === '11') return 'every week';
  if (weeks[0] === '1') return 'week A';
  if (weeks[1] === '1') return 'week B';
  return 'every week';
}

function occurrenceActiveOnDate(o, dateStr) {
  const dayIndex = time.schemaDayIndexForDate(dateStr);
  if (dayIndex === null || o.dayIndex !== dayIndex) return false;
  if (!o.weeks) return true;
  const parity = time.weekParityForDate(dateStr, cache.datefrom);
  return o.weeks[parity] === '1';
}

function getClassSchedule(classId) {
  const occ = cache.occurrences.filter((o) => o.classId === classId);
  const byDay = cache.days.map((d) => ({ dayIndex: d.index, dayName: d.name, items: [] }));
  for (const o of occ) {
    const day = byDay.find((d) => d.dayIndex === o.dayIndex);
    if (!day) continue;
    day.items.push({
      period: o.periodId,
      start: o.start,
      end: o.end,
      subject: o.subject,
      teachers: o.teachers,
      rooms: o.roomNames,
      weeks: weekLabel(o.weeks),
    });
  }
  for (const d of byDay) d.items.sort((a, b) => a.start.localeCompare(b.start));

  const className = occ[0] ? occ[0].className : (cache.classes.find((c) => c.id === classId) || {}).name || classId;
  return { classId, className, week: byDay };
}

// Returns { current: Occurrence[], next: Occurrence[] } - arrays because a
// slot can legitimately have more than one thing happening in parallel (a
// lesson split across sub-groups/rooms).
function getNextClass(classId, fromDateStr, fromHHMM) {
  const occ = cache.occurrences.filter((o) => o.classId === classId);
  if (occ.length === 0) return { current: [], next: [] };

  const current = occ
    .filter((o) => occurrenceActiveOnDate(o, fromDateStr) && o.start <= fromHHMM && fromHHMM < o.end)
    .map((o) => ({ ...o, minutesRemaining: time.minutesBetween(fromDateStr, fromHHMM, fromDateStr, o.end) }));

  for (let dayOffset = 0; dayOffset <= 13; dayOffset++) {
    const dateStr = time.addDaysToDateStr(fromDateStr, dayOffset);
    const todays = occ
      .filter((o) => occurrenceActiveOnDate(o, dateStr))
      .filter((o) => dayOffset > 0 || o.start > fromHHMM)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (todays.length > 0) {
      const nextStart = todays[0].start;
      const next = todays
        .filter((o) => o.start === nextStart)
        .map((o) => ({ ...o, date: dateStr, minutesUntil: time.minutesBetween(fromDateStr, fromHHMM, dateStr, o.start) }));
      return { current, next };
    }
  }
  return { current, next: [] };
}

function getPeriods() {
  return cache.periods;
}

function getFreeRooms(dateStr, from, to, query) {
  const overlapping = cache.periods.filter((p) => p.start < to && from < p.end);
  const periodIds = new Set(overlapping.map((p) => p.id));

  const busy = new Map(); // roomId -> bookings[]
  for (const o of cache.occurrences) {
    if (!periodIds.has(o.periodId)) continue;
    if (!occurrenceActiveOnDate(o, dateStr)) continue;
    for (const roomId of o.roomIds) {
      if (!busy.has(roomId)) busy.set(roomId, []);
      busy.get(roomId).push({ subject: o.subject, className: o.className, period: o.periodId, start: o.start, end: o.end });
    }
  }

  const q = (query || '').trim().toLowerCase();
  const rooms = cache.classrooms.filter((r) => !q || r.name.toLowerCase().includes(q));

  const free = [];
  const occupied = [];
  for (const r of rooms) {
    if (busy.has(r.id)) occupied.push({ room: r.name, bookings: busy.get(r.id) });
    else free.push(r.name);
  }
  return { date: dateStr, from, to, periodsConsidered: overlapping.map((p) => p.id), free, occupied };
}

module.exports = {
  ensureFresh,
  refresh,
  findClasses,
  findRooms,
  getClassSchedule,
  getNextClass,
  getFreeRooms,
  getPeriods,
  getCache: () => cache,
};
