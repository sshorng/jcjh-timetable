import DateUtils from './date-utils.js';

export function mutualDraftKey(leaveEmail, dateStr, period) {
  return String(leaveEmail || '').toLowerCase() + '|' + dateStr + '|' + period;
}

export function batchSlotKey(email, dateStr, period) {
  return `${String(email || '').toLowerCase()}|${dateStr}|${period}`;
}

export function getBatchCompareWeeks(slots) {
  if (!DateUtils || typeof DateUtils.getWeekDatesFrom !== 'function') return [];
  const weekMap = Object.create(null);
  (slots || []).forEach((slot) => {
    const dateStr = String((slot && (slot.dateStr || slot.date)) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const dates = DateUtils.getWeekDatesFrom(dateStr);
    if (!Array.isArray(dates) || dates.length !== 5 || !dates[0]) return;
    weekMap[dates[0]] = dates;
  });
  return Object.keys(weekMap).sort().map((startDate) => weekMap[startDate]);
}
