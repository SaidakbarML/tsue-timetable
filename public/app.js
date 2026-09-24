function pad2(n) { return String(n).padStart(2, '0'); }

async function getJSON(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

async function postJSON(url) {
  const res = await fetch(url, { method: 'POST' });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function toEpochDay(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }

function daysBetweenDateStr(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return toEpochDay(by, bm, bd) - toEpochDay(ay, am, ad);
}

function friendlyDate(dateStr, todayStr) {
  const diff = daysBetweenDateStr(todayStr, dateStr);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDuration(mins) {
  if (mins == null) return '';
  mins = Math.max(0, Math.round(mins));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

function addMinutesToHHMM(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

// ---------- tabs ----------
const tabs = document.querySelectorAll('.tab');
const panels = { class: document.getElementById('panel-class'), rooms: document.getElementById('panel-rooms') };
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== tab.dataset.tab; });
  });
});

// ---------- status + refresh ----------
const statusLine = document.getElementById('statusLine');
const refreshBtn = document.getElementById('refreshBtn');
let serverNow = null;

function formatStatus(s) {
  const d = new Date(s.fetchedAt);
  const stamp = d.toLocaleString(undefined, { hour12: false, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${s.classes} classes · ${s.rooms} rooms · data updated ${stamp}`;
}

async function loadStatus() {
  try {
    const s = await getJSON('/api/status');
    serverNow = s.now;
    statusLine.textContent = formatStatus(s);
    return s;
  } catch (err) {
    statusLine.textContent = 'Could not reach the timetable server.';
    return null;
  }
}

refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;
  try {
    await postJSON('/api/refresh');
    await loadStatus();
    await loadPeriods();
    if (currentClassId) loadClass(currentClassId, { silent: true });
  } catch (err) {
    statusLine.textContent = `Refresh failed: ${err.message}`;
  } finally {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
  }
});

// ---------- my class ----------
const classSearch = document.getElementById('classSearch');
const classResults = document.getElementById('classResults');
const classOutput = document.getElementById('classOutput');
let currentClassId = null;
let pollTimer = null;

// The dropdown floats over whatever is below it in the panel; a short
// result list doesn't always reach as far down as that content does, so the
// output/hint underneath is hidden for as long as the dropdown is open
// rather than left to peek out from behind it.
function showResultsDropdown() {
  classResults.classList.add('show');
  classOutput.style.visibility = 'hidden';
}
function hideResultsDropdown() {
  classResults.classList.remove('show');
  classOutput.style.visibility = '';
}

let searchTimer = null;
classSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = classSearch.value.trim();
  if (!q) { hideResultsDropdown(); classResults.innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const matches = await getJSON(`/api/classes?q=${encodeURIComponent(q)}`);
      renderClassResults(matches);
    } catch (err) {
      classResults.innerHTML = `<div class="error" style="padding:10px">${err.message}</div>`;
      showResultsDropdown();
    }
  }, 200);
});

document.addEventListener('click', (e) => {
  if (!classResults.contains(e.target) && e.target !== classSearch) {
    hideResultsDropdown();
  }
});

function renderClassResults(matches) {
  if (matches.length === 0) {
    classResults.innerHTML = `<div class="muted" style="padding:10px">No matches</div>`;
    showResultsDropdown();
    return;
  }
  classResults.innerHTML = '';
  for (const c of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.name;
    btn.addEventListener('click', () => {
      classSearch.value = c.name;
      hideResultsDropdown();
      loadClass(c.id);
    });
    classResults.appendChild(btn);
  }
  showResultsDropdown();
}

async function loadClass(id, opts = {}) {
  currentClassId = id;
  clearInterval(pollTimer);
  pollTimer = setInterval(() => loadClass(id, { silent: true }), 30000);

  if (!opts.silent) classOutput.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const [next, schedule] = await Promise.all([
      getJSON(`/api/classes/${encodeURIComponent(id)}/next`),
      getJSON(`/api/classes/${encodeURIComponent(id)}/schedule`),
    ]);
    classOutput.innerHTML = '';
    classOutput.appendChild(renderNextBanners(next));
    classOutput.appendChild(renderWeek(schedule, next.now.dateStr));
  } catch (err) {
    classOutput.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function describeOccurrence(o) {
  const room = o.roomNames && o.roomNames.length ? o.roomNames.join(', ') : 'room TBD';
  const teachers = o.teachers && o.teachers.length ? o.teachers.join(', ') : null;
  return { title: o.subject, detail: [room, teachers].filter(Boolean).join(' · ') };
}

function renderNextBanners(data) {
  const wrap = document.createElement('div');

  if (data.current && data.current.length) {
    for (const o of data.current) {
      const { title, detail } = describeOccurrence(o);
      const div = document.createElement('div');
      div.className = 'banner now';
      div.innerHTML = `<div class="eyebrow">Right now</div>
        <div class="big">${title}</div>
        <div class="detail">${detail}</div>
        <span class="countdown">ends ${o.end} · in ${formatDuration(o.minutesRemaining)}</span>`;
      wrap.appendChild(div);
    }
  }

  const div = document.createElement('div');
  div.className = 'banner next';
  if (data.next && data.next.length) {
    const when = friendlyDate(data.next[0].date, data.now.dateStr);
    div.innerHTML = `<div class="eyebrow">${data.current && data.current.length ? 'Up next' : 'Next class'}</div>`;
    for (const o of data.next) {
      const { title, detail } = describeOccurrence(o);
      const row = document.createElement('div');
      row.innerHTML = `<div class="big">${title}</div><div class="detail">${detail}</div>`;
      div.appendChild(row);
    }
    const countdown = document.createElement('span');
    countdown.className = 'countdown';
    countdown.textContent = `${when} at ${data.next[0].start} · in ${formatDuration(data.next[0].minutesUntil)}`;
    div.appendChild(countdown);
  } else {
    div.innerHTML = `<div class="big">No upcoming class found</div>
      <div class="detail">Nothing in the next two weeks for this group.</div>`;
  }
  wrap.appendChild(div);
  return wrap;
}

function renderWeek(data, todayStr) {
  const wrap = document.createElement('div');
  const heading = document.createElement('div');
  heading.className = 'schedule-heading';
  heading.textContent = data.className;
  wrap.appendChild(heading);

  const todaySchemaIndex = (jsWeekdayUTC(todayStr) + 6) % 7; // Mon=0..Sun=6
  let any = false;
  for (const day of data.week) {
    if (day.items.length === 0) continue;
    any = true;
    const h = document.createElement('div');
    h.className = 'day-heading' + (day.dayIndex === todaySchemaIndex ? ' is-today' : '');
    h.textContent = day.dayName + (day.dayIndex === todaySchemaIndex ? ' · today' : '');
    wrap.appendChild(h);

    const list = document.createElement('div');
    list.className = 'lesson-list';
    for (const item of day.items) {
      const meta = [
        (item.teachers || []).join(', '),
        (item.rooms || []).join(', ') || 'room TBD',
        item.weeks !== 'every week' ? item.weeks : null,
      ].filter(Boolean).join(' · ');
      const row = document.createElement('div');
      row.className = 'lesson-row';
      row.innerHTML = `<div class="lesson-time">${item.start}<br>${item.end}</div>
        <div class="lesson-main">
          <div class="lesson-subject">${item.subject}</div>
          <div class="lesson-meta">${meta}</div>
        </div>`;
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }
  if (!any) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'No lessons found for this group.';
    wrap.appendChild(p);
  }
  return wrap;
}

function jsWeekdayUTC(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
}

// ---------- free rooms ----------
const roomDate = document.getElementById('roomDate');
const fromHour = document.getElementById('fromHour');
const fromMinute = document.getElementById('fromMinute');
const toHour = document.getElementById('toHour');
const toMinute = document.getElementById('toMinute');
const roomFilter = document.getElementById('roomFilter');
const roomOutput = document.getElementById('roomOutput');
const periodChips = document.getElementById('periodChips');

function populateHourMinuteSelects() {
  for (const sel of [fromHour, toHour]) {
    for (let h = 0; h < 24; h++) {
      const opt = document.createElement('option');
      opt.value = pad2(h);
      opt.textContent = pad2(h);
      sel.appendChild(opt);
    }
  }
  for (const sel of [fromMinute, toMinute]) {
    for (let m = 0; m < 60; m += 5) {
      const opt = document.createElement('option');
      opt.value = pad2(m);
      opt.textContent = pad2(m);
      sel.appendChild(opt);
    }
  }
}

function setTimeSelects(fromHHMM, toHHMM) {
  const [fh, fm] = fromHHMM.split(':');
  const [th, tm] = toHHMM.split(':');
  fromHour.value = fh;
  fromMinute.value = pad2(Math.floor(Number(fm) / 5) * 5);
  toHour.value = th;
  toMinute.value = pad2(Math.floor(Number(tm) / 5) * 5);
}

function getTimeSelects() {
  return {
    from: `${fromHour.value}:${fromMinute.value}`,
    to: `${toHour.value}:${toMinute.value}`,
  };
}

[fromHour, fromMinute, toHour, toMinute].forEach((sel) => {
  sel.addEventListener('change', () => setActiveChip(null));
});

async function loadPeriods() {
  try {
    const periods = await getJSON('/api/periods');
    periodChips.innerHTML = '';

    const nowChip = document.createElement('button');
    nowChip.type = 'button';
    nowChip.className = 'chip';
    nowChip.textContent = 'Now';
    nowChip.addEventListener('click', () => {
      const base = serverNow ? serverNow.hhmm : `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
      if (serverNow) roomDate.value = serverNow.dateStr;
      setTimeSelects(base, addMinutesToHHMM(base, 60));
      setActiveChip(nowChip);
      checkRooms();
    });
    periodChips.appendChild(nowChip);

    for (const p of periods) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = `${p.name} · ${p.start}–${p.end}`;
      chip.addEventListener('click', () => {
        setTimeSelects(p.start, p.end);
        setActiveChip(chip);
        checkRooms();
      });
      periodChips.appendChild(chip);
    }
  } catch (err) {
    periodChips.innerHTML = `<span class="error">${err.message}</span>`;
  }
}

function setActiveChip(chip) {
  periodChips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  if (chip) chip.classList.add('active');
}

document.getElementById('checkRooms').addEventListener('click', () => checkRooms());

async function checkRooms() {
  roomOutput.innerHTML = '<p class="hint">Checking…</p>';
  const { from, to } = getTimeSelects();
  const params = new URLSearchParams({
    date: roomDate.value,
    from,
    to,
    q: roomFilter.value.trim(),
  });
  try {
    const data = await getJSON(`/api/rooms/free?${params.toString()}`);
    renderRooms(data);
  } catch (err) {
    roomOutput.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function renderRooms(data) {
  roomOutput.innerHTML = '';
  const summary = document.createElement('p');
  summary.className = 'summary-line';
  summary.textContent = `${data.date} · ${data.from}–${data.to} — ${data.free.length} free, ${data.occupied.length} busy`;
  roomOutput.appendChild(summary);

  const grid = document.createElement('div');
  grid.className = 'room-grid';

  for (const name of data.free) {
    const pill = document.createElement('span');
    pill.className = 'room-pill free';
    pill.textContent = name;
    grid.appendChild(pill);
  }
  for (const o of data.occupied) {
    const pill = document.createElement('span');
    pill.className = 'room-pill busy';
    pill.textContent = o.room;
    pill.title = o.bookings.map((b) => `${b.start}-${b.end} ${b.subject} (${b.className})`).join('\n');
    grid.appendChild(pill);
  }
  roomOutput.appendChild(grid);

  if (data.free.length === 0 && data.occupied.length === 0) {
    roomOutput.innerHTML += '<p class="hint">No rooms matched that filter.</p>';
  }
}

// ---------- init ----------
(async function init() {
  populateHourMinuteSelects();
  const status = await loadStatus();
  const now = (status && status.now) || { dateStr: new Date().toISOString().slice(0, 10), hhmm: '09:00' };
  roomDate.value = now.dateStr;
  setTimeSelects(now.hhmm, addMinutesToHHMM(now.hhmm, 60));
  await loadPeriods();
})();
