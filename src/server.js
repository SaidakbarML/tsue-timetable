const express = require('express');
const path = require('path');
const config = require('./config');
const store = require('./dataStore');
const time = require('./time');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/classes', async (req, res, next) => {
  try {
    await store.ensureFresh();
    res.json(store.findClasses(req.query.q));
  } catch (err) {
    next(err);
  }
});

app.get('/api/classes/:id/schedule', async (req, res, next) => {
  try {
    await store.ensureFresh();
    res.json(store.getClassSchedule(req.params.id));
  } catch (err) {
    next(err);
  }
});

app.get('/api/classes/:id/next', async (req, res, next) => {
  try {
    await store.ensureFresh();
    const now = time.tashkentNow();
    const result = store.getNextClass(req.params.id, now.dateStr, now.hhmm);
    res.json({ now, ...result });
  } catch (err) {
    next(err);
  }
});

app.get('/api/periods', async (req, res, next) => {
  try {
    await store.ensureFresh();
    res.json(store.getPeriods());
  } catch (err) {
    next(err);
  }
});

app.get('/api/status', async (req, res, next) => {
  try {
    const cache = await store.ensureFresh();
    res.json({
      fetchedAt: cache.fetchedAt,
      datefrom: cache.datefrom,
      classes: cache.classes.length,
      rooms: cache.classrooms.length,
      now: time.tashkentNow(),
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/rooms', async (req, res, next) => {
  try {
    await store.ensureFresh();
    res.json(store.findRooms(req.query.q));
  } catch (err) {
    next(err);
  }
});

app.get('/api/rooms/free', async (req, res, next) => {
  try {
    await store.ensureFresh();
    const now = time.tashkentNow();
    const date = req.query.date || now.dateStr;
    const from = req.query.from || now.hhmm;
    const to = req.query.to || time.addMinutesToHHMM(from, 60);
    res.json(store.getFreeRooms(date, from, to, req.query.q));
  } catch (err) {
    next(err);
  }
});

app.post('/api/refresh', async (req, res, next) => {
  try {
    const cache = await store.refresh();
    res.json({ ok: true, fetchedAt: cache.fetchedAt, occurrences: cache.occurrences.length });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(config.port, () => {
  console.log(`TSUE timetable app running at http://localhost:${config.port}`);
});
