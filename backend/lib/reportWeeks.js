// Which delivery weeks a report shows. Shared by the admin, owner and rider reports in the app.
// weeks: queries.getReportWeeks() (the last 52 weeks whose window has opened, newest first).
// A week is written "2026-47" in the address; the reports compare weeks as year * 100 + week (202647).

const weekKey = w => w.iso_year * 100 + w.iso_week;

const findWeek = (weeks, s) => {
  const [y, n] = String(s).split('-').map(Number);
  return weeks.find(w => w.iso_year === y && w.iso_week === n);
};

// ?week=2026-47, default the latest finished week. { week } (null when there are no weeks yet), or { error }.
function pickWeek(weeks, query) {
  if (!query.week) return { week: weeks.find(w => w.finished) || weeks[0] || null };
  const week = findWeek(weeks, query.week);
  return week ? { week } : { error: 'Pick one of the last 52 delivery weeks' };
}

// ?from=2026-40&to=2026-47, each default the latest finished week; swapped when given the wrong way round.
// { from, to } (null when there are no weeks yet), or { error }.
function pickRange(weeks, query) {
  const fallback = weeks.find(w => w.finished) || weeks[0] || null;
  let from = query.from ? findWeek(weeks, query.from) : fallback;
  let to = query.to ? findWeek(weeks, query.to) : fallback;
  if (!from || !to) return fallback ? { error: 'Pick weeks from the last 52 delivery weeks' } : { from: null, to: null };
  if (weekKey(from) > weekKey(to)) [from, to] = [to, from];
  return { from, to };
}

module.exports = { weekKey, pickWeek, pickRange };
