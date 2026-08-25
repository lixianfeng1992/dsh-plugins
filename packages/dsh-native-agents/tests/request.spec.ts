import {
  createAssistantMessage,
  createUserMessage,
  type GenerateOptions,
  type Message,
} from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { initialConversationAllowed, projectNativePrompt } from '../src/request.js'

function options(messages: Message[], overrides: Partial<GenerateOptions> = {}): GenerateOptions {
  return {
    provider: 'native-codex',
    model: 'default',
    messages,
    sessionId: 'child' as GenerateOptions['sessionId'],
    ...overrides,
  }
}

const user = (text: string): Message => createUserMessage({
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

const assistant = (text: string): Message => createAssistantMessage({
  content: [{ type: 'text', text }],
  source: { provider: 'native-codex', model: 'default' },
})

const injected = (text: string): Message => createUserMessage({
  content: [{ type: 'text', text }],
  source: { kind: 'plugin', plugin: 'test', form: 'snapshot', sections: [] },
})

describe('native request projection', () => {
  it('forwards only the newest user message', () => {
    const request = options([user('remember alpha'), assistant('done'), user('what word?')])
    expect(projectNativePrompt(request)).toBe('what word?')
    expect(initialConversationAllowed(request)).toBe(false)
  })

  it('ignores continuable-child tools and injected context', () => {
    const request = options(
      [user('remember alpha'), injected('runtime context')],
      { tools: [{ name: 'report', description: 'report', parameters: {} }] },
    )

    expect(projectNativePrompt(request)).toBe('remember alpha')
    expect(initialConversationAllowed(request)).toBe(true)
  })

  it('allows creation only for one initial user message', () => {
    expect(initialConversationAllowed(options([user('first')]))).toBe(true)
    expect(initialConversationAllowed(options([user('first'), user('retry')]))).toBe(false)
  })

  it.each([
    [{ purpose: 'compaction' as const }, 'auxiliary'],
    [{ sessionId: undefined }, 'sessionId'],
  ])('rejects unsupported request fields %#', (overrides, message) => {
    expect(() => projectNativePrompt(options([user('first')], overrides))).toThrow(message)
  })
})
