/** Date helpers shared across the app.
 *
 * The backend stores `planned_date` as a strict `YYYY-MM-DD` string (no
 * timezone, no time component) — see `TripCreate.planned_date`. We always
 * format it for display with the rider's locale; we never want to show the
 * raw ISO string.
 *
 * Centralising here so we don't drift between trips.tsx, discover.tsx,
 * trip/[id].tsx, and trip/edit/[id].tsx — every one of which had its own
 * near-identical copy of these helpers before this module landed.
 */

/** Format a `YYYY-MM-DD` planned date as `Thu, 1 May 2025`.
 * Returns `''` for null/empty so callers can hide the row.
 * If the input doesn't look like the expected shape, returns it unchanged
 * rather than crashing — better to show something raw than to throw. */
export function formatTripDate(raw: string | undefined | null): string {
  if (!raw) return '';
  const d = parsePlannedDate(raw);
  if (!d) return raw;
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Parse a `YYYY-MM-DD` to a Date at local midnight.
 *
 * Why local midnight, not UTC: a planned ride on `2025-05-01` should display
 * as "1 May 2025" everywhere in India regardless of how the device clock
 * thinks of UTC. `new Date("2025-05-01")` parses as UTC midnight, which
 * shifts a day backward in any TZ west of UTC and forward in TZs east; the
 * `T00:00:00` suffix forces local-tz parsing.
 *
 * Returns `null` for unparseable input so callers can decide on a fallback. */
export function parsePlannedDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Inverse of `parsePlannedDate` — Date → `YYYY-MM-DD`. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today at local midnight — useful as a "minimum" floor for date pickers. */
export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
