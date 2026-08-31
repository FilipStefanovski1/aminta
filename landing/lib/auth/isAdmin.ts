// Gate for the internal /admin dashboard — a hardcoded env allowlist, not a
// role stored in the database. There is no admin concept anywhere else in
// this app (no roles table, no middleware), so this stays intentionally
// simple: a comma-separated ADMIN_EMAILS env var, checked case-insensitively.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(email.toLowerCase())
}
