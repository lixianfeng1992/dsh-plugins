import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import { NativeAgentError } from './error.js'

function conversationMessages(messages: readonly Message[]): Message[] {
  return messages.filter(message => message.role === 'user'
    && (message.source.kind === 'user' || message.source.kind === 'coordinator'))
}

/** Whether a missing binding may create the conversation represented by this request. */
export function initialConversationAllowed(options: GenerateOptions): boolean {
  const users = conversationMessages(options.messages)
  return users.length === 1
    && options.messages.every(message => message.role === 'user')
}

/** Project one DSH request to the single new text turn owned by the native provider. */
export function projectNativePrompt(options: GenerateOptions): string {
  if (options.sessionId === undefined || options.sessionId.length === 0) {
    throw new NativeAgentError('NATIVE_SESSION_ID_REQUIRED', 'native-agents: request sessionId is required')
  }
  if (options.purpose !== undefined) {
    throw new NativeAgentError('NATIVE_AUXILIARY_UNSUPPORTED', 'native-agents: auxiliary model requests are unsupported')
  }
  const latest = conversationMessages(options.messages).at(-1)
  if (latest === undefined) {
    throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: request must contain a user-authored message')
  }
  const texts: string[] = []
  for (const block of latest.content) {
    if (block.type !== 'text') {
      throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: native prompts support text blocks only')
    }
    texts.push(block.text)
  }
  const prompt = texts.join('\n')
  if (prompt.trim().length === 0) {
    throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: native prompt must not be empty')
  }
  return prompt
}
