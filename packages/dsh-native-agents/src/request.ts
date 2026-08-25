import type { GenerateOptions, Message, UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-subagent'
import { NativeAgentError } from './error.js'

function isNativeInput(message: Message): message is UserMessage {
  return message.role === 'user' && (
    message.source.kind === 'user'
    || message.source.kind === 'subagent-settled'
    || message.source.kind === 'subagent-report'
    || message.source.kind === 'coordinator'
  )
}

function messagesAfterNativeResponse(options: GenerateOptions): UserMessage[] {
  let start = 0
  for (let index = options.messages.length - 1; index >= 0; index -= 1) {
    const message = options.messages[index]
    if (message?.role === 'assistant' && 'provider' in message.source && message.source.provider === options.provider) {
      start = index + 1
      break
    }
  }
  return options.messages.slice(start).filter(isNativeInput)
}

/** Whether a missing binding may create the conversation represented by this request. */
export function initialConversationAllowed(options: GenerateOptions): boolean {
  const inputs = messagesAfterNativeResponse(options)
  const first = inputs[0]
  return inputs.length === 1
    && first !== undefined
    && first.source.kind === 'user'
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
  const inputs = messagesAfterNativeResponse(options)
  if (inputs.length === 0) {
    throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: request must contain new user or subagent input')
  }
  const projected = inputs.map((message) => {
    const texts: string[] = []
    for (const block of message.content) {
      if (block.type !== 'text') {
        throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: native prompts support text blocks only')
      }
      texts.push(block.text)
    }
    const text = texts.join('\n')
    switch (message.source.kind) {
      case 'user': return { label: 'User', text }
      case 'coordinator': return { label: `Coordinator ${message.source.senderSessionId}`, text }
      case 'subagent-report': return { label: `Subagent report ${message.source.senderSessionId}`, text }
      case 'subagent-settled': return { label: `Subagent settled ${message.source.senderSessionId}`, text }
      default: throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: unsupported message source')
    }
  })
  const first = projected[0]
  const prompt = projected.length === 1 && first?.label === 'User'
    ? first.text
    : projected.map(message => `[${message.label}]\n${message.text}`).join('\n\n')
  if (prompt.trim().length === 0) {
    throw new NativeAgentError('NATIVE_PROMPT_INVALID', 'native-agents: native prompt must not be empty')
  }
  return prompt
}
