import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildExecutionHostAgentStartupPlan,
  planExecutionHostStartupWithPromptCandidate
} from '../opencode/opencode-model-startup-plan'
import { buildRuntimeAgentTerminalStartupOptions } from './runtime-agent-terminal-startup'
import { buildAgentStartupPlan } from '../../shared/tui-agent-startup'

vi.mock('../opencode/opencode-model-startup-plan', () => ({
  buildExecutionHostAgentStartupPlan: vi.fn(),
  planExecutionHostStartupWithPromptCandidate: vi.fn()
}))

const WORKSPACE = {
  id: 'wt-1',
  path: '/tmp/wt-1',
  connectionId: null,
  repo: null,
  folderWorkspace: null
}
const PLAN = buildAgentStartupPlan({
  agent: 'opencode',
  prompt: '',
  cmdOverrides: {},
  platform: 'darwin',
  allowEmptyPromptLaunch: true
})!

function plan(opts: { startupPromptDelivery?: 'auto-submit' | 'draft' }) {
  return buildRuntimeAgentTerminalStartupOptions(
    WORKSPACE,
    { startupAgent: 'opencode', startupPrompt: 'hi', ...opts },
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the planner reads only these settings for an enabled agent with no overrides.
    { agentCmdOverrides: {}, disabledTuiAgents: [] } as never,
    'darwin',
    { model: 'openai/gpt-5' },
    'host'
  )
}

// An OpenCode model tab fixes its prompt's delivery; one planner keeps it, and its draft refusal.
describe('the shared agent planner and a fixed prompt delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(buildExecutionHostAgentStartupPlan).mockResolvedValue(PLAN)
    vi.mocked(planExecutionHostStartupWithPromptCandidate).mockResolvedValue({
      plan: PLAN,
      promptCarried: true
    })
  })

  it.each(['draft', 'auto-submit'] as const)(
    'keeps a %s delivery the caller fixed',
    async (delivery) => {
      await plan({ startupPromptDelivery: delivery })

      expect(buildExecutionHostAgentStartupPlan).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'hi', promptDelivery: delivery })
      )
      expect(planExecutionHostStartupWithPromptCandidate).not.toHaveBeenCalled()
    }
  )

  it('lets the launch command decide when no delivery is fixed', async () => {
    await plan({})

    expect(planExecutionHostStartupWithPromptCandidate).toHaveBeenCalledOnce()
    expect(buildExecutionHostAgentStartupPlan).not.toHaveBeenCalled()
  })
})
