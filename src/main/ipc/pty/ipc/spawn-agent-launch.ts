/**
 * A pane's own agent launch (an AI button, an OpenCode model tab), planned inside the pane's spawn.
 *
 * The spawn carries the `agent.launch` params the window used to send the host. Main names the pane
 * from the spawn and plans the launch with the planner every host launch uses. It runs once the
 * pane is reserved, so a concurrent spawn of the pane joins this one, and before preflight, so
 * everything after runs the planned command as it runs any pane's. A spawn that reattaches a live
 * agent never gets here. No launch record is written: nothing reads one for a pane's own launch.
 */

import { AgentLaunch } from '../../../../shared/rpc-contract/agent-launch-params'
import { toAgentLaunchPreferences } from '../../../../shared/agent-launch-preferences'
import { hasClosedTerminalTabRecord } from '../../../../shared/closed-terminal-tab-tombstones'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { AgentLaunchTabClosedError } from '../../../../shared/agent-launch-tab-closed'
import { trackRunningAgentLaunchPane } from '../../../agent-launch/agent-launch-pane-attachment'
import { resolveUnlaunchedIntent } from '../../../runtime/rpc/methods/agent-launch-intent-resolution'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import type { Store } from '../../../persistence'
import { resolveEarlyPaneKey } from './spawn-begin'
import { endPaneAgentLaunch, type PaneAgentLaunch } from './spawn-agent-launch-end'
import type { PtyIpcSpawnState } from './spawn-state'
import type { PtySpawnIpcArgs } from './spawn-types'

/** Whether the user's close of this pane, or its whole tab, is already committed to main. */
function closedInSession(store: Store | undefined, paneKey: string): boolean {
  const pane = parsePaneKey(paneKey)
  const session = store?.getWorkspaceSession()
  return Boolean(
    pane &&
    session &&
    (session.terminalSurfaceTombstonesByPaneKey?.[paneKey] ||
      hasClosedTerminalTabRecord(session.closedTerminalTabTombstonesByTabId, pane.tabId))
  )
}

/** The planned launch replaces whatever the pane would have run; the pane's own spawn facts stay. */
function withPlannedLaunch(
  args: PtySpawnIpcArgs,
  planned: Awaited<ReturnType<OrcaRuntimeService['planAgentPaneLaunch']>>
): PtySpawnIpcArgs {
  const {
    agentLaunch: _launch,
    command: _command,
    launchConfig: _config,
    launchAgent: _agent,
    startupCommandDelivery: _delivery,
    telemetry: _telemetry,
    ...pane
  } = args
  return {
    ...pane,
    command: planned.command,
    ...(planned.env ? { env: { ...args.env, ...planned.env } } : {}),
    ...(planned.launchConfig ? { launchConfig: planned.launchConfig } : {}),
    ...(planned.launchAgent ? { launchAgent: planned.launchAgent } : {}),
    ...(planned.startupCommandDelivery
      ? { startupCommandDelivery: planned.startupCommandDelivery }
      : {}),
    ...(planned.telemetry ? { telemetry: planned.telemetry } : {})
  }
}

export async function planPaneAgentLaunch(ctx: PtyIpcSpawnState): Promise<void> {
  const { args, deps } = ctx
  // A live owner of the pane is adopted below: its agent already runs there.
  if (args.agentLaunch === undefined || ctx.earlyStablePaneOwner) {
    return
  }
  const runtime = deps.runtime
  const paneKey = resolveEarlyPaneKey(args)
  const pane = paneKey ? parsePaneKey(paneKey) : null
  const request = typeof args.agentLaunch === 'object' ? args.agentLaunch : null
  const launch =
    request && 'launch' in request && typeof request.launch === 'object'
      ? request.launch
      : undefined
  const params = AgentLaunch.safeParse({ ...launch, paneKey })
  if (
    !runtime ||
    !paneKey ||
    !pane ||
    !args.worktreeId ||
    !params.success ||
    params.data.reuseTerminal
  ) {
    throw new Error('agent_launch_request_invalid')
  }
  const running = trackRunningAgentLaunchPane({ worktreeId: args.worktreeId, paneKey })
  const owned: PaneAgentLaunch = {
    runtime,
    address: { worktreeId: args.worktreeId, tabId: pane.tabId, leafId: pane.leafId },
    notice: request !== null && 'notice' in request && request.notice === true,
    paneKey,
    running,
    dispatched: false,
    refuseIfClosed: () => {
      if (running.closedByUser() || closedInSession(deps.store, paneKey)) {
        throw new AgentLaunchTabClosedError()
      }
    }
  }
  ctx.paneAgentLaunch = owned
  try {
    const intent = await resolveUnlaunchedIntent(params.data, runtime, null)
    if (intent.target.kind !== 'existing') {
      throw new Error('agent_launch_request_invalid')
    }
    const launchPreferences = toAgentLaunchPreferences(intent.sessionOptions)
    const planned = await runtime.planAgentPaneLaunch(intent.target.worktree, {
      startupAgent: intent.agent,
      ...(intent.agentArgs !== undefined ? { agentArgs: intent.agentArgs } : {}),
      ...(launchPreferences ? { launchPreferences } : {}),
      ...(intent.launchSource ? { launchSource: intent.launchSource } : {}),
      ...(intent.cwd ? { cwd: intent.cwd } : {}),
      ...(intent.prompt
        ? {
            startupPrompt: intent.prompt.text,
            startupPromptDelivery:
              intent.prompt.delivery === 'draft' ? ('draft' as const) : ('auto-submit' as const)
          }
        : {}),
      ...(args.shellOverride ? { shellOverride: args.shellOverride } : {})
    })
    ctx.args = withPlannedLaunch(args, planned)
  } catch (error) {
    throw endPaneAgentLaunch(ctx, { error })
  }
}
