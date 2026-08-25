import { createElement, useEffect, useState, useSyncExternalStore } from 'react'
import ExternalLink from 'lucide-react/dist/esm/icons/external-link.js'
import ListTodo from 'lucide-react/dist/esm/icons/list-todo.js'
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw.js'
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.js'
import X from 'lucide-react/dist/esm/icons/x.js'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

const SETTINGS_NAMESPACE = 'gitlab-todos'

interface Todo {
  id: number
  actionName: string
  targetType: string
  targetTitle: string
  targetUrl: string
  projectName?: string
  authorName?: string
  createdAt: string
}

interface TodoState {
  status: 'unconfigured' | 'idle' | 'syncing' | 'ready' | 'error'
  todos: Todo[]
  lastSyncedAt?: string
  error?: string
  revision: number
}

interface TokenInfo { configured: boolean; source?: string; writable: boolean }
interface SettingsSnapshot {
  value?: { gitlabDomain?: string; pollIntervalSeconds?: number }
  status?: string
  writable?: boolean
}
interface SettingsScope {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}
interface Rpc { call(channel: string, endpoint: string, payload: unknown): Promise<any> }

export class TodoStore {
  private state: TodoState = { status: 'idle', todos: [], revision: 0 }
  private snapshot: TodoState & { open: boolean } = { ...this.state, open: false }
  private listeners = new Set<() => void>()
  private polling?: ReturnType<typeof setInterval>
  private loading?: Promise<void>
  open = false

  constructor(private readonly rpc: Rpc) {}

  getSnapshot = (): TodoState & { open: boolean } => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  start(): void {
    void this.load('state')
    this.polling = setInterval(() => { void this.load('state') }, 15_000)
  }

  dispose(): void {
    if (this.polling !== undefined) clearInterval(this.polling)
  }

  setOpen(open: boolean): void {
    this.open = open
    this.emit()
    if (open) void this.load('state')
  }

  async refresh(): Promise<void> {
    this.markSyncing()
    const current = this.loading
    if (current !== undefined) await current
    this.markSyncing()
    await this.load('refresh')
  }

  private load(endpoint: 'state' | 'refresh'): Promise<void> {
    if (this.loading !== undefined) return this.loading
    const task = this.rpc.call('/gitlab-todos', endpoint, {}).then((response) => {
      if (!response?.ok) throw new Error(response?.error?.message ?? '无法读取 GitLab Todo')
      this.state = response.value as TodoState
      this.emit()
    }).catch((error: unknown) => {
      this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) }
      this.emit()
    }).finally(() => {
      if (this.loading === task) this.loading = undefined
    })
    this.loading = task
    return task
  }

  private emit(): void {
    this.snapshot = { ...this.state, open: this.open }
    for (const listener of this.listeners) listener()
  }

  private markSyncing(): void {
    this.state = { ...this.state, status: 'syncing', error: undefined }
    this.emit()
  }
}

function useTodoStore(store: TodoStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function GitLabTodoButton({ store, wide }: { store: TodoStore; wide: boolean }): any {
  const state = useTodoStore(store)
  const label = `GitLab Todo${state.todos.length > 0 ? ` (${state.todos.length})` : ''}`
  return createElement('button', {
    type: 'button',
    className: 'dsh-gl-sidebar-button',
    title: label,
    'aria-label': label,
    'aria-expanded': state.open,
    onClick: () => { store.setOpen(!state.open) },
  },
  createElement(ListTodo, { size: wide ? 16 : 19, 'aria-hidden': true }),
  wide ? createElement('span', { className: 'dsh-gl-sidebar-label' }, 'GitLab Todo') : null,
  state.todos.length > 0 ? createElement('span', { className: 'dsh-gl-count' }, state.todos.length > 99 ? '99+' : String(state.todos.length)) : null)
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function GitLabTodoDrawer({ store }: { store: TodoStore }): any {
  const state = useTodoStore(store)
  if (!state.open) return null
  return createElement('div', {
    className: 'dsh-gl-overlay',
    onPointerDown: (event: any) => { if (event.target === event.currentTarget) store.setOpen(false) },
  }, createElement('aside', { className: 'dsh-gl-drawer', 'aria-label': 'GitLab Todo', role: 'dialog' },
    createElement('header', { className: 'dsh-gl-drawer-header' },
      createElement('div', { className: 'dsh-gl-heading' },
        createElement(ListTodo, { size: 18, 'aria-hidden': true }),
        createElement('h2', null, 'GitLab Todo'),
        createElement('span', { className: 'dsh-gl-total' }, String(state.todos.length))),
      createElement('div', { className: 'dsh-gl-header-actions' },
        createElement('button', {
          type: 'button', className: 'dsh-gl-icon-button', title: '立即同步', 'aria-label': '立即同步',
          disabled: state.status === 'syncing', onClick: () => { void store.refresh() },
        }, createElement(RefreshCw, { size: 16, className: state.status === 'syncing' ? 'dsh-gl-spin' : undefined })),
        createElement('button', {
          type: 'button', className: 'dsh-gl-icon-button', title: '关闭', 'aria-label': '关闭',
          onClick: () => { store.setOpen(false) },
        }, createElement(X, { size: 18 })))),
    state.error ? createElement('div', { className: 'dsh-gl-banner', role: 'alert' }, state.error) : null,
    state.status === 'unconfigured'
      ? createElement('div', { className: 'dsh-gl-empty' }, '请先在设置中配置 GitLab Domain 和 PAT。')
      : state.todos.length === 0
        ? createElement('div', { className: 'dsh-gl-empty' }, state.status === 'syncing' ? '正在同步…' : '没有待处理的 Todo')
        : createElement('div', { className: 'dsh-gl-list' }, state.todos.map(todo =>
          createElement('a', {
            key: todo.id, className: 'dsh-gl-row', href: todo.targetUrl, target: '_blank', rel: 'noreferrer',
          },
          createElement('div', { className: 'dsh-gl-row-top' },
            createElement('span', { className: 'dsh-gl-project' }, todo.projectName ?? todo.targetType),
            createElement('span', { className: 'dsh-gl-time' }, formatTime(todo.createdAt))),
          createElement('div', { className: 'dsh-gl-row-title' }, todo.targetTitle),
          createElement('div', { className: 'dsh-gl-row-meta' },
            createElement('span', null, [todo.authorName, todo.actionName].filter(Boolean).join(' · ')),
            createElement(ExternalLink, { size: 14, 'aria-hidden': true }))))),
    state.lastSyncedAt ? createElement('footer', { className: 'dsh-gl-drawer-footer' }, `上次同步 ${formatTime(state.lastSyncedAt)}`) : null))
}

function validDomain(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  } catch { return false }
}

function GitLabTodoSettings({ scope, rpc, store }: { scope: SettingsScope; rpc: Rpc; store: TodoStore }): any {
  const snapshot = useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot)
  const persistedDomain = snapshot.value?.gitlabDomain ?? 'https://gitlab.com'
  const persistedInterval = snapshot.value?.pollIntervalSeconds ?? 60
  const [domain, setDomain] = useState(persistedDomain)
  const [interval, setIntervalValue] = useState(String(persistedInterval))
  const [token, setToken] = useState('')
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>()
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setDomain(persistedDomain); setIntervalValue(String(persistedInterval)) }, [persistedDomain, persistedInterval])
  useEffect(() => {
    void rpc.call('/gitlab-todos', 'token/describe', {}).then((response) => {
      if (response?.ok) setTokenInfo(response.value)
    })
  }, [rpc])

  const intervalNumber = Number(interval)
  const valid = validDomain(domain.trim()) && Number.isInteger(intervalNumber) && intervalNumber >= 15 && intervalNumber <= 86_400
  const disabled = saving || snapshot.status !== 'ready' || snapshot.writable === false
  const save = async (): Promise<void> => {
    if (!valid || disabled) return
    setSaving(true)
    setFeedback('')
    try {
      await scope.set('gitlabDomain', domain.trim().replace(/\/+$/, ''))
      await scope.set('pollIntervalSeconds', intervalNumber)
      if (token.trim()) {
        const response = await rpc.call('/gitlab-todos', 'token/set', { token: token.trim() })
        if (!response?.ok) throw new Error(response?.error?.message ?? 'PAT 保存失败')
        setToken('')
      } else {
        await store.refresh()
      }
      const described = await rpc.call('/gitlab-todos', 'token/describe', {})
      if (described?.ok) setTokenInfo(described.value)
      setFeedback('已保存并同步')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '保存失败')
    } finally { setSaving(false) }
  }

  const removeToken = async (): Promise<void> => {
    setSaving(true)
    try {
      const response = await rpc.call('/gitlab-todos', 'token/unset', {})
      if (!response?.ok) throw new Error(response?.error?.message ?? 'PAT 删除失败')
      const described = await rpc.call('/gitlab-todos', 'token/describe', {})
      if (described?.ok) setTokenInfo(described.value)
      setToken('')
      setFeedback('PAT 已删除')
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'PAT 删除失败') }
    finally { setSaving(false) }
  }

  return createElement('section', { className: 'dsh-gl-settings' },
    createElement('h2', null, 'GitLab Todo'),
    createElement('form', { onSubmit: (event: any) => { event.preventDefault(); void save() } },
      createElement('label', { htmlFor: 'dsh-gl-domain' }, 'GitLab Domain'),
      createElement('input', {
        id: 'dsh-gl-domain', type: 'url', value: domain, disabled,
        placeholder: 'https://gitlab.com',
        onChange: (event: any) => { setDomain(event.currentTarget.value); setFeedback('') },
      }),
      createElement('label', { htmlFor: 'dsh-gl-token' },
        createElement('span', null, 'Personal Access Token'),
        createElement('span', { className: tokenInfo?.configured ? 'dsh-gl-status ok' : 'dsh-gl-status' }, tokenInfo?.configured ? '已配置' : '未配置')),
      createElement('div', { className: 'dsh-gl-token-row' },
        createElement('input', {
          id: 'dsh-gl-token', type: 'password', value: token, disabled,
          autoComplete: 'new-password', placeholder: tokenInfo?.configured ? '输入新 PAT 以替换' : 'glpat-…',
          onChange: (event: any) => { setToken(event.currentTarget.value); setFeedback('') },
        }),
        tokenInfo?.configured && tokenInfo.writable ? createElement('button', {
          type: 'button', className: 'dsh-gl-delete', title: '删除 PAT', 'aria-label': '删除 PAT', disabled: saving,
          onClick: () => { void removeToken() },
        }, createElement(Trash2, { size: 16 })) : null),
      createElement('label', { htmlFor: 'dsh-gl-interval' }, '同步间隔（秒）'),
      createElement('input', {
        id: 'dsh-gl-interval', type: 'number', min: 15, max: 86400, step: 1,
        value: interval, disabled, onChange: (event: any) => { setIntervalValue(event.currentTarget.value); setFeedback('') },
      }),
      createElement('div', { className: 'dsh-gl-settings-footer' },
        createElement('span', { role: 'status' }, feedback),
        createElement('button', { type: 'submit', className: 'dsh-gl-save', disabled: disabled || !valid }, saving ? '保存中…' : '保存并同步'))))
}

const STYLES = `
.dsh-gl-sidebar-button{box-sizing:border-box;width:100%;min-height:36px;display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#555);font:inherit;font-size:13px;cursor:pointer;letter-spacing:0}.dsh-gl-sidebar-button:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}.dsh-gl-sidebar-label{flex:1;min-width:0;text-align:left;white-space:nowrap}.dsh-gl-count,.dsh-gl-total{min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-module-platform,#e9eaec);font-size:11px;line-height:18px}.dsh-gl-overlay{position:absolute;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.18);pointer-events:auto}.dsh-gl-drawer{width:min(420px,calc(100vw - 32px));height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,#fff);border-left:1px solid var(--dsw-alias-border-l2,#ddd);box-shadow:-8px 0 24px rgba(0,0,0,.12);color:var(--dsw-alias-label-primary,#111);letter-spacing:0}.dsh-gl-drawer-header{height:56px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.dsh-gl-heading,.dsh-gl-header-actions{display:flex;align-items:center;gap:8px}.dsh-gl-heading h2{margin:0;font-size:15px;line-height:1.4;font-weight:600}.dsh-gl-icon-button,.dsh-gl-delete{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.dsh-gl-icon-button:hover,.dsh-gl-delete:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.06))}.dsh-gl-icon-button:disabled{opacity:.45}.dsh-gl-list{flex:1;min-height:0;overflow:auto}.dsh-gl-row{display:block;padding:13px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,#eee);color:inherit;text-decoration:none}.dsh-gl-row:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.04))}.dsh-gl-row-top,.dsh-gl-row-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsh-gl-project{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}.dsh-gl-time{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-row-title{margin:6px 0;font-size:13px;line-height:1.45;font-weight:500;overflow-wrap:anywhere}.dsh-gl-row-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-banner{padding:9px 18px;background:rgba(210,50,50,.1);color:var(--dsw-alias-label-error,#b42318);font-size:12px;line-height:1.4}.dsh-gl-empty{flex:1;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;color:var(--dsw-alias-label-tertiary,#888);font-size:13px}.dsh-gl-drawer-footer{flex:none;padding:8px 18px;border-top:1px solid var(--dsw-alias-border-l1,#eee);font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-spin{animation:dsh-gl-spin 1s linear infinite}@keyframes dsh-gl-spin{to{transform:rotate(360deg)}}
.dsh-gl-settings{max-width:720px;color:var(--dsw-alias-label-primary,#111);letter-spacing:0}.dsh-gl-settings h2{margin:0 0 16px;font-size:18px;line-height:1.4}.dsh-gl-settings form{display:flex;flex-direction:column;gap:7px}.dsh-gl-settings label{display:flex;align-items:center;justify-content:space-between;margin-top:9px;font-size:13px;font-weight:500}.dsh-gl-settings input{box-sizing:border-box;width:100%;height:36px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;background:var(--dsw-alias-bg-layer-3,#fff);color:inherit;font:inherit;font-size:13px;letter-spacing:0}.dsh-gl-settings input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}.dsh-gl-token-row{display:flex;align-items:center;gap:6px}.dsh-gl-status{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-status.ok{color:#16803a}.dsh-gl-delete{flex:none;border:1px solid var(--dsw-alias-border-l2,#ccc);color:var(--dsw-alias-label-error,#b42318)}.dsh-gl-settings-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}.dsh-gl-settings-footer span{flex:1;font-size:12px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-save{min-height:34px;padding:0 14px;border:0;border-radius:7px;background:var(--dsw-alias-label-primary,#111);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;cursor:pointer;letter-spacing:0}.dsh-gl-save:disabled{opacity:.4;cursor:default}@media(max-width:600px){.dsh-gl-drawer{width:100%}.dsh-gl-overlay{background:transparent}}
`

export const inject = ['slots', 'settingsScope', 'connection']

export function apply(ctx: ClientContext): void {
  const rpc = (ctx as any).get('connection')?.rpc as Rpc
  if (!rpc) throw new Error('dsh-gitlab-todos: connection RPC is unavailable')
  const rawScope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }) as SettingsScope
  const scope: SettingsScope = {
    getSnapshot: () => rawScope.getSnapshot(),
    subscribe: listener => rawScope.subscribe(listener),
    set: (field, value) => rawScope.set(field, value),
  }
  const store = new TodoStore(rpc)
  store.start()
  ctx.effect(() => () => { store.dispose() }, 'dsh-gitlab-todos: client polling')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-gitlab-todos'
    style.textContent = STYLES
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-gitlab-todos: styles')
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'gitlab-todos', order: 26, label: 'GitLab Todo',
  }, () => createElement(GitLabTodoSettings, { scope, rpc, store })))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'gitlab-todos', order: 20,
  }, ({ wide }: { wide: boolean }) => createElement(GitLabTodoButton, { store, wide })))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'gitlab-todos', order: 20,
  }, () => createElement(GitLabTodoDrawer, { store })))
}
