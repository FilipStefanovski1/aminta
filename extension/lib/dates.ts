// Local-calendar date helpers.
//
// All "today" logic (streaks, daily missions, free limit, XP cap) must use the
// user's LOCAL calendar day. Using toISOString() (UTC) makes streaks and daily
// resets flip mid-evening for anyone west of UTC.

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function todayLocal(): string {
  return fmt(new Date())
}

export function yesterdayLocal(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return fmt(d)
}
