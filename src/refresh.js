// Manual cache refresh: `npm run refresh`
const store = require('./dataStore');

store
  .refresh()
  .then((cache) => {
    console.log(
      `Refreshed cache: tt_num=${cache.ttNum}, datefrom=${cache.datefrom}, ` +
        `${cache.classes.length} classes, ${cache.classrooms.length} rooms, ${cache.occurrences.length} occurrences.`
    );
  })
  .catch((err) => {
    console.error('Refresh failed:', err.message);
    process.exit(1);
  });
