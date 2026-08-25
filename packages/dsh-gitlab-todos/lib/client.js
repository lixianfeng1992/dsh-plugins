window.__ModuleLoader__.load({
  id: "dsh-gitlab-todos",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/shared/src/utils.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const mergeClasses = (...classes) => classes.filter((className, index, array) => {
    	return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
    }).join(" ").trim();
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/defaultAttributes.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    var defaultAttributes = {
    	xmlns: "http://www.w3.org/2000/svg",
    	width: 24,
    	height: 24,
    	viewBox: "0 0 24 24",
    	fill: "none",
    	stroke: "currentColor",
    	strokeWidth: 2,
    	strokeLinecap: "round",
    	strokeLinejoin: "round"
    };
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/Icon.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const Icon = (0, react.forwardRef)(({ color = "currentColor", size = 24, strokeWidth = 2, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
    	return (0, react.createElement)("svg", {
    		ref,
    		...defaultAttributes,
    		width: size,
    		height: size,
    		stroke: color,
    		strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
    		className: mergeClasses("lucide", className),
    		...rest
    	}, [...iconNode.map(([tag, attrs]) => (0, react.createElement)(tag, attrs)), ...Array.isArray(children) ? children : [children]]);
    });
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/createLucideIcon.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const createLucideIcon = (iconName, iconNode) => {
    	const Component = (0, react.forwardRef)(({ className, ...props }, ref) => (0, react.createElement)(Icon, {
    		ref,
    		iconNode,
    		className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
    		...props
    	}));
    	Component.displayName = `${iconName}`;
    	return Component;
    };
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/external-link.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const ExternalLink = createLucideIcon("ExternalLink", [
    	["path", {
    		d: "M15 3h6v6",
    		key: "1q9fwt"
    	}],
    	["path", {
    		d: "M10 14 21 3",
    		key: "gplh6r"
    	}],
    	["path", {
    		d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
    		key: "a6xqqp"
    	}]
    ]);
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/list-todo.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const ListTodo = createLucideIcon("ListTodo", [
    	["rect", {
    		x: "3",
    		y: "5",
    		width: "6",
    		height: "6",
    		rx: "1",
    		key: "1defrl"
    	}],
    	["path", {
    		d: "m3 17 2 2 4-4",
    		key: "1jhpwq"
    	}],
    	["path", {
    		d: "M13 6h8",
    		key: "15sg57"
    	}],
    	["path", {
    		d: "M13 12h8",
    		key: "h98zly"
    	}],
    	["path", {
    		d: "M13 18h8",
    		key: "oe0vm4"
    	}]
    ]);
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/refresh-cw.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const RefreshCw = createLucideIcon("RefreshCw", [
    	["path", {
    		d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    		key: "v9h5vc"
    	}],
    	["path", {
    		d: "M21 3v5h-5",
    		key: "1q7to0"
    	}],
    	["path", {
    		d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    		key: "3uifl3"
    	}],
    	["path", {
    		d: "M8 16H3v5",
    		key: "1cv678"
    	}]
    ]);
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/trash-2.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const Trash2 = createLucideIcon("Trash2", [
    	["path", {
    		d: "M3 6h18",
    		key: "d0wm0j"
    	}],
    	["path", {
    		d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
    		key: "4alrt4"
    	}],
    	["path", {
    		d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
    		key: "v07s0e"
    	}],
    	["line", {
    		x1: "10",
    		x2: "10",
    		y1: "11",
    		y2: "17",
    		key: "1uufr5"
    	}],
    	["line", {
    		x1: "14",
    		x2: "14",
    		y1: "11",
    		y2: "17",
    		key: "xtxkd"
    	}]
    ]);
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/x.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const X = createLucideIcon("X", [["path", {
    	d: "M18 6 6 18",
    	key: "1bl5f8"
    }], ["path", {
    	d: "m6 6 12 12",
    	key: "d8bk6v"
    }]]);
    //#endregion
    //#region src/client/index.ts
    const SETTINGS_NAMESPACE = "gitlab-todos";
    var TodoStore = class {
    	rpc;
    	state = {
    		status: "idle",
    		todos: [],
    		revision: 0
    	};
    	snapshot = {
    		...this.state,
    		open: false
    	};
    	listeners = /* @__PURE__ */ new Set();
    	polling;
    	loading;
    	open = false;
    	constructor(rpc) {
    		this.rpc = rpc;
    	}
    	getSnapshot = () => this.snapshot;
    	subscribe = (listener) => {
    		this.listeners.add(listener);
    		return () => {
    			this.listeners.delete(listener);
    		};
    	};
    	start() {
    		this.load("state");
    		this.polling = setInterval(() => {
    			this.load("state");
    		}, 15e3);
    	}
    	dispose() {
    		if (this.polling !== void 0) clearInterval(this.polling);
    	}
    	setOpen(open) {
    		this.open = open;
    		this.emit();
    		if (open) this.load("state");
    	}
    	async refresh() {
    		this.markSyncing();
    		const current = this.loading;
    		if (current !== void 0) await current;
    		this.markSyncing();
    		await this.load("refresh");
    	}
    	load(endpoint) {
    		if (this.loading !== void 0) return this.loading;
    		const task = this.rpc.call("/gitlab-todos", endpoint, {}).then((response) => {
    			if (!response?.ok) throw new Error(response?.error?.message ?? "无法读取 GitLab Todo");
    			this.state = response.value;
    			this.emit();
    		}).catch((error) => {
    			this.state = {
    				...this.state,
    				status: "error",
    				error: error instanceof Error ? error.message : String(error)
    			};
    			this.emit();
    		}).finally(() => {
    			if (this.loading === task) this.loading = void 0;
    		});
    		this.loading = task;
    		return task;
    	}
    	emit() {
    		this.snapshot = {
    			...this.state,
    			open: this.open
    		};
    		for (const listener of this.listeners) listener();
    	}
    	markSyncing() {
    		this.state = {
    			...this.state,
    			status: "syncing",
    			error: void 0
    		};
    		this.emit();
    	}
    };
    function useTodoStore(store) {
    	return (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
    }
    function GitLabTodoButton({ store, wide }) {
    	const state = useTodoStore(store);
    	const label = `GitLab Todo${state.todos.length > 0 ? ` (${state.todos.length})` : ""}`;
    	return (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-gl-sidebar-button",
    		title: label,
    		"aria-label": label,
    		"aria-expanded": state.open,
    		onClick: () => {
    			store.setOpen(!state.open);
    		}
    	}, (0, react.createElement)(ListTodo, {
    		size: wide ? 16 : 19,
    		"aria-hidden": true
    	}), wide ? (0, react.createElement)("span", { className: "dsh-gl-sidebar-label" }, "GitLab Todo") : null, state.todos.length > 0 ? (0, react.createElement)("span", { className: "dsh-gl-count" }, state.todos.length > 99 ? "99+" : String(state.todos.length)) : null);
    }
    function formatTime(value) {
    	const date = new Date(value);
    	return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    		month: "numeric",
    		day: "numeric",
    		hour: "2-digit",
    		minute: "2-digit"
    	}).format(date);
    }
    function GitLabTodoDrawer({ store }) {
    	const state = useTodoStore(store);
    	if (!state.open) return null;
    	return (0, react.createElement)("div", {
    		className: "dsh-gl-overlay",
    		onPointerDown: (event) => {
    			if (event.target === event.currentTarget) store.setOpen(false);
    		}
    	}, (0, react.createElement)("aside", {
    		className: "dsh-gl-drawer",
    		"aria-label": "GitLab Todo",
    		role: "dialog"
    	}, (0, react.createElement)("header", { className: "dsh-gl-drawer-header" }, (0, react.createElement)("div", { className: "dsh-gl-heading" }, (0, react.createElement)(ListTodo, {
    		size: 18,
    		"aria-hidden": true
    	}), (0, react.createElement)("h2", null, "GitLab Todo"), (0, react.createElement)("span", { className: "dsh-gl-total" }, String(state.todos.length))), (0, react.createElement)("div", { className: "dsh-gl-header-actions" }, (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-gl-icon-button",
    		title: "立即同步",
    		"aria-label": "立即同步",
    		disabled: state.status === "syncing",
    		onClick: () => {
    			store.refresh();
    		}
    	}, (0, react.createElement)(RefreshCw, {
    		size: 16,
    		className: state.status === "syncing" ? "dsh-gl-spin" : void 0
    	})), (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-gl-icon-button",
    		title: "关闭",
    		"aria-label": "关闭",
    		onClick: () => {
    			store.setOpen(false);
    		}
    	}, (0, react.createElement)(X, { size: 18 })))), state.error ? (0, react.createElement)("div", {
    		className: "dsh-gl-banner",
    		role: "alert"
    	}, state.error) : null, state.status === "unconfigured" ? (0, react.createElement)("div", { className: "dsh-gl-empty" }, "请先在设置中配置 GitLab Domain 和 PAT。") : state.todos.length === 0 ? (0, react.createElement)("div", { className: "dsh-gl-empty" }, state.status === "syncing" ? "正在同步…" : "没有待处理的 Todo") : (0, react.createElement)("div", { className: "dsh-gl-list" }, state.todos.map((todo) => (0, react.createElement)("a", {
    		key: todo.id,
    		className: "dsh-gl-row",
    		href: todo.targetUrl,
    		target: "_blank",
    		rel: "noreferrer"
    	}, (0, react.createElement)("div", { className: "dsh-gl-row-top" }, (0, react.createElement)("span", { className: "dsh-gl-project" }, todo.projectName ?? todo.targetType), (0, react.createElement)("span", { className: "dsh-gl-time" }, formatTime(todo.createdAt))), (0, react.createElement)("div", { className: "dsh-gl-row-title" }, todo.targetTitle), (0, react.createElement)("div", { className: "dsh-gl-row-meta" }, (0, react.createElement)("span", null, [todo.authorName, todo.actionName].filter(Boolean).join(" · ")), (0, react.createElement)(ExternalLink, {
    		size: 14,
    		"aria-hidden": true
    	}))))), state.lastSyncedAt ? (0, react.createElement)("footer", { className: "dsh-gl-drawer-footer" }, `上次同步 ${formatTime(state.lastSyncedAt)}`) : null));
    }
    function validDomain(value) {
    	try {
    		const url = new URL(value);
    		return url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    	} catch {
    		return false;
    	}
    }
    function GitLabTodoSettings({ scope, rpc, store }) {
    	const snapshot = (0, react.useSyncExternalStore)(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
    	const persistedDomain = snapshot.value?.gitlabDomain ?? "https://gitlab.com";
    	const persistedInterval = snapshot.value?.pollIntervalSeconds ?? 60;
    	const [domain, setDomain] = (0, react.useState)(persistedDomain);
    	const [interval, setIntervalValue] = (0, react.useState)(String(persistedInterval));
    	const [token, setToken] = (0, react.useState)("");
    	const [tokenInfo, setTokenInfo] = (0, react.useState)();
    	const [feedback, setFeedback] = (0, react.useState)("");
    	const [saving, setSaving] = (0, react.useState)(false);
    	(0, react.useEffect)(() => {
    		setDomain(persistedDomain);
    		setIntervalValue(String(persistedInterval));
    	}, [persistedDomain, persistedInterval]);
    	(0, react.useEffect)(() => {
    		rpc.call("/gitlab-todos", "token/describe", {}).then((response) => {
    			if (response?.ok) setTokenInfo(response.value);
    		});
    	}, [rpc]);
    	const intervalNumber = Number(interval);
    	const valid = validDomain(domain.trim()) && Number.isInteger(intervalNumber) && intervalNumber >= 15 && intervalNumber <= 86400;
    	const disabled = saving || snapshot.status !== "ready" || snapshot.writable === false;
    	const save = async () => {
    		if (!valid || disabled) return;
    		setSaving(true);
    		setFeedback("");
    		try {
    			await scope.set("gitlabDomain", domain.trim().replace(/\/+$/, ""));
    			await scope.set("pollIntervalSeconds", intervalNumber);
    			if (token.trim()) {
    				const response = await rpc.call("/gitlab-todos", "token/set", { token: token.trim() });
    				if (!response?.ok) throw new Error(response?.error?.message ?? "PAT 保存失败");
    				setToken("");
    			} else await store.refresh();
    			const described = await rpc.call("/gitlab-todos", "token/describe", {});
    			if (described?.ok) setTokenInfo(described.value);
    			setFeedback("已保存并同步");
    		} catch (error) {
    			setFeedback(error instanceof Error ? error.message : "保存失败");
    		} finally {
    			setSaving(false);
    		}
    	};
    	const removeToken = async () => {
    		setSaving(true);
    		try {
    			const response = await rpc.call("/gitlab-todos", "token/unset", {});
    			if (!response?.ok) throw new Error(response?.error?.message ?? "PAT 删除失败");
    			const described = await rpc.call("/gitlab-todos", "token/describe", {});
    			if (described?.ok) setTokenInfo(described.value);
    			setToken("");
    			setFeedback("PAT 已删除");
    		} catch (error) {
    			setFeedback(error instanceof Error ? error.message : "PAT 删除失败");
    		} finally {
    			setSaving(false);
    		}
    	};
    	return (0, react.createElement)("section", { className: "dsh-gl-settings" }, (0, react.createElement)("h2", null, "GitLab Todo"), (0, react.createElement)("form", { onSubmit: (event) => {
    		event.preventDefault();
    		save();
    	} }, (0, react.createElement)("label", { htmlFor: "dsh-gl-domain" }, "GitLab Domain"), (0, react.createElement)("input", {
    		id: "dsh-gl-domain",
    		type: "url",
    		value: domain,
    		disabled,
    		placeholder: "https://gitlab.com",
    		onChange: (event) => {
    			setDomain(event.currentTarget.value);
    			setFeedback("");
    		}
    	}), (0, react.createElement)("label", { htmlFor: "dsh-gl-token" }, (0, react.createElement)("span", null, "Personal Access Token"), (0, react.createElement)("span", { className: tokenInfo?.configured ? "dsh-gl-status ok" : "dsh-gl-status" }, tokenInfo?.configured ? "已配置" : "未配置")), (0, react.createElement)("div", { className: "dsh-gl-token-row" }, (0, react.createElement)("input", {
    		id: "dsh-gl-token",
    		type: "password",
    		value: token,
    		disabled,
    		autoComplete: "new-password",
    		placeholder: tokenInfo?.configured ? "输入新 PAT 以替换" : "glpat-…",
    		onChange: (event) => {
    			setToken(event.currentTarget.value);
    			setFeedback("");
    		}
    	}), tokenInfo?.configured && tokenInfo.writable ? (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-gl-delete",
    		title: "删除 PAT",
    		"aria-label": "删除 PAT",
    		disabled: saving,
    		onClick: () => {
    			removeToken();
    		}
    	}, (0, react.createElement)(Trash2, { size: 16 })) : null), (0, react.createElement)("label", { htmlFor: "dsh-gl-interval" }, "同步间隔（秒）"), (0, react.createElement)("input", {
    		id: "dsh-gl-interval",
    		type: "number",
    		min: 15,
    		max: 86400,
    		step: 1,
    		value: interval,
    		disabled,
    		onChange: (event) => {
    			setIntervalValue(event.currentTarget.value);
    			setFeedback("");
    		}
    	}), (0, react.createElement)("div", { className: "dsh-gl-settings-footer" }, (0, react.createElement)("span", { role: "status" }, feedback), (0, react.createElement)("button", {
    		type: "submit",
    		className: "dsh-gl-save",
    		disabled: disabled || !valid
    	}, saving ? "保存中…" : "保存并同步"))));
    }
    const STYLES = `
    .dsh-gl-sidebar-button{box-sizing:border-box;width:100%;min-height:36px;display:flex;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#555);font:inherit;font-size:13px;cursor:pointer;letter-spacing:0}.dsh-gl-sidebar-button:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#111)}.dsh-gl-sidebar-label{flex:1;min-width:0;text-align:left;white-space:nowrap}.dsh-gl-count,.dsh-gl-total{min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-module-platform,#e9eaec);font-size:11px;line-height:18px}.dsh-gl-overlay{position:absolute;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.18);pointer-events:auto}.dsh-gl-drawer{width:min(420px,calc(100vw - 32px));height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,#fff);border-left:1px solid var(--dsw-alias-border-l2,#ddd);box-shadow:-8px 0 24px rgba(0,0,0,.12);color:var(--dsw-alias-label-primary,#111);letter-spacing:0}.dsh-gl-drawer-header{height:56px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 18px;border-bottom:1px solid var(--dsw-alias-border-l2,#ddd)}.dsh-gl-heading,.dsh-gl-header-actions{display:flex;align-items:center;gap:8px}.dsh-gl-heading h2{margin:0;font-size:15px;line-height:1.4;font-weight:600}.dsh-gl-icon-button,.dsh-gl-delete{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.dsh-gl-icon-button:hover,.dsh-gl-delete:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.06))}.dsh-gl-icon-button:disabled{opacity:.45}.dsh-gl-list{flex:1;min-height:0;overflow:auto}.dsh-gl-row{display:block;padding:13px 18px;border-bottom:1px solid var(--dsw-alias-border-l1,#eee);color:inherit;text-decoration:none}.dsh-gl-row:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.04))}.dsh-gl-row-top,.dsh-gl-row-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.dsh-gl-project{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}.dsh-gl-time{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-row-title{margin:6px 0;font-size:13px;line-height:1.45;font-weight:500;overflow-wrap:anywhere}.dsh-gl-row-meta{font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-banner{padding:9px 18px;background:rgba(210,50,50,.1);color:var(--dsw-alias-label-error,#b42318);font-size:12px;line-height:1.4}.dsh-gl-empty{flex:1;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;color:var(--dsw-alias-label-tertiary,#888);font-size:13px}.dsh-gl-drawer-footer{flex:none;padding:8px 18px;border-top:1px solid var(--dsw-alias-border-l1,#eee);font-size:11px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-spin{animation:dsh-gl-spin 1s linear infinite}@keyframes dsh-gl-spin{to{transform:rotate(360deg)}}
    .dsh-gl-settings{max-width:720px;color:var(--dsw-alias-label-primary,#111);letter-spacing:0}.dsh-gl-settings h2{margin:0 0 16px;font-size:18px;line-height:1.4}.dsh-gl-settings form{display:flex;flex-direction:column;gap:7px}.dsh-gl-settings label{display:flex;align-items:center;justify-content:space-between;margin-top:9px;font-size:13px;font-weight:500}.dsh-gl-settings input{box-sizing:border-box;width:100%;height:36px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;background:var(--dsw-alias-bg-layer-3,#fff);color:inherit;font:inherit;font-size:13px;letter-spacing:0}.dsh-gl-settings input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}.dsh-gl-token-row{display:flex;align-items:center;gap:6px}.dsh-gl-status{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-status.ok{color:#16803a}.dsh-gl-delete{flex:none;border:1px solid var(--dsw-alias-border-l2,#ccc);color:var(--dsw-alias-label-error,#b42318)}.dsh-gl-settings-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:14px}.dsh-gl-settings-footer span{flex:1;font-size:12px;color:var(--dsw-alias-label-tertiary,#888)}.dsh-gl-save{min-height:34px;padding:0 14px;border:0;border-radius:7px;background:var(--dsw-alias-label-primary,#111);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;cursor:pointer;letter-spacing:0}.dsh-gl-save:disabled{opacity:.4;cursor:default}@media(max-width:600px){.dsh-gl-drawer{width:100%}.dsh-gl-overlay{background:transparent}}
    `;
    const inject = [
    	"slots",
    	"settingsScope",
    	"connection"
    ];
    function apply(ctx) {
    	const rpc = ctx.get("connection")?.rpc;
    	if (!rpc) throw new Error("dsh-gitlab-todos: connection RPC is unavailable");
    	const rawScope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
    	const scope = {
    		getSnapshot: () => rawScope.getSnapshot(),
    		subscribe: (listener) => rawScope.subscribe(listener),
    		set: (field, value) => rawScope.set(field, value)
    	};
    	const store = new TodoStore(rpc);
    	store.start();
    	ctx.effect(() => () => {
    		store.dispose();
    	}, "dsh-gitlab-todos: client polling");
    	ctx.effect(() => {
    		const style = document.createElement("style");
    		style.dataset.plugin = "dsh-gitlab-todos";
    		style.textContent = STYLES;
    		document.head.append(style);
    		return () => {
    			style.remove();
    		};
    	}, "dsh-gitlab-todos: styles");
    	ctx.slots.inject("settings.section", () => ctx.slots.register({
    		name: "settings.section",
    		id: "gitlab-todos",
    		order: 26,
    		label: "GitLab Todo"
    	}, () => (0, react.createElement)(GitLabTodoSettings, {
    		scope,
    		rpc,
    		store
    	})));
    	ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    		name: "sidebar.footer.action",
    		id: "gitlab-todos",
    		order: 20
    	}, ({ wide }) => (0, react.createElement)(GitLabTodoButton, {
    		store,
    		wide
    	})));
    	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    		name: "shell.overlay",
    		id: "gitlab-todos",
    		order: 20
    	}, () => (0, react.createElement)(GitLabTodoDrawer, { store })));
    }
    //#endregion
    exports.TodoStore = TodoStore;
    exports.apply = apply;
    exports.inject = inject;
    
    return module.exports;
  },
});
