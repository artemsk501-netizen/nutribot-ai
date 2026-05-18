const DEFAULT_TZ = "Europe/Moscow";

/** YYYY-MM-DD в заданной таймзоне (для дневной статистики). */
export function todayISO(timeZone = DEFAULT_TZ): string {
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export function shiftDate(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nowInBotDayISO(timeZone = DEFAULT_TZ): string {
  const now = new Date();
  return `${todayISO(timeZone)}T${now.toISOString().slice(11)}`;
}

export function formatDateRu(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}
