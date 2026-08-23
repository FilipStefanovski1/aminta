// Wires threadBuilder.ts's pure state machine to real chrome.tabs / X
// content-script calls. Kept separate from threadBuilder.ts so the state
// machine itself stays testable with plain mocks (see threadBuilder.test.ts)
// and separate from components/ThreadResults.tsx so the UI stays focused on
// rendering, not chrome.* plumbing.
//
// No AI credits are spent and no XP is queued anywhere in this file —
// building a thread draft in X is not a generation and is not (yet) a
// publish; only a real, confirmed X post through the existing publish
// detector (contents/twitter-publish-detector.ts -> background.ts) ever
// awards XP.

import {
  getActiveXTabId,
  insertAndVerifyThreadPost,
  prepareThreadBuild,
  stopThreadBuildWait,
  waitForThreadComposerAt,
} from "~lib/messaging"
import type { StepResult, ThreadBuilderHandlers } from "~lib/threadBuilder"

function toStep(res: { ok: boolean; error?: string }): StepResult {
  return { ok: res.ok, error: res.error }
}

/**
 * Builds live handlers bound to one specific X tab, captured once at the
 * start of the build — every step targets that tab explicitly rather than
 * "whichever tab is active," so the user switching tabs mid-build can't
 * silently redirect it.
 */
export async function createLiveThreadBuilderHandlers(
  onState: ThreadBuilderHandlers["onState"]
): Promise<ThreadBuilderHandlers | { error: string }> {
  const tabId = await getActiveXTabId()
  if (!tabId) return { error: "Open an X / Twitter tab first." }

  return {
    prepare: async () => toStep(await prepareThreadBuild(tabId)),
    insertAndVerify: async (index, text) => toStep(await insertAndVerifyThreadPost(tabId, index, text)),
    waitForComposer: async (index, previousIndex, previousText) =>
      toStep(await waitForThreadComposerAt(tabId, index, previousIndex, previousText)),
    // Fire-and-forget: the content script's own poll checks a cancellation
    // flag every ~200ms (see contents/twitter-bridge.ts), so this doesn't
    // need to be awaited for Stop to take effect quickly.
    cancelWait: () => { void stopThreadBuildWait(tabId) },
    onState,
  }
}
