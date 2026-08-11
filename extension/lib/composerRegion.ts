// Pure decision logic for "what should Aminta actually write into the X
// composer this time" — extracted out of contents/twitter-bridge.ts so it's
// unit-testable without a real contenteditable DOM. See that file's
// managedRegions/insertAmintaText for how this plugs into the actual insert.
//
// The core idea: Generate/Polish/Insert must feel like one editable draft
// Aminta owns, not repeated separate insertions. Polish (or a second
// Generate) has to REPLACE what Aminta last wrote, never append a second
// copy, while leaving anything the user typed outside that text untouched.
//
// We track only the surrounding boundary (the text immediately before and
// after Aminta's last insertion), never the inserted text itself — that's
// what lets "the user edited a word inside the managed text" still count as
// the same region (its middle is allowed to differ from what was last
// written; only the outer boundary has to still match) while "the user
// typed something new outside it" correctly invalidates tracking.
export interface ManagedRegion {
  prefix: string
  suffix: string
}

// Decides what should actually be written to the composer for a new Aminta
// insertion, given its current full text and whatever region (if any) is
// still tracked from the previous insertion.
//
// - If a tracked region's prefix/suffix still bound the current text, the
//   new text replaces only the middle — preserving everything outside it,
//   regardless of whether the middle was left alone, edited, or deleted
//   down to nothing.
// - Otherwise (no tracked region yet, or the user edited past its boundary
//   — e.g. cleared the composer entirely) this is a fresh insertion into
//   untracked content, so the whole composer is replaced.
export function resolveAmintaInsertion(
  currentText: string,
  tracked: ManagedRegion | undefined,
  newText: string
): { fullText: string; region: ManagedRegion } {
  if (
    tracked &&
    currentText.length >= tracked.prefix.length + tracked.suffix.length &&
    currentText.startsWith(tracked.prefix) &&
    currentText.endsWith(tracked.suffix)
  ) {
    return { fullText: tracked.prefix + newText + tracked.suffix, region: tracked }
  }
  return { fullText: newText, region: { prefix: "", suffix: "" } }
}
