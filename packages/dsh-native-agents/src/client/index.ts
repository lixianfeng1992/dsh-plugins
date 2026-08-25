import { createElement, memo, type CSSProperties, type ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ChatNodeViewProps, RenderMessageImages,
} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots']

type ContextNode = ChatNodeViewProps<'context'>['node']
const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
}

const labelStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 12,
  lineHeight: '18px',
}

const bubbleStyle: CSSProperties = {
  maxWidth: 'min(525px, 82%)',
  padding: '10px 16px',
  overflowWrap: 'anywhere',
  borderRadius: 18,
  background: 'var(--dsw-specific-bubble)',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: 16,
  lineHeight: '24px',
  whiteSpace: 'pre-wrap',
}

const contextStyle: CSSProperties = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: 14,
  lineHeight: '24px',
}

const contextBodyStyle: CSSProperties = {
  margin: '6px 0 0 22px',
  padding: '8px 12px',
  overflowWrap: 'anywhere',
  borderRadius: 6,
  background: 'var(--dsw-alias-interactive-bg-hover)',
  color: 'var(--dsw-alias-label-secondary)',
  whiteSpace: 'pre-wrap',
}

/** Whether a durable context source is a parent-to-child relay. */
export function isCoordinatorRelay(source: unknown): boolean {
  return typeof source === 'object'
    && source !== null
    && 'kind' in source
    && source.kind === 'coordinator'
    && 'form' in source
    && source.form === 'relay'
}

function isChinese(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.lang.toLowerCase().startsWith('zh')
}

function contentView(
  content: ContextNode['data']['content'],
  renderMessageImages?: RenderMessageImages,
): ReactNode {
  const text: string[] = []
  const images: { attachment: never }[] = []
  const other: unknown[] = []
  for (const block of content) {
    if (block.type === 'text') text.push(block.text)
    else if (block.type === 'image') images.push({ attachment: block.attachment as never })
    else other.push(block)
  }
  return createElement(
    'div',
    null,
    text.length > 0 ? text.join('') : null,
    images.length > 0 && renderMessageImages !== undefined
      ? renderMessageImages({ images, align: 'end' })
      : null,
    other.length > 0
      ? createElement('pre', { style: { margin: text.length > 0 ? '8px 0 0' : 0, whiteSpace: 'pre-wrap' } }, JSON.stringify(other, null, 2))
      : null,
  )
}

/** Coordinator relays render as parent-agent bubbles; other context remains disclosed context. */
export const NativeContextNodeView = memo(function NativeContextNodeView({
  node, renderMessageImages,
}: Pick<ChatNodeViewProps<'context'>, 'node' | 'renderMessageImages'>) {
  const data = node.data
  const zh = isChinese()
  if (isCoordinatorRelay(data.source)) {
    return createElement(
      'div',
      { style: rowStyle, 'data-native-agent-relay': true },
      createElement('span', { style: labelStyle }, zh ? '来自父代理' : 'From parent agent'),
      createElement('div', { style: bubbleStyle }, contentView(data.content, renderMessageImages)),
    )
  }

  const producer = data.provenance.label === null ? '' : ` · ${data.provenance.label}`
  return createElement(
    'details',
    { style: contextStyle },
    createElement('summary', null, `${zh ? '上下文注入' : 'Context injection'}${producer}`),
    createElement('div', { style: contextBodyStyle }, contentView(data.content)),
  )
})

/** Install the native-agent conversation presentation. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'context',
    priority: -100,
    registrant: 'dsh-native-agents',
  }, NativeContextNodeView))
}
