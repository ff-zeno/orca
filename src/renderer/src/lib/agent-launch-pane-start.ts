/**
 * Whether an AI button's agent started in the pane this window made for it.
 *
 * The pane's own spawn launches the agent, so it is the one to say: true once its spawn returns a
 * process for the pane, false when main reports the launch failed or the user closed the pane. Main
 * reports a failure before the spawn returns, so the first answer is the true one. The prompt's
 * paste waits on it. Session-only: after a reload nothing waits for it.
 */

type PendingStart = { started: Promise<boolean>; settle: (started: boolean) => void }

const pendingStarts = new Map<string, PendingStart>()

// Not `makePaneKey`: that validates the leaf id, and a launch must never fail over bookkeeping.
function startKey(tabId: string, leafId: string): string {
  return JSON.stringify([tabId, leafId])
}

/** Registered before the pane exists, so its first spawn already answers it. */
export function awaitAgentLaunchPaneStart(tabId: string, leafId: string): Promise<boolean> {
  const key = startKey(tabId, leafId)
  let settle!: (started: boolean) => void
  const pending: PendingStart = {
    started: new Promise((resolve) => {
      settle = resolve
    }),
    settle: (started) => {
      if (pendingStarts.get(key) === pending) {
        pendingStarts.delete(key)
      }
      settle(started)
    }
  }
  pendingStarts.get(key)?.settle(false)
  pendingStarts.set(key, pending)
  return pending.started
}

export function settleAgentLaunchPaneStart(
  tabId: string | undefined,
  leafId: string | undefined,
  started: boolean
): void {
  if (tabId && leafId) {
    pendingStarts.get(startKey(tabId, leafId))?.settle(started)
  }
}
