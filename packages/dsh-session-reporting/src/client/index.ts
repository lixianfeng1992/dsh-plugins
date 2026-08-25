import { createElement, useEffect, useState, useSyncExternalStore } from 'react'
import Database from 'lucide-react/dist/esm/icons/database.js'
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

interface Rpc { call(channel: string, endpoint: string, payload: unknown): Promise<any> }
interface Session { id: string; user_id: string; canonical_remote: string; created_at: number; cwd: string; last_seq: number; event_count: number; updated_at: string }
interface EventRow { session_id: string; seq: number; type: string; event_time: number; event: string }

class Store {
  private snapshot = { open: false, loading: false, sessions: [] as Session[], events: {} as Record<string, EventRow[]>, error: '' }
  private listeners = new Set<() => void>()
  constructor(private readonly rpc: Rpc) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(): void { for (const listener of this.listeners) listener() }
  async load(): Promise<void> {
    this.snapshot = { ...this.snapshot, loading: true, error: '' }; this.emit()
    try {
      const response = await this.rpc.call('/session-reporting', 'sessions', {})
      if (!response?.ok) throw new Error(response?.error?.message ?? '无法读取上报会话')
      this.snapshot = { ...this.snapshot, sessions: response.value as Session[], loading: false }
    } catch (error) { this.snapshot = { ...this.snapshot, loading: false, error: error instanceof Error ? error.message : String(error) } }
    this.emit()
  }
  async openSession(id: string): Promise<void> {
    if (this.snapshot.events[id] !== undefined) return
    try {
      const response = await this.rpc.call('/session-reporting', 'events', { sessionId: id })
      if (!response?.ok) throw new Error(response?.error?.message ?? '无法读取事件')
      this.snapshot = { ...this.snapshot, events: { ...this.snapshot.events, [id]: response.value as EventRow[] } }
      this.emit()
    } catch (error) { this.snapshot = { ...this.snapshot, error: error instanceof Error ? error.message : String(error) }; this.emit() }
  }
  setOpen(open: boolean): void { this.snapshot = { ...this.snapshot, open }; this.emit(); if (open) void this.load() }
}

function SessionReportingButton({ store, wide }: { store: Store; wide: boolean }): any {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  void wide
  return createElement('button', { type: 'button', className: 'dsh-sr-button', title: 'Session 上报', 'aria-label': 'Session 上报', 'aria-expanded': state.open, onClick: () => store.setOpen(!state.open) }, createElement(Database, { size: 18 }))
}

function SessionReportingDrawer({ store }: { store: Store }): any {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [expanded, setExpanded] = useState<string>()
  useEffect(() => { if (expanded) void store.openSession(expanded) }, [expanded])
  if (!state.open) return null
  return createElement('div', { className: 'dsh-sr-overlay', onPointerDown: (event: any) => { if (event.target === event.currentTarget) store.setOpen(false) } }, createElement('aside', { className: 'dsh-sr-drawer', role: 'dialog', 'aria-label': 'Session 上报' },
    createElement('header', { className: 'dsh-sr-header' }, createElement('div', null, createElement(Database, { size: 18 }), createElement('strong', null, 'Session 上报')), createElement('button', { type: 'button', title: '关闭', 'aria-label': '关闭', onClick: () => store.setOpen(false) }, createElement(X, { size: 18 }))),
    state.error ? createElement('div', { className: 'dsh-sr-error' }, state.error) : null,
    state.loading ? createElement('div', { className: 'dsh-sr-empty' }, '加载中…') : state.sessions.length === 0 ? createElement('div', { className: 'dsh-sr-empty' }, '暂无上报会话') : createElement('div', { className: 'dsh-sr-list' }, state.sessions.map(session => createElement('section', { key: session.id, className: 'dsh-sr-session' },
      createElement('button', { type: 'button', className: 'dsh-sr-session-row', onClick: () => setExpanded(expanded === session.id ? undefined : session.id) }, createElement(ChevronRight, { size: 15, className: expanded === session.id ? 'dsh-sr-open' : undefined }), createElement('div', null, createElement('strong', null, session.id), createElement('small', null, `${session.canonical_remote} · ${session.event_count} events`))),
      expanded === session.id ? createElement('div', { className: 'dsh-sr-events' }, (state.events[session.id] ?? []).map(event => createElement('div', { key: event.seq, className: 'dsh-sr-event' }, createElement('code', null, `${event.seq} · ${event.type}`), createElement('pre', null, event.event)))) : null))),
  ))
}

const STYLES = `.dsh-sr-button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#555);cursor:pointer;font:inherit}.dsh-sr-button:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.05))}.dsh-sr-overlay{position:absolute;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.18)}.dsh-sr-drawer{width:min(560px,calc(100vw - 24px));height:100%;overflow:hidden;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,#fff);border-left:1px solid #ddd}.dsh-sr-header{display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #ddd}.dsh-sr-header>div{display:flex;gap:8px;align-items:center}.dsh-sr-header button{border:0;background:transparent;cursor:pointer}.dsh-sr-list{overflow:auto}.dsh-sr-session{border-bottom:1px solid #eee}.dsh-sr-session-row{display:flex;align-items:flex-start;gap:8px;width:100%;padding:13px 16px;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}.dsh-sr-session-row div{min-width:0}.dsh-sr-session-row strong,.dsh-sr-session-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-sr-session-row small{margin-top:4px;color:#777}.dsh-sr-open{transform:rotate(90deg)}.dsh-sr-events{padding:0 16px 12px 38px}.dsh-sr-event{padding:8px 0;border-top:1px solid #eee}.dsh-sr-event code{font-size:11px;color:#555}.dsh-sr-event pre{max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px}.dsh-sr-empty,.dsh-sr-error{padding:32px;text-align:center}.dsh-sr-error{color:#b42318}`

export const inject = ['slots', 'connection']
export function apply(ctx: ClientContext): void {
  const rpc = (ctx as any).get('connection')?.rpc as Rpc
  if (!rpc) throw new Error('dsh-session-reporting: connection RPC unavailable')
  const store = new Store(rpc)
  ctx.effect(() => { const style = document.createElement('style'); style.textContent = STYLES; document.head.append(style); return () => style.remove() }, 'dsh-session-reporting: styles')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'session-reporting', order: 25 }, ({ wide }: { wide: boolean }) => createElement(SessionReportingButton, { store, wide })))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'session-reporting', order: 25 }, () => createElement(SessionReportingDrawer, { store })))
}
