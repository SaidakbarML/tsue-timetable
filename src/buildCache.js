// Turns the raw EduPage "dbi" tables (23 tables, ~500-8000 rows each, almost
// all of it irrelevant to any one lookup) into one small flat array of
// "occurrences" - one entry per (class, weekday) a lesson actually happens -
// so that both features (next class / free rooms) are a plain array filter.

function indexTablesById(tables) {
  const byId = {};
  for (const t of tables) byId[t.id] = t;
  return byId;
}

function rowMapById(table) {
  const m = new Map();
  for (const row of table.data_rows) m.set(row.id, row);
  return m;
}

function build(tables, meta) {
  const byId = indexTablesById(tables);

  const periods = byId.periods.data_rows
    .map((p) => ({ id: p.id, name: p.name, start: p.starttime, end: p.endtime }))
    .sort((a, b) => a.start.localeCompare(b.start));
  const periodById = new Map(periods.map((p) => [p.id, p]));

  const days = byId.days.data_rows
    .map((d) => ({ index: Number(d.id), name: d.name }))
    .sort((a, b) => a.index - b.index);

  const classes = byId.classes.data_rows.map((c) => ({ id: c.id, name: c.name }));
  const classrooms = byId.classrooms.data_rows.map((r) => ({ id: r.id, name: r.name }));

  const classesMap = rowMapById(byId.classes);
  const classroomsMap = rowMapById(byId.classrooms);
  const subjectsMap = rowMapById(byId.subjects);
  const teachersMap = rowMapById(byId.teachers);

  // Cards with no day bit set at all are unscheduled placeholders, not real
  // occurrences - drop them up front.
  const cardsByLesson = new Map();
  for (const c of byId.cards.data_rows) {
    if (!c.days || !c.days.includes('1')) continue;
    if (!cardsByLesson.has(c.lessonid)) cardsByLesson.set(c.lessonid, []);
    cardsByLesson.get(c.lessonid).push(c);
  }

  const occurrences = [];
  for (const lesson of byId.lessons.data_rows) {
    if (!lesson.classids || lesson.classids.length === 0) continue;
    const cards = cardsByLesson.get(lesson.id);
    if (!cards) continue;

    const subject = subjectsMap.get(lesson.subjectid);
    const teachers = (lesson.teacherids || [])
      .map((id) => teachersMap.get(id))
      .filter(Boolean)
      .map((t) => t.name);

    for (const classId of lesson.classids) {
      const cls = classesMap.get(classId);
      if (!cls) continue;

      for (const card of cards) {
        const period = periodById.get(card.period);
        if (!period) continue;

        const roomIds = card.classroomids || [];
        const roomNames = roomIds.map((id) => classroomsMap.get(id)).filter(Boolean).map((r) => r.name);

        for (let dayIndex = 0; dayIndex < card.days.length; dayIndex++) {
          if (card.days[dayIndex] !== '1') continue;
          occurrences.push({
            classId,
            className: cls.name,
            subject: subject ? subject.name : '(unknown subject)',
            teachers,
            dayIndex,
            periodId: period.id,
            start: period.start,
            end: period.end,
            weeks: card.weeks || '',
            roomIds,
            roomNames,
          });
        }
      }
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    ttNum: meta.tt_num,
    datefrom: meta.datefrom,
    periods,
    days,
    classes,
    classrooms,
    occurrences,
  };
}

module.exports = { build };
