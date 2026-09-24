// Talks to the public aSc/EduPage RPC endpoints behind https://<subdomain>.edupage.org/timetable/
//
// These aren't documented; found by reading the site's own ttviewer React
// bundle. Two calls, both POSTed as JSON with a fixed __gsh (auth hash) of
// "00000000", which is what the site itself sends for anonymous/public
// timetable viewing:
//
//  1. getTTViewerData(null, year) -> which regular timetable revision
//     ("tt_num") is currently active, and its start date.
//  2. regularttGetData(null, tt_num) -> the full timetable database for that
//     revision: classes, classrooms, subjects, teachers, lessons and the
//     "cards" that place a lesson at a given day/period/room.
const config = require('./config');

const BASE = `https://${config.subdomain}.edupage.org`;

async function rpc(path, func, args) {
  const url = `${BASE}${path}?__func=${func}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ __args: args, __gsh: '00000000' }),
  });
  if (!res.ok) {
    throw new Error(`EduPage request ${func} failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json && json.reload) {
    throw new Error(`EduPage rejected request ${func} (asked for a reload) - the site's protocol may have changed`);
  }
  return json.r;
}

// The school year "turns over" in August (per the site's own config), so a
// date early in a calendar year can belong to the academic year labelled by
// the previous calendar year. Try the current year first, then fall back.
async function fetchActiveTimetableMeta(year) {
  for (const y of [year, year - 1]) {
    const r = await rpc('/timetable/server/ttviewer.js', 'getTTViewerData', [null, y]);
    const num = r && r.regular && r.regular.default_num;
    if (!num) continue;
    const meta = (r.regular.timetables || []).find((t) => t.tt_num === num);
    if (meta) return meta; // {tt_num, year, text, datefrom, hidden}
  }
  throw new Error(`No active regular timetable reported by EduPage for ${config.subdomain}.edupage.org`);
}

async function fetchRegularTimetableTables(ttNum) {
  const r = await rpc('/timetable/server/regulartt.js', 'regularttGetData', [null, ttNum]);
  if (!r || !r.dbiAccessorRes || !Array.isArray(r.dbiAccessorRes.tables)) {
    throw new Error('Unexpected regularttGetData response shape (missing dbiAccessorRes.tables)');
  }
  return r.dbiAccessorRes.tables;
}

module.exports = { fetchActiveTimetableMeta, fetchRegularTimetableTables };
