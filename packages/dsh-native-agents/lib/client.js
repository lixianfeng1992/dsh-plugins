window.__ModuleLoader__.load({
  id: "dsh-native-agents",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    //#region src/client/index.ts
    const inject = ["slots"];
    const rowStyle = {
    	display: "flex",
    	flexDirection: "column",
    	alignItems: "flex-end",
    	gap: 6
    };
    const labelStyle = {
    	color: "var(--dsw-alias-label-tertiary)",
    	fontSize: 12,
    	lineHeight: "18px"
    };
    const bubbleStyle = {
    	maxWidth: "min(525px, 82%)",
    	padding: "10px 16px",
    	overflowWrap: "anywhere",
    	borderRadius: 18,
    	background: "var(--dsw-specific-bubble)",
    	color: "var(--dsw-alias-label-primary)",
    	fontSize: 16,
    	lineHeight: "24px",
    	whiteSpace: "pre-wrap"
    };
    const contextStyle = {
    	color: "var(--dsw-alias-label-tertiary)",
    	fontSize: 14,
    	lineHeight: "24px"
    };
    const contextBodyStyle = {
    	margin: "6px 0 0 22px",
    	padding: "8px 12px",
    	overflowWrap: "anywhere",
    	borderRadius: 6,
    	background: "var(--dsw-alias-interactive-bg-hover)",
    	color: "var(--dsw-alias-label-secondary)",
    	whiteSpace: "pre-wrap"
    };
    /** Whether a durable context source is a parent-to-child relay. */
    function isCoordinatorRelay(source) {
    	return typeof source === "object" && source !== null && "kind" in source && source.kind === "coordinator" && "form" in source && source.form === "relay";
    }
    function isChinese() {
    	return typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("zh");
    }
    function contentView(content, renderMessageImages) {
    	const text = [];
    	const images = [];
    	const other = [];
    	for (const block of content) if (block.type === "text") text.push(block.text);
    	else if (block.type === "image") images.push({ attachment: block.attachment });
    	else other.push(block);
    	return (0, react.createElement)("div", null, text.length > 0 ? text.join("") : null, images.length > 0 && renderMessageImages !== void 0 ? renderMessageImages({
    		images,
    		align: "end"
    	}) : null, other.length > 0 ? (0, react.createElement)("pre", { style: {
    		margin: text.length > 0 ? "8px 0 0" : 0,
    		whiteSpace: "pre-wrap"
    	} }, JSON.stringify(other, null, 2)) : null);
    }
    /** Coordinator relays render as parent-agent bubbles; other context remains disclosed context. */
    const NativeContextNodeView = (0, react.memo)(function NativeContextNodeView({ node, renderMessageImages }) {
    	const data = node.data;
    	const zh = isChinese();
    	if (isCoordinatorRelay(data.source)) return (0, react.createElement)("div", {
    		style: rowStyle,
    		"data-native-agent-relay": true
    	}, (0, react.createElement)("span", { style: labelStyle }, zh ? "来自父代理" : "From parent agent"), (0, react.createElement)("div", { style: bubbleStyle }, contentView(data.content, renderMessageImages)));
    	const producer = data.provenance.label === null ? "" : ` · ${data.provenance.label}`;
    	return (0, react.createElement)("details", { style: contextStyle }, (0, react.createElement)("summary", null, `${zh ? "上下文注入" : "Context injection"}${producer}`), (0, react.createElement)("div", { style: contextBodyStyle }, contentView(data.content)));
    });
    /** Install the native-agent conversation presentation. */
    function apply(ctx) {
    	ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
    		name: "conversation.chat.node",
    		key: "context",
    		priority: -100,
    		registrant: "dsh-native-agents"
    	}, NativeContextNodeView));
    }
    //#endregion
    exports.NativeContextNodeView = NativeContextNodeView;
    exports.apply = apply;
    exports.inject = inject;
    exports.isCoordinatorRelay = isCoordinatorRelay;
    
    return module.exports;
  },
});
