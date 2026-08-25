window.__ModuleLoader__.load({
  id: "dsh-native-agents",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
//#region src/client/index.ts
const SETTINGS_NAMESPACE = "native-agents";
const sectionStyle = {
	display: "flex",
	flexDirection: "column",
	gap: 16,
	minWidth: 0
};
const headerStyle = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: 12
};
const headingStyle = {
	margin: 0,
	fontSize: 20,
	lineHeight: "28px",
	fontWeight: 600
};
const listStyle = {
	border: "1px solid var(--dsw-alias-border-normal)",
	borderRadius: 8,
	overflow: "hidden"
};
const rowStyle = { borderBottom: "1px solid var(--dsw-alias-border-normal)" };
const summaryStyle = {
	display: "grid",
	gridTemplateColumns: "32px minmax(0, 1fr) auto",
	alignItems: "center",
	gap: 12,
	minHeight: 64,
	padding: "0 16px",
	cursor: "pointer",
	listStyle: "none"
};
const avatarStyle = {
	display: "grid",
	width: 28,
	height: 28,
	placeItems: "center",
	border: "1px solid var(--dsw-alias-border-normal)",
	borderRadius: 6,
	fontSize: 12,
	fontWeight: 600
};
const nameStyle = {
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
	fontSize: 14
};
const metaStyle = {
	color: "var(--dsw-alias-label-tertiary)",
	fontSize: 12
};
const detailStyle = {
	padding: "0 16px 14px 60px",
	color: "var(--dsw-alias-label-secondary)",
	fontSize: 12,
	overflowWrap: "anywhere"
};
const buttonStyle = {
	minHeight: 32,
	padding: "0 12px",
	border: "1px solid var(--dsw-alias-border-normal)",
	borderRadius: 6,
	background: "var(--dsw-alias-bg-base)",
	color: "var(--dsw-alias-label-primary)",
	cursor: "pointer"
};
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function atPath(value, path) {
	let current = value;
	for (const segment of path) current = record(current)?.[segment];
	return current;
}
function copy() {
	return typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh") ? {
		title: "原生 Agents",
		refresh: "刷新",
		loading: "加载中",
		disabled: "已禁用",
		available: "可用",
		unavailable: "不可用",
		models: (count) => `${String(count)} 个模型`,
		route: "路由"
	} : {
		title: "Native Agents",
		refresh: "Refresh",
		loading: "Loading",
		disabled: "Disabled",
		available: "Available",
		unavailable: "Unavailable",
		models: (count) => `${String(count)} models`,
		route: "Route"
	};
}
function providerInitial(name) {
	const first = name.trim().charAt(0).toUpperCase();
	return first.length === 0 ? "N" : first;
}
/** Generic settings page for every provider declared by the native-agent host. */
function NativeAgentsPage({ api, subscribe }) {
	const t = copy();
	const [state, setState] = (0, react.useState)({
		loading: true,
		writable: false,
		rows: []
	});
	const [pending, setPending] = (0, react.useState)(() => /* @__PURE__ */ new Set());
	const load = (0, react.useCallback)(async () => {
		setState((current) => ({
			...current,
			loading: true,
			error: void 0
		}));
		try {
			const [providersResponse, modelsResponse, settingsResponse] = await Promise.all([
				api.llm.providers({}),
				api.llm.models({}),
				api.settings.describe({})
			]);
			if (!providersResponse.result.ok) throw new Error(providersResponse.result.error.message);
			if (!modelsResponse.result.ok) throw new Error(modelsResponse.result.error.message);
			if (!settingsResponse.result.ok) throw new Error(settingsResponse.result.error.message);
			const namespace = settingsResponse.result.value.namespaces.find((item) => item.ns === SETTINGS_NAMESPACE);
			if (namespace === void 0) throw new Error("native-agents settings namespace is unavailable");
			const groups = new Map(modelsResponse.result.value.groups.map((group) => [group.id, group]));
			const failures = new Map(modelsResponse.result.value.failures.map((failure) => [failure.id, failure]));
			const rows = providersResponse.result.value.providers.filter((provider) => provider.settingsNs === SETTINGS_NAMESPACE).map((provider) => {
				const enabled = record(atPath(namespace.value, provider.settingsPath))?.enabled === true;
				const group = groups.get(provider.provider);
				const failure = failures.get(provider.provider);
				return {
					provider: provider.provider,
					displayName: provider.displayName,
					settingsPath: provider.settingsPath,
					enabled,
					active: provider.active,
					modelCount: group?.models.length ?? 0,
					...failure === void 0 ? {} : { error: failure.message }
				};
			});
			setState({
				loading: false,
				writable: settingsResponse.result.value.writable,
				revision: namespace.revision,
				rows
			});
		} catch (error) {
			setState((current) => ({
				...current,
				loading: false,
				error: error instanceof Error ? error.message : String(error)
			}));
		}
	}, [api]);
	(0, react.useEffect)(() => {
		load();
		return subscribe(() => {
			load();
		});
	}, [load, subscribe]);
	const toggle = (0, react.useCallback)(async (row) => {
		setPending((current) => new Set(current).add(row.provider));
		try {
			const response = await api.settings.mutate({
				ns: SETTINGS_NAMESPACE,
				ops: [{
					op: "set",
					path: [...row.settingsPath, "enabled"],
					value: !row.enabled
				}],
				...state.revision === void 0 ? {} : { expectedRevision: state.revision }
			});
			if (!response.result.ok) throw new Error(response.result.error.message);
			await load();
		} catch (error) {
			setState((current) => ({
				...current,
				error: error instanceof Error ? error.message : String(error)
			}));
		} finally {
			setPending((current) => {
				const next = new Set(current);
				next.delete(row.provider);
				return next;
			});
		}
	}, [
		api,
		load,
		state.revision
	]);
	const rows = (0, react.useMemo)(() => state.rows.map((row, index) => {
		const busy = pending.has(row.provider);
		const status = !row.enabled ? t.disabled : row.error !== void 0 ? t.unavailable : row.active ? `${t.available} · ${t.models(row.modelCount)}` : t.unavailable;
		const color = !row.enabled ? "var(--dsw-alias-label-tertiary)" : row.error === void 0 && row.active ? "var(--dsw-alias-success)" : "var(--dsw-alias-error)";
		return (0, react.createElement)("details", {
			key: row.provider,
			style: {
				...rowStyle,
				...index === state.rows.length - 1 ? { borderBottom: 0 } : {}
			}
		}, (0, react.createElement)("summary", { style: summaryStyle }, (0, react.createElement)("span", {
			style: avatarStyle,
			"aria-hidden": true
		}, providerInitial(row.displayName)), (0, react.createElement)("span", { style: { minWidth: 0 } }, (0, react.createElement)("span", { style: nameStyle }, row.displayName), (0, react.createElement)("span", { style: {
			...metaStyle,
			display: "block",
			color
		} }, status)), (0, react.createElement)("input", {
			type: "checkbox",
			role: "switch",
			checked: row.enabled,
			disabled: busy || !state.writable,
			"aria-label": `${row.displayName} ${row.enabled ? t.disabled : t.available}`,
			onClick: (event) => {
				event.stopPropagation();
			},
			onChange: () => {
				toggle(row);
			}
		})), (0, react.createElement)("div", { style: detailStyle }, (0, react.createElement)("div", null, `${t.route}: ${row.provider}`), row.error === void 0 ? null : (0, react.createElement)("div", {
			role: "alert",
			style: { color }
		}, row.error)));
	}), [
		pending,
		state.rows,
		state.writable,
		t,
		toggle
	]);
	return (0, react.createElement)("section", { style: sectionStyle }, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("h2", { style: headingStyle }, t.title), (0, react.createElement)("button", {
		type: "button",
		style: buttonStyle,
		disabled: state.loading,
		onClick: () => {
			load();
		}
	}, t.refresh)), state.error === void 0 ? null : (0, react.createElement)("div", {
		role: "alert",
		style: { color: "var(--dsw-alias-error)" }
	}, state.error), (0, react.createElement)("div", { style: listStyle }, state.loading && rows.length === 0 ? (0, react.createElement)("div", { style: { padding: 16 } }, t.loading) : rows));
}
const inject = [
	"slots",
	"connection",
	"remote"
];
/** Register the Native Agents settings section and its pushed invalidations. */
function apply(ctx) {
	const connection = ctx.get("connection");
	const listeners = /* @__PURE__ */ new Set();
	const notify = () => {
		for (const listener of listeners) listener();
	};
	ctx.effect(() => {
		const disposers = [
			ctx.remote.$on("llm/adapters-updated", notify),
			ctx.remote.$on("settings/document-updated", notify),
			ctx.on("connection/reset", notify)
		];
		return () => {
			for (const dispose of disposers) dispose();
		};
	}, "native-agents: settings invalidations");
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "native-agents",
		order: 15,
		label: () => copy().title,
		inject: () => ({
			api: connection.api,
			subscribe
		})
	}, NativeAgentsPage));
}
//#endregion
exports.NativeAgentsPage = NativeAgentsPage;
exports.apply = apply;
exports.inject = inject;

    return module.exports;
  },
});
