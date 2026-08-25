window.__ModuleLoader__.load({
  id: "dsh-session-reporting",
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
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/database.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const Database = createLucideIcon("Database", [
    	["ellipse", {
    		cx: "12",
    		cy: "5",
    		rx: "9",
    		ry: "3",
    		key: "msslwz"
    	}],
    	["path", {
    		d: "M3 5V19A9 3 0 0 0 21 19V5",
    		key: "1wlel7"
    	}],
    	["path", {
    		d: "M3 12A9 3 0 0 0 21 12",
    		key: "mv7ke4"
    	}]
    ]);
    //#endregion
    //#region ../../node_modules/.pnpm/lucide-react@0.468.0_react@18.2.0/node_modules/lucide-react/dist/esm/icons/chevron-right.js
    /**
    * @license lucide-react v0.468.0 - ISC
    *
    * This source code is licensed under the ISC license.
    * See the LICENSE file in the root directory of this source tree.
    */
    const ChevronRight = createLucideIcon("ChevronRight", [["path", {
    	d: "m9 18 6-6-6-6",
    	key: "mthhwq"
    }]]);
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
    var Store = class {
    	rpc;
    	snapshot = {
    		open: false,
    		loading: false,
    		sessions: [],
    		events: {},
    		error: ""
    	};
    	listeners = /* @__PURE__ */ new Set();
    	constructor(rpc) {
    		this.rpc = rpc;
    	}
    	getSnapshot = () => this.snapshot;
    	subscribe = (listener) => {
    		this.listeners.add(listener);
    		return () => this.listeners.delete(listener);
    	};
    	emit() {
    		for (const listener of this.listeners) listener();
    	}
    	async load() {
    		this.snapshot = {
    			...this.snapshot,
    			loading: true,
    			error: ""
    		};
    		this.emit();
    		try {
    			const response = await this.rpc.call("/session-reporting", "sessions", {});
    			if (!response?.ok) throw new Error(response?.error?.message ?? "无法读取上报会话");
    			this.snapshot = {
    				...this.snapshot,
    				sessions: response.value,
    				loading: false
    			};
    		} catch (error) {
    			this.snapshot = {
    				...this.snapshot,
    				loading: false,
    				error: error instanceof Error ? error.message : String(error)
    			};
    		}
    		this.emit();
    	}
    	async openSession(id) {
    		if (this.snapshot.events[id] !== void 0) return;
    		try {
    			const response = await this.rpc.call("/session-reporting", "events", { sessionId: id });
    			if (!response?.ok) throw new Error(response?.error?.message ?? "无法读取事件");
    			this.snapshot = {
    				...this.snapshot,
    				events: {
    					...this.snapshot.events,
    					[id]: response.value
    				}
    			};
    			this.emit();
    		} catch (error) {
    			this.snapshot = {
    				...this.snapshot,
    				error: error instanceof Error ? error.message : String(error)
    			};
    			this.emit();
    		}
    	}
    	setOpen(open) {
    		this.snapshot = {
    			...this.snapshot,
    			open
    		};
    		this.emit();
    		if (open) this.load();
    	}
    };
    function SessionReportingButton({ store, wide }) {
    	const state = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
    	return (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-sr-button",
    		title: "Session 上报",
    		"aria-label": "Session 上报",
    		"aria-expanded": state.open,
    		onClick: () => store.setOpen(!state.open)
    	}, (0, react.createElement)(Database, { size: 18 }));
    }
    function SessionReportingDrawer({ store }) {
    	const state = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
    	const [expanded, setExpanded] = (0, react.useState)();
    	(0, react.useEffect)(() => {
    		if (expanded) store.openSession(expanded);
    	}, [expanded]);
    	if (!state.open) return null;
    	return (0, react.createElement)("div", {
    		className: "dsh-sr-overlay",
    		onPointerDown: (event) => {
    			if (event.target === event.currentTarget) store.setOpen(false);
    		}
    	}, (0, react.createElement)("aside", {
    		className: "dsh-sr-drawer",
    		role: "dialog",
    		"aria-label": "Session 上报"
    	}, (0, react.createElement)("header", { className: "dsh-sr-header" }, (0, react.createElement)("div", null, (0, react.createElement)(Database, { size: 18 }), (0, react.createElement)("strong", null, "Session 上报")), (0, react.createElement)("button", {
    		type: "button",
    		title: "关闭",
    		"aria-label": "关闭",
    		onClick: () => store.setOpen(false)
    	}, (0, react.createElement)(X, { size: 18 }))), state.error ? (0, react.createElement)("div", { className: "dsh-sr-error" }, state.error) : null, state.loading ? (0, react.createElement)("div", { className: "dsh-sr-empty" }, "加载中…") : state.sessions.length === 0 ? (0, react.createElement)("div", { className: "dsh-sr-empty" }, "暂无上报会话") : (0, react.createElement)("div", { className: "dsh-sr-list" }, state.sessions.map((session) => (0, react.createElement)("section", {
    		key: session.id,
    		className: "dsh-sr-session"
    	}, (0, react.createElement)("button", {
    		type: "button",
    		className: "dsh-sr-session-row",
    		onClick: () => setExpanded(expanded === session.id ? void 0 : session.id)
    	}, (0, react.createElement)(ChevronRight, {
    		size: 15,
    		className: expanded === session.id ? "dsh-sr-open" : void 0
    	}), (0, react.createElement)("div", null, (0, react.createElement)("strong", null, session.title ?? "未命名会话"), (0, react.createElement)("small", null, `${session.origin === "subagent" ? "子代理 · " : ""}${session.canonical_remote} · ${session.event_count} events`), (0, react.createElement)("small", { className: "dsh-sr-id" }, session.id))), expanded === session.id ? (0, react.createElement)("div", { className: "dsh-sr-events" }, (state.events[session.id] ?? []).map((event) => (0, react.createElement)("div", {
    		key: event.seq,
    		className: "dsh-sr-event"
    	}, (0, react.createElement)("code", null, `${event.seq} · ${event.type}`), (0, react.createElement)("pre", null, event.event)))) : null)))));
    }
    const STYLES = `.dsh-sr-button{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#555);cursor:pointer;font:inherit}.dsh-sr-button:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,.05))}.dsh-sr-overlay{position:absolute;inset:0;display:flex;justify-content:flex-end;background:rgba(0,0,0,.18)}.dsh-sr-drawer{width:min(560px,calc(100vw - 24px));height:100%;overflow:hidden;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,#fff);border-left:1px solid #ddd}.dsh-sr-header{display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid #ddd}.dsh-sr-header>div{display:flex;gap:8px;align-items:center}.dsh-sr-header button{border:0;background:transparent;cursor:pointer}.dsh-sr-list{overflow:auto}.dsh-sr-session{border-bottom:1px solid #eee}.dsh-sr-session-row{display:flex;align-items:flex-start;gap:8px;width:100%;padding:13px 16px;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}.dsh-sr-session-row div{min-width:0}.dsh-sr-session-row strong,.dsh-sr-session-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-sr-session-row small{margin-top:4px;color:#777}.dsh-sr-open{transform:rotate(90deg)}.dsh-sr-events{padding:0 16px 12px 38px}.dsh-sr-event{padding:8px 0;border-top:1px solid #eee}.dsh-sr-event code{font-size:11px;color:#555}.dsh-sr-event pre{max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px}.dsh-sr-empty,.dsh-sr-error{padding:32px;text-align:center}.dsh-sr-error{color:#b42318}`;
    const inject = ["slots", "connection"];
    function apply(ctx) {
    	const rpc = ctx.get("connection")?.rpc;
    	if (!rpc) throw new Error("dsh-session-reporting: connection RPC unavailable");
    	const store = new Store(rpc);
    	ctx.effect(() => {
    		const style = document.createElement("style");
    		style.textContent = STYLES;
    		document.head.append(style);
    		return () => style.remove();
    	}, "dsh-session-reporting: styles");
    	ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    		name: "sidebar.footer.action",
    		id: "session-reporting",
    		order: 25
    	}, ({ wide }) => (0, react.createElement)(SessionReportingButton, {
    		store,
    		wide
    	})));
    	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    		name: "shell.overlay",
    		id: "session-reporting",
    		order: 25
    	}, () => (0, react.createElement)(SessionReportingDrawer, { store })));
    }
    //#endregion
    exports.apply = apply;
    exports.inject = inject;
    
    return module.exports;
  },
});
