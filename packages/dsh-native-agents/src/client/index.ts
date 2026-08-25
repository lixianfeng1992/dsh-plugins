import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type {
  ConfigurableProviderView,
  ConnectionHandle,
  IApiClient,
  ModelCatalogFailure,
  ModelProviderGroup,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

const SETTINGS_NAMESPACE = 'native-agents'

interface ProviderRow {
  provider: string
  displayName: string
  settingsPath: string[]
  enabled: boolean
  active: boolean
  modelCount: number
  error?: string
}

interface PageState {
  loading: boolean
  writable: boolean
  revision?: number
  rows: ProviderRow[]
  error?: string
}

interface NativeAgentsPageProps {
  api: IApiClient
  subscribe: (listener: () => void) => () => void
}

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }
const headerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }
const headingStyle: CSSProperties = { margin: 0, fontSize: 20, lineHeight: '28px', fontWeight: 600 }
const listStyle: CSSProperties = { border: '1px solid var(--dsw-alias-border-normal)', borderRadius: 8, overflow: 'hidden' }
const rowStyle: CSSProperties = { borderBottom: '1px solid var(--dsw-alias-border-normal)' }
const summaryStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '32px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 12,
  minHeight: 64,
  padding: '0 16px',
  cursor: 'pointer',
  listStyle: 'none',
}
const avatarStyle: CSSProperties = {
  display: 'grid',
  width: 28,
  height: 28,
  placeItems: 'center',
  border: '1px solid var(--dsw-alias-border-normal)',
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
}
const nameStyle: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }
const metaStyle: CSSProperties = { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 }
const detailStyle: CSSProperties = {
  padding: '0 16px 14px 60px',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  overflowWrap: 'anywhere',
}
const buttonStyle: CSSProperties = {
  minHeight: 32,
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-normal)',
  borderRadius: 6,
  background: 'var(--dsw-alias-bg-base)',
  color: 'var(--dsw-alias-label-primary)',
  cursor: 'pointer',
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function atPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    current = record(current)?.[segment]
  }
  return current
}

function copy(): {
  title: string
  refresh: string
  loading: string
  disabled: string
  available: string
  unavailable: string
  models: (count: number) => string
  route: string
} {
  const zh = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('zh')
  return zh
    ? {
        title: '原生 Agents', refresh: '刷新', loading: '加载中', disabled: '已禁用',
        available: '可用', unavailable: '不可用', models: count => `${String(count)} 个模型`, route: '路由',
      }
    : {
        title: 'Native Agents', refresh: 'Refresh', loading: 'Loading', disabled: 'Disabled',
        available: 'Available', unavailable: 'Unavailable', models: count => `${String(count)} models`, route: 'Route',
      }
}

function providerInitial(name: string): string {
  const first = name.trim().charAt(0).toUpperCase()
  return first.length === 0 ? 'N' : first
}

/** Generic settings page for every provider declared by the native-agent host. */
export function NativeAgentsPage({ api, subscribe }: NativeAgentsPageProps): ReactNode {
  const t = copy()
  const [state, setState] = useState<PageState>({ loading: true, writable: false, rows: [] })
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())

  const load = useCallback(async () => {
    setState(current => ({ ...current, loading: true, error: undefined }))
    try {
      const [providersResponse, modelsResponse, settingsResponse] = await Promise.all([
        api.llm.providers({}),
        api.llm.models({}),
        api.settings.describe({}),
      ])
      if (!providersResponse.result.ok) throw new Error(providersResponse.result.error.message)
      if (!modelsResponse.result.ok) throw new Error(modelsResponse.result.error.message)
      if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message)
      const namespace = settingsResponse.result.value.namespaces.find((item: { ns: string }) => item.ns === SETTINGS_NAMESPACE)
      if (namespace === undefined) throw new Error('native-agents settings namespace is unavailable')
      const groups = new Map<string, ModelProviderGroup>(modelsResponse.result.value.groups.map((group: ModelProviderGroup) => [group.id, group]))
      const failures = new Map<string, ModelCatalogFailure>(modelsResponse.result.value.failures.map((failure: ModelCatalogFailure) => [failure.id, failure]))
      const rows = providersResponse.result.value.providers
        .filter((provider: ConfigurableProviderView) => provider.settingsNs === SETTINGS_NAMESPACE)
        .map((provider: ConfigurableProviderView): ProviderRow => {
          const enabled = record(atPath(namespace.value, provider.settingsPath))?.enabled === true
          const group = groups.get(provider.provider)
          const failure = failures.get(provider.provider)
          return {
            provider: provider.provider,
            displayName: provider.displayName,
            settingsPath: provider.settingsPath,
            enabled,
            active: provider.active,
            modelCount: group?.models.length ?? 0,
            ...failure === undefined ? {} : { error: failure.message },
          }
        })
      setState({
        loading: false,
        writable: settingsResponse.result.value.writable,
        revision: namespace.revision,
        rows,
      })
    } catch (error: unknown) {
      setState(current => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [api])

  useEffect(() => {
    void load()
    return subscribe(() => { void load() })
  }, [load, subscribe])

  const toggle = useCallback(async (row: ProviderRow) => {
    setPending(current => new Set(current).add(row.provider))
    try {
      const response = await api.settings.mutate({
        ns: SETTINGS_NAMESPACE,
        ops: [{ op: 'set', path: [...row.settingsPath, 'enabled'], value: !row.enabled }],
        ...state.revision === undefined ? {} : { expectedRevision: state.revision },
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      await load()
    } catch (error: unknown) {
      setState(current => ({ ...current, error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setPending((current) => {
        const next = new Set(current)
        next.delete(row.provider)
        return next
      })
    }
  }, [api, load, state.revision])

  const rows = useMemo(() => state.rows.map((row, index) => {
    const busy = pending.has(row.provider)
    const status = !row.enabled
      ? t.disabled
      : row.error !== undefined
        ? t.unavailable
        : row.active
          ? `${t.available} · ${t.models(row.modelCount)}`
          : t.unavailable
    const color = !row.enabled
      ? 'var(--dsw-alias-label-tertiary)'
      : row.error === undefined && row.active
        ? 'var(--dsw-alias-success)'
        : 'var(--dsw-alias-error)'
    return createElement(
      'details',
      { key: row.provider, style: { ...rowStyle, ...(index === state.rows.length - 1 ? { borderBottom: 0 } : {}) } },
      createElement(
        'summary',
        { style: summaryStyle },
        createElement('span', { style: avatarStyle, 'aria-hidden': true }, providerInitial(row.displayName)),
        createElement(
          'span',
          { style: { minWidth: 0 } },
          createElement('span', { style: nameStyle }, row.displayName),
          createElement('span', { style: { ...metaStyle, display: 'block', color } }, status),
        ),
        createElement('input', {
          type: 'checkbox',
          role: 'switch',
          checked: row.enabled,
          disabled: busy || !state.writable,
          'aria-label': `${row.displayName} ${row.enabled ? t.disabled : t.available}`,
          onClick: (event: { stopPropagation(): void }) => { event.stopPropagation() },
          onChange: () => { void toggle(row) },
        }),
      ),
      createElement(
        'div',
        { style: detailStyle },
        createElement('div', null, `${t.route}: ${row.provider}`),
        row.error === undefined ? null : createElement('div', { role: 'alert', style: { color } }, row.error),
      ),
    )
  }), [pending, state.rows, state.writable, t, toggle])

  return createElement(
    'section',
    { style: sectionStyle },
    createElement(
      'div',
      { style: headerStyle },
      createElement('h2', { style: headingStyle }, t.title),
      createElement('button', { type: 'button', style: buttonStyle, disabled: state.loading, onClick: () => { void load() } }, t.refresh),
    ),
    state.error === undefined ? null : createElement('div', { role: 'alert', style: { color: 'var(--dsw-alias-error)' } }, state.error),
    createElement('div', { style: listStyle }, state.loading && rows.length === 0 ? createElement('div', { style: { padding: 16 } }, t.loading) : rows),
  )
}

export const inject = ['slots', 'connection', 'remote']

/** Register the Native Agents settings section and its pushed invalidations. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const listeners = new Set<() => void>()
  const notify = (): void => { for (const listener of listeners) listener() }
  ctx.effect(() => {
    const disposers = [
      ctx.remote.$on('llm/adapters-updated', notify),
      ctx.remote.$on('settings/document-updated', notify),
      ctx.on('connection/reset', notify),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'native-agents: settings invalidations')
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'native-agents',
    order: 15,
    label: () => copy().title,
    inject: () => ({ api: connection.api, subscribe }),
  }, NativeAgentsPage))
}
