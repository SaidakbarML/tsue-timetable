function pad2(n) { return String(n).padStart(2, '0'); }

function localDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localHHMM(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function getJSON(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// ---------- My class ----------
const classSearch = document.getElementById('classSearch');
const classResults = document.getElementById('classResults');
const classOutput = document.getElementById('classOutput');

let searchTimer = null;
classSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = classSearch.value.trim();
  if (!q) { classResults.classList.remove('show'); classResults.innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    try {
      const matches = await getJSON(`/api/classes?q=${encodeURIComponent(q)}`);
      renderClassResults(matches);
    } catch (err) {
      classResults.innerHTML = `<div class="error" style="padding:8px">${err.message}</div>`;
      classResults.classList.add('show');
    }
  }, 200);
});

document.addEventListener('click', (e) => {
  if (!classResults.contains(e.target) && e.target !== classSearch) {
    classResults.classList.remove('show');
  }
});

function renderClassResults(matches) {
  if (matches.length === 0) {
    classResults.innerHTML = `<div class="muted" style="padding:8px">No matches</div>`;
    classResults.classList.add('show');
    return;
  }
  classResults.innerHTML = '';
  for (const c of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.name;
    btn.addEventListener('click', () => {
      classSearch.value = c.name;
      classResults.classList.remove('show');
      loadClass(c.id);
    });
    classResults.appendChild(btn);
  }
  classResults.classList.add('show');
}

async function loadClass(id) {
  classOutput.innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [next, schedule] = await Promise.all([
      getJSON(`/api/classes/${encodeURIComponent(id)}/next`),
      getJSON(`/api/classes/${encodeURIComponent(id)}/schedule`),
    ]);
    classOutput.innerHTML = '';
    classOutput.appendChild(renderNextBanner(next));
    classOutput.appendChild(renderWeek(schedule));
  } catch (err) {
    classOutput.innerHTML = `<p class="error">${err.message}</p>`;
  }
}

function describeOccurrence(o) {
  const room = o.roomNames && o.roomNames.length ? o.roomNames.join(', ') : 'room TBD';
  const teachers = o.teachers && o.teachers.length ? ` — ${o.teachers.join(', ')}` : '';
  return `${o.subject}${teachers} in ${room}`;
}

function renderNextBanner(data) {
  const wrap = document.createElement('div');

  if (data.current && data.current.length) {
    const div = document.createElement('div');
    div.className = 'banner now';
    div.innerHTML = `<div class="big">Right now: ${data.current.map(describeOccurrence).join(' / ')}</div>
      <div>until ${data.current[0].end}</div>`;
    wrap.appendChild(div);
  }

  const div = document.createElement('div');
  div.className = 'banner next';
  if (data.next && data.next.length) {
    const first = data.next[0];
    const isToday = first.date === data.now.dateStr;
    const when = isToday ? `today at ${first.start}` : `${first.date} at ${first.start}`;
    div.innerHTML = `<div class="big">Next class: ${when}</div>
      <div>${data.next.map(describeOccurrence).join(' / ')}</div>`;
  } else {
    div.innerHTML = `<div class="big">No upcoming class found</div>
      <div class="muted">Nothing in the next two weeks for this group.</div>`;
  }
  wrap.appendChild(div);
  return wrap;
}

function renderWeek(data) {
  const wrap = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = data.className;
  heading.style.marginBottom = '4px';
  wrap.appendChild(heading);

  for (const day of data.week) {
    if (day.items.length === 0) continue;
    const h = document.createElement('div');
    h.className = 'day-heading';
    h.textContent = day.dayName;
    wrap.appendChild(h);

    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>Time</th><th>Subject</th><th>Teacher</th><th>Room</th><th>Weeks</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    for (const item of day.items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${item.start}–${item.end}</td><td>${item.subject}</td><td>${(item.teachers || []).join(', ')}</td><td>${(item.rooms || []).join(', ') || '—'}</td><td>${item.weeks}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
  }
  return wrap;
}

// ---------- Free rooms ----------
const roomDate = document.getElementById('roomDate');
const roomFrom = document.getElementById('roomFrom');
const roomTo = document.getElementById('roomTo');
const roomFilter = document.getElementById('roomFilter');
const roomOutput = document.getElementById('roomOutput');

(function setDefaultRoomTimes() {
  const now = new Date();
  const later = new Date(now.getTime() + 60 * 60000);
  roomDate.value = localDateStr(now);
  roomFrom.value = localHHMM(now);
  roomTo.value = localHHMM(later);
})();

document.getElementById('checkRooms').addEventListener('click', async () => {
  roomOutput.innerHTML = '<p class="muted">Checking…</p>';
  const params = new URLSearchParams({
    date: roomDate.value,
    from: roomFrom.value,
    to: roomTo.value,
    q: roomFilter.value.trim(),
  });
  try {
    const data = await getJSON(`/api/rooms/free?${params.toString()}`);
    renderRooms(data);
  } catch (err) {
    roomOutput.innerHTML = `<p class="error">${err.message}</p>`;
  }
});

function renderRooms(data) {
  roomOutput.innerHTML = '';
  const summary = document.createElement('p');
  summary.className = 'muted';
  summary.textContent = `${data.date}, ${data.from}–${data.to}: ${data.free.length} free, ${data.occupied.length} busy`;
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
    roomOutput.innerHTML += '<p class="muted">No rooms matched that filter.</p>';
  }
}
