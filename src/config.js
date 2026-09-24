module.exports = {
  subdomain: process.env.EDUPAGE_SUBDOMAIN || 'tsue',
  port: Number(process.env.PORT) || 3000,
  cacheMaxAgeHours: Number(process.env.CACHE_MAX_AGE_HOURS) || 12,
  timezone: 'Asia/Tashkent',
};
