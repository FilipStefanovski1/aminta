// Disposable-domain blocklist and common-typo suggestions for signup emails.
// This is a UX check, not a security boundary — real protection against
// nonexistent mailboxes comes from Supabase's "Confirm email" setting.

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "guerrillamail.com",
  "10minutemail.com", "yopmail.com", "throwawaymail.com", "trashmail.com",
  "fakeinbox.com", "getnada.com", "dispostable.com", "sharklasers.com",
  "maildrop.cc", "mintemail.com", "mailnesia.com", "mytrashmail.com",
  "spamgourmet.com", "moakt.com", "emailondeck.com", "burnermail.io",
  "guerrillamailblock.com", "tempinbox.com", "mohmal.com", "discard.email",
  "spambog.com", "tempr.email", "0-mail.com", "mailcatch.com",
])

const TYPO_SUGGESTIONS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com",
  "gmil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.co": "gmail.com",
  "gmailcom": "gmail.com", "gamil.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmil.com": "hotmail.com", "hotmai.com": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com",
  "iclod.com": "icloud.com", "iclou.com": "icloud.com",
}

export function checkSignupEmail(rawEmail: string): { error?: string; suggestion?: string } {
  const email = rawEmail.trim().toLowerCase()
  const domain = email.split("@")[1]
  if (!domain) return {}

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { error: "Disposable email addresses aren't allowed. Please use a permanent address." }
  }

  const suggestedDomain = TYPO_SUGGESTIONS[domain]
  if (suggestedDomain) {
    return { suggestion: `${email.split("@")[0]}@${suggestedDomain}` }
  }

  return {}
}
