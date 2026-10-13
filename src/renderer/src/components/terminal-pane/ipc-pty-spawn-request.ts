import type { IpcPtyTransportOptions, PtyConnectResult, PtyTransport } from './pty-transport-types'
import type { AgentPaneLaunchRequest } from '../../../../shared/agent-pane-launch-request'
import { toRuntimeTerminalWorktreeSelector } from '../../runtime/runtime-worktree-selector'

type PtyConnectOptions = Parameters<PtyTransport['connect']>[0]

/** An OpenCode tab with a picked model starts from the host's plan in this pane's own spawn; its
 *  prompt keeps its submit or draft. */
function openCodeModelLaunch(
  transportOptions: IpcPtyTransportOptions
): AgentPaneLaunchRequest | undefined {
  const preferences = Object.entries(transportOptions.agentLaunchPreferences ?? {}).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
  if (transportOptions.launchAgent !== 'opencode' || preferences.length === 0) {
    return undefined
  }
  const { worktreeId, tabId, leafId, connectionId, resumeProviderSession, cwd } = transportOptions
  if (!worktreeId || !tabId || !leafId || connectionId || resumeProviderSession) {
    throw new Error('capability_unsupported')
  }
  return {
    launch: {
      agent: 'opencode',
      target: { kind: 'existing', worktree: toRuntimeTerminalWorktreeSelector(worktreeId) },
      prompt: {
        text: transportOptions.agentPrompt ?? '',
        delivery: transportOptions.agentPromptDelivery === 'draft' ? 'draft' : 'submit'
      },
      sessionOptions: Object.fromEntries(preferences),
      ...(transportOptions.agentArgsOverride !== undefined
        ? { agentArgs: transportOptions.agentArgsOverride }
        : {}),
      ...(cwd ? { cwd } : {})
    }
  }
}

/** `incarnationId` names which lifetime of the returned id this spawn owns; absent when the
 *  execution host predates the field. It is deliberately NOT on `PtyConnectResult` — only the
 *  connect handshake needs it, to fence buffered state left by an earlier owner of the same id. */
export type IpcPtySpawnResponse = PtyConnectResult & {
  isReattach?: boolean
  incarnationId?: string
}

export async function spawnIpcPty(
  transportOptions: IpcPtyTransportOptions,
  connectOptions: PtyConnectOptions,
  admittedSessionId?: string
): Promise<IpcPtySpawnResponse> {
  const agentLaunch = admittedSessionId
    ? undefined
    : (transportOptions.agentLaunch ?? openCodeModelLaunch(transportOptions))
  const {
    cwd,
    cwdFallback,
    env,
    envToDelete,
    command,
    commandDelivery,
    launchConfig,
    resumeProviderSession,
    launchToken,
    launchAgent,
    startupCommandDelivery,
    connectionId,
    worktreeId,
    tabId,
    leafId,
    placement,
    shellOverride,
    projectRuntime,
    terminalColorQueryReplies,
    terminalKittyKeyboardProtocol,
    telemetry
  } = transportOptions
  const shouldSendLocalCwdFallback =
    cwdFallback === 'worktree' && !connectionId && !admittedSessionId
  const resumesAgent = Boolean(connectOptions.resumeProviderSession ?? resumeProviderSession)
  const spawnIntent =
    resumesAgent && !admittedSessionId ? connectOptions.resumeSpawnIntent : undefined
  // Why: a reattach under an admitted session id must never stop the PTY it is reattaching.
  const replacesPtyId = admittedSessionId ? null : (connectOptions.claimReplacedPtyId?.() ?? null)
  return window.api.pty.spawn({
    cols: connectOptions.cols ?? 80,
    rows: connectOptions.rows ?? 24,
    cwd,
    ...(shouldSendLocalCwdFallback ? { cwdFallback } : {}),
    env: connectOptions.env ?? env,
    ...((connectOptions.envToDelete ?? envToDelete)
      ? { envToDelete: connectOptions.envToDelete ?? envToDelete }
      : {}),
    command: connectOptions.command ?? command,
    ...((connectOptions.commandDelivery ?? commandDelivery)
      ? { commandDelivery: connectOptions.commandDelivery ?? commandDelivery }
      : {}),
    ...((connectOptions.launchConfig ?? launchConfig)
      ? { launchConfig: connectOptions.launchConfig ?? launchConfig }
      : {}),
    ...((connectOptions.resumeProviderSession ?? resumeProviderSession)
      ? { resumeProviderSession: connectOptions.resumeProviderSession ?? resumeProviderSession }
      : {}),
    ...((connectOptions.launchToken ?? launchToken)
      ? { launchToken: connectOptions.launchToken ?? launchToken }
      : {}),
    ...((connectOptions.launchAgent ?? launchAgent)
      ? { launchAgent: connectOptions.launchAgent ?? launchAgent }
      : {}),
    ...((connectOptions.startupCommandDelivery ?? startupCommandDelivery)
      ? {
          startupCommandDelivery: connectOptions.startupCommandDelivery ?? startupCommandDelivery
        }
      : {}),
    ...(connectionId ? { connectionId } : {}),
    ...(admittedSessionId ? { sessionId: admittedSessionId } : {}),
    ...(connectOptions.initiallyHidden ? { initiallyHidden: true } : {}),
    worktreeId,
    ...(tabId ? { tabId } : {}),
    ...(leafId ? { leafId } : {}),
    ...(placement && !admittedSessionId ? { placement } : {}),
    ...(spawnIntent ? { spawnIntent } : {}),
    ...(replacesPtyId ? { replacesPtyId } : {}),
    ...(shellOverride ? { shellOverride } : {}),
    ...(projectRuntime ? { projectRuntime } : {}),
    ...(terminalColorQueryReplies ? { terminalColorQueryReplies } : {}),
    ...(terminalKittyKeyboardProtocol === true ? { terminalKittyKeyboardProtocol: true } : {}),
    ...(telemetry ? { telemetry } : {}),
    ...(agentLaunch ? { agentLaunch } : {})
  })
}
