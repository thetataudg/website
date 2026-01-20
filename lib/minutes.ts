const phoenixFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Phoenix",
});

export function formatMeetingDateKey(date: Date) {
  return phoenixFormatter.format(date);
}

export function buildMeetingDateRangeFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  return { start, end };
}
