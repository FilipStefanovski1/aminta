// Bulk-paste writing examples — pure parsing/merge logic, extracted out of
// VoiceProfileForm.tsx so it's testable without mounting the component.

/**
 * Splits a bulk paste into individual posts. Blank lines only, never single
 * newlines — splitting on every line break would risk chopping one real
 * multi-line post into several fake "examples." A paste with no blank
 * lines is treated as one example, which is always safe (never wrongly
 * fragments real text), rather than guessing at a riskier heuristic.
 */
export function parseBulkPosts(raw: string): string[] {
  return raw.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
}

/**
 * Merges newly parsed posts into the existing examples list — dedupes
 * exact repeats and caps the combined total, without ever dropping
 * existing examples to make room (parsed posts are appended, then the
 * whole set is capped, so existing examples always win any overflow).
 */
export function mergeExamples(existing: string[], parsed: string[], max: number): string[] {
  return Array.from(new Set([...existing, ...parsed])).slice(0, max)
}
