// Canonical serialization for voice.examples — a JSON-stringified string[]
// where each entry is one full X post, verbatim, internal line breaks and
// blank lines intact. Every read site in the extension (VoiceProfileForm,
// OnboardingWizard, HomeTab, missions, styleProfile's corpus builder) must
// go through parseExamples()/serializeExamples() here — never re-split or
// re-join examples locally — so a post can't be silently reinterpreted as
// several fragments depending on which screen happens to read it.
//
// Root cause this fixes: OnboardingWizard used to serialize examples with
// `.join("\n")` — plain legacy text, not JSON — while VoiceProfileForm
// always used JSON.stringify(). A profile trained during onboarding, once
// later opened in Train, hit the legacy-format fallback that used to split
// on blank lines and, failing that, on every single line — shredding a real
// multi-paragraph post (which naturally contains its own blank lines
// between paragraphs) into one fragment per line or paragraph. That
// polluted the training corpus with many artificially tiny "examples",
// which also drags down StyleProfile.lengthProfile (see
// lib/styleProfile.ts's computeLengthProfile) and biases generation toward
// short output regardless of the selected Length.
//
// The fix has two parts: (1) every write site below now serializes through
// serializeExamples (canonical JSON, always), and (2) the legacy-format
// fallback in parseExamples never splits raw text at all — the whole string
// becomes ONE example. Splitting on blank lines is exactly the ambiguous
// heuristic the bug came from (a paragraph break inside one post is
// indistinguishable from a boundary between two posts once flattened to a
// single string), so the only heuristic that can never wrongly fragment a
// real post is not guessing at all.

export function serializeExamples(examples: string[]): string {
  return JSON.stringify(examples.map((e) => e.trim()).filter(Boolean))
}

/**
 * Parses voice.examples back into individual post strings. Canonical
 * (current) storage is a JSON array; anything else is legacy plain text and
 * is treated as exactly ONE example, never split — see the header comment
 * above for why splitting is unsafe. Existing accounts whose examples were
 * saved in the old plain-joined format will see previously-fragmented
 * entries merge into one combined example the next time they load Train;
 * nothing is deleted, but multi-post legacy data may need re-splitting by
 * hand (removing it and re-adding each post) to fully recover distinct
 * examples — see the training-parser patch's final report.
 */
export function parseExamples(raw: string | undefined | null): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
      }
    } catch {
      // Malformed JSON — fall through to the legacy single-example path.
    }
  }
  return [trimmed]
}

export function countExamples(raw: string | undefined | null): number {
  return parseExamples(raw).length
}
