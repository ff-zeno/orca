import type { z } from 'zod'
import type { AgentLaunch } from './rpc-contract/agent-launch-params'

/**
 * An agent launch a window's pane hands its own spawn (an AI button, an OpenCode model tab): the
 * `agent.launch` params, without the pane, which main names from the spawn that carries them, and
 * without an operation id, since a pane's own launch writes no launch record.
 */
export type AgentPaneLaunchRequest = {
  launch: Omit<z.input<typeof AgentLaunch>, 'paneKey' | 'operationId'>
  /** The pane's tab shows how a failed launch ended (an AI button's notice); otherwise the spawn
   *  fails with its own error, as any pane's does. */
  notice?: true
}
