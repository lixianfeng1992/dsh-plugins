import {
  LlmAdapter,
  LlmError,
  resolveRetryPolicy,
  type ContentBlock,
  type GenerateOptions,
  type LlmProviderInfo,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type ResolvedRetryPolicy,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { asNativeAgentError, NativeAgentError } from './error.js'
import type { NativeCatalog, NativeEvent, NativeProvider, NativeRuntime } from './native.js'
import { initialConversationAllowed, projectNativePrompt } from './request.js'
import { NativeRuntimeRegistry } from './runtime-registry.js'

interface PreparedNativeCall {
  readonly model: LlmResolvedModelInfo
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}

export interface NativeLlmAdapterOptions {
  readonly route: string
  readonly provider: NativeProvider
  readonly registry: NativeRuntimeRegistry
  readonly resolveCwd: (sessionId: string) => string
}

const NO_RETRY_POLICY = resolveRetryPolicy(
  { mode: 'normal', maxRetries: 0 },
  'native-agents.retryPolicy',
)

function llmError(error: unknown, provider: string, sessionId: string): LlmError {
  const normalized = asNativeAgentError(
    error,
    'NATIVE_PROVIDER_FAILURE',
    `native-agents: ${provider} turn failed for DSH session ${JSON.stringify(sessionId)}`,
  )
  return new LlmError(normalized.message, normalized.code, { cause: normalized })
}

function failed(event: Extract<NativeEvent, { type: 'turn-failed' }>): StreamChunk {
  return { type: 'finish', reason: { kind: 'error', failure: event.failure } }
}

function closeBlocks(
  blocks: Map<'text' | 'reasoning', { index: number; text: string }>,
): StreamChunk[] {
  const chunks: StreamChunk[] = []
  for (const [type, state] of [...blocks.entries()].sort((left, right) => left[1].index - right[1].index)) {
    const block: ContentBlock = { type, text: state.text }
    chunks.push({ type: 'block-end', index: state.index, block })
  }
  blocks.clear()
  return chunks
}

/** DSH LLM adapter that projects one resident native provider runtime. */
export class NativeLlmAdapter extends LlmAdapter {
  private readonly active = new Set<string>()
  private readonly appliedModels = new WeakMap<NativeRuntime, string | null>()
  private catalog: { expiresAt: number; value: Promise<NativeCatalog> } | undefined

  constructor(private readonly options: NativeLlmAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: this.options.provider.displayName }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return NO_RETRY_POLICY
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const catalog = await this.catalogFor()
    return catalog.models.map(model => ({
      provider,
      id: model.id,
      name: model.name,
      ...model.description === undefined ? {} : { description: model.description },
      inputModalities: ['text'],
    }))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return this.catalogFor().then((catalog) => {
      const found = catalog.models.find(candidate => candidate.id === model)
      return {
        provider,
        id: model,
        name: found?.name ?? (model === 'default' ? 'Native default' : model),
        ...found?.description === undefined ? {} : { description: found.description },
        ...found?.contextWindow === undefined ? {} : { context: { contextWindow: found.contextWindow } },
        inputModalities: ['text'],
      }
    })
  }

  async prepareCall(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<PreparedNativeCall> {
    return {
      model: await this.resolveModel(provider, model),
      stream: options => this.stream(options),
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const sessionId = String(options.sessionId ?? '')
    let runtime: NativeRuntime | undefined
    let terminal = false
    const blocks = new Map<'text' | 'reasoning', { index: number; text: string }>()
    try {
      const prompt = projectNativePrompt(options)
      if (this.active.has(sessionId)) {
        throw new NativeAgentError(
          'NATIVE_TURN_ACTIVE',
          `native-agents: DSH session ${JSON.stringify(sessionId)} already has an active native turn`,
        )
      }
      this.active.add(sessionId)
      const cwd = this.options.resolveCwd(sessionId)
      const signal = options.signal ?? new AbortController().signal
      runtime = await this.options.registry.resolve({
        dshSessionId: sessionId,
        cwd,
        model: options.model === 'default' ? undefined : options.model,
        allowCreate: initialConversationAllowed(options),
        signal,
      })
      const selectedModel = options.model === 'default' ? undefined : options.model
      const applied = this.appliedModels.get(runtime)
      if (applied === undefined) {
        this.appliedModels.set(runtime, selectedModel ?? null)
      } else if (applied !== (selectedModel ?? null)) {
        await runtime.setModel(selectedModel)
        this.appliedModels.set(runtime, selectedModel ?? null)
      }
      for await (const event of runtime.runTurn({ prompt, signal })) {
        switch (event.type) {
          case 'thread-started':
            await this.options.registry.markReady(sessionId, event.nativeId)
            break
          case 'text-delta':
          case 'reasoning-delta': {
            const type = event.type === 'text-delta' ? 'text' : 'reasoning'
            let state = blocks.get(type)
            if (state === undefined) {
              state = { index: blocks.size, text: '' }
              blocks.set(type, state)
              yield { type: 'block-start', index: state.index, blockType: type }
            }
            state.text += event.text
            yield { type: event.type, index: state.index, text: event.text }
            break
          }
          case 'tool-start':
          case 'tool-result':
            // Native providers execute tools themselves. DSH has no plugin-safe
            // session event registration API, so tool details stay provider-owned.
            break
          case 'usage':
            yield { type: 'usage', usage: event.usage }
            break
          case 'turn-completed':
            yield* closeBlocks(blocks)
            terminal = true
            yield {
              type: 'finish',
              reason: { kind: 'stop' },
              replayState: {
                response: {
                  provider: runtime.provider,
                  nativeId: runtime.nativeId,
                  ...event.nativeTurnId === undefined ? {} : { nativeTurnId: event.nativeTurnId },
                },
              },
            }
            break
          case 'turn-failed':
            yield* closeBlocks(blocks)
            terminal = true
            this.options.registry.evict(sessionId, runtime)
            await runtime.close().catch(() => {})
            yield failed(event)
            break
          case 'turn-canceled':
            yield* closeBlocks(blocks)
            terminal = true
            yield {
              type: 'finish',
              reason: {
                kind: 'aborted',
                failure: { code: 'NATIVE_TURN_ABORTED', message: event.reason },
              },
            }
            break
        }
      }
      if (!terminal) {
        this.options.registry.evict(sessionId, runtime)
        throw new NativeAgentError(
          'NATIVE_PROTOCOL_ERROR',
          `native-agents: ${this.options.provider.id} event stream ended without a terminal event`,
        )
      }
    } catch (error: unknown) {
      if (runtime !== undefined && !terminal) {
        this.options.registry.evict(sessionId, runtime)
        await runtime.close().catch(() => {})
      }
      throw llmError(error, this.options.provider.id, sessionId)
    } finally {
      this.active.delete(sessionId)
    }
  }

  private catalogFor(): Promise<NativeCatalog> {
    const now = Date.now()
    if (this.catalog !== undefined && this.catalog.expiresAt > now) return this.catalog.value
    const value = this.options.provider.fetchCatalog().catch((error: unknown) => {
      if (this.catalog?.value === value) this.catalog = undefined
      throw error
    })
    this.catalog = { expiresAt: now + 30_000, value }
    return value
  }
}
