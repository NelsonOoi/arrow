/** Display helpers. All times are shown in the browser's local time zone. */

export function dayOfMonth(iso: string) {
  return new Date(iso).getDate();
}

export function monthShort(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short' });
}

export function timeShort(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function dateLong(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** "7:15 PM": event start + grace minutes. */
export function graceEndsAt(startsAt: string, graceMinutes: number) {
  return timeShort(new Date(new Date(startsAt).getTime() + graceMinutes * 60_000).toISOString());
}

/** Rough call length shown to the host: ~30 s per question, at least 1 min. */
export function callMinutes(questionCount: number) {
  return Math.max(1, Math.ceil(questionCount * 0.45));
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
