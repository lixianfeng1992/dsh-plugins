Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let react = require("react");
//#region src/client/index.ts
const SETTINGS_NAMESPACE = "skill-hub";
function validationError(value) {
	if (value.trim() === "") return void 0;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || !["github.com", "gitlab.com"].includes(url.hostname.toLowerCase())) return "请输入 GitHub 或 GitLab 的 HTTPS 仓库地址。";
	} catch {
		return "请输入有效的仓库地址。";
	}
}
function SkillHubSettings({ scope, rpc }) {
	const snapshot = (0, react.useSyncExternalStore)(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
	const persisted = snapshot.value?.repositoryUrl ?? "";
	const [draft, setDraft] = (0, react.useState)(persisted);
	const [saveState, setSaveState] = (0, react.useState)("idle");
	const [progress, setProgress] = (0, react.useState)("");
	const error = validationError(draft);
	const dirty = draft !== persisted;
	const disabled = snapshot.status !== "ready" || snapshot.writable === false;
	const canSave = draft.trim() !== "" && error === void 0 && !disabled && saveState !== "saving";
	(0, react.useEffect)(() => {
		setDraft(persisted);
	}, [persisted]);
	(0, react.useEffect)(() => {
		if (saveState !== "idle") setSaveState("idle");
	}, [draft]);
	const save = async () => {
		if (!canSave) return;
		setSaveState("saving");
		setProgress("正在验证仓库地址…");
		try {
			const started = await rpc.call("/skill-hub", "initialize", { repositoryUrl: draft.trim() });
			if (!started.ok) throw new Error(started.error?.message ?? "初始化失败");
			const operationId = started.value?.operationId;
			if (typeof operationId !== "string") throw new Error("初始化未返回 operationId");
			for (;;) {
				await new Promise((resolve) => setTimeout(resolve, 250));
				const response = await rpc.call("/skill-hub", "progress", { operationId });
				if (!response.ok) throw new Error(response.error?.message ?? "无法读取同步进度");
				const next = response.value;
				if (next?.message) setProgress(next.message);
				if (next?.phase === "success") {
					setProgress(`已保存：新增 ${next.result.linked}，跳过 ${next.result.skipped}，失败 ${next.result.failed}`);
					setSaveState("saved");
					break;
				}
				if (next?.phase === "error") throw new Error(`${next.stage}: ${next.message}`);
			}
		} catch {
			setSaveState("error");
			setProgress("保存失败，请重试。");
		}
	};
	return (0, react.createElement)("section", { className: "dsh-skill-hub-section" }, (0, react.createElement)("h2", { className: "dsh-skill-hub-title" }, "Skill Hub"), (0, react.createElement)("p", { className: "dsh-skill-hub-intro" }, "团队技能仓库将在 SessionStart 时同步。"), (0, react.createElement)("form", {
		className: "dsh-skill-hub-form",
		onSubmit: (event) => {
			event.preventDefault();
			save();
		}
	}, (0, react.createElement)("div", { className: "dsh-skill-hub-field" }, (0, react.createElement)("div", { className: "dsh-skill-hub-field-head" }, (0, react.createElement)("label", {
		className: "dsh-skill-hub-label",
		htmlFor: "skill-hub-repository-url"
	}, "仓库 URL"), dirty ? (0, react.createElement)("span", { className: "dsh-skill-hub-badge" }, "未保存") : null), (0, react.createElement)("input", {
		className: error === void 0 ? "dsh-skill-hub-input" : "dsh-skill-hub-input dsh-skill-hub-input-invalid",
		id: "skill-hub-repository-url",
		name: "repositoryUrl",
		type: "url",
		value: draft,
		placeholder: "https://github.com/org/skills",
		disabled,
		"aria-invalid": error === void 0 ? void 0 : true,
		"aria-describedby": error === void 0 ? "skill-hub-repository-hint" : "skill-hub-repository-error",
		onChange: (event) => {
			setDraft(event.currentTarget.value);
		}
	}), error === void 0 ? (0, react.createElement)("p", {
		className: "dsh-skill-hub-hint",
		id: "skill-hub-repository-hint"
	}, "支持 GitHub 和 GitLab HTTPS 地址。") : (0, react.createElement)("p", {
		className: "dsh-skill-hub-error",
		id: "skill-hub-repository-error",
		role: "alert"
	}, error)), (0, react.createElement)("div", { className: "dsh-skill-hub-footer" }, (0, react.createElement)("p", {
		className: "dsh-skill-hub-feedback",
		"aria-live": "polite"
	}, saveState === "saving" ? progress : saveState === "saved" ? progress : saveState === "error" ? progress : ""), (0, react.createElement)("button", {
		className: "dsh-skill-hub-save",
		type: "submit",
		disabled: !canSave
	}, saveState === "saving" ? "保存中…" : "保存"))));
}
const STYLES = `
.dsh-skill-hub-section{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary);letter-spacing:0}
.dsh-skill-hub-title{margin:0;font-size:18px;font-weight:600;line-height:1.4}
.dsh-skill-hub-intro{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsh-skill-hub-form{margin-top:2px}.dsh-skill-hub-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.dsh-skill-hub-field-head{display:flex;align-items:center;gap:8px}.dsh-skill-hub-label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5}
.dsh-skill-hub-badge{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;white-space:nowrap;font-weight:500;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.dsh-skill-hub-input{box-sizing:border-box;width:100%;height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);letter-spacing:0}
.dsh-skill-hub-input:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}.dsh-skill-hub-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.dsh-skill-hub-input-invalid{border-color:var(--dsw-alias-label-error)}
.dsh-skill-hub-hint,.dsh-skill-hub-error{margin:0;font-size:12px;line-height:1.5}.dsh-skill-hub-hint{color:var(--dsw-alias-label-tertiary)}.dsh-skill-hub-error{color:var(--dsw-alias-label-error)}
.dsh-skill-hub-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding-top:12px}.dsh-skill-hub-feedback{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dsh-skill-hub-save{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;background:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-bg-layer-3);cursor:pointer;letter-spacing:0}.dsh-skill-hub-save:disabled{opacity:.4;cursor:default}
.dsh-skill-hub-save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
`;
const inject = ["slots", "settingsScope"];
function apply(ctx) {
	const rawScope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
	const rpc = ctx.get("connection")?.rpc;
	const scope = {
		getSnapshot: () => rawScope.getSnapshot(),
		subscribe: (listener) => rawScope.subscribe(listener),
		set: (field, value) => rawScope.set(field, value)
	};
	ctx.effect(() => {
		const style = document.createElement("style");
		style.dataset.plugin = "dsh-skill-hub";
		style.textContent = STYLES;
		document.head.append(style);
		return () => {
			style.remove();
		};
	}, "dsh-skill-hub: styles");
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "skill-hub",
		order: 25,
		label: "Skill Hub"
	}, () => (0, react.createElement)(SkillHubSettings, {
		scope,
		rpc
	})));
}
//#endregion
exports.apply = apply;
exports.inject = inject;
