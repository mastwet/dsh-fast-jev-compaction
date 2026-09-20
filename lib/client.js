window.__ModuleLoader__.load({ id: "dsh-compaction-jev", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/jev/plan.ts
var DEFAULT_JEV_OPTIONS = {
  goal: "",
  keepThreshold: 0.5,
  preserveRecentMessages: 6,
  maxStateTokens: 25e3,
  maxRequestTokens: 3e4,
  truncateHeadChars: 300
};

// src/jev/protocol.ts
var SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
var DEFAULT_JEV_MODEL = "jev-latest";

// src/settings/fields.ts
var JEV_SETTINGS_NAMESPACE = "dsh-compaction-jev";
var JEV_SETTINGS_DEFAULTS = {
  enabled: false,
  apiKeyEnv: "TYPESAFE_API_KEY",
  model: DEFAULT_JEV_MODEL,
  baseUrl: SYSTEM_ONE_URL,
  timeoutMs: 6e4,
  minReductionRatio: 0.25,
  goal: "",
  keepThreshold: DEFAULT_JEV_OPTIONS.keepThreshold,
  preserveRecentMessages: DEFAULT_JEV_OPTIONS.preserveRecentMessages,
  maxStateTokens: DEFAULT_JEV_OPTIONS.maxStateTokens,
  maxRequestTokens: DEFAULT_JEV_OPTIONS.maxRequestTokens,
  truncateHeadChars: DEFAULT_JEV_OPTIONS.truncateHeadChars
};
var JEV_SETTING_FIELDS = {
  enabled: { kind: "boolean" },
  keepThreshold: { kind: "number", min: 0, max: 1, step: 0.05 },
  preserveRecentMessages: { kind: "number", min: 0, max: 100, step: 1 },
  minReductionRatio: { kind: "number", min: 0, max: 1, step: 0.05 },
  truncateHeadChars: { kind: "number", min: 0, max: 1e4, step: 50 },
  model: { kind: "string", advanced: true },
  apiKeyEnv: { kind: "string", advanced: true },
  baseUrl: { kind: "string", advanced: true },
  timeoutMs: { kind: "number", min: 1e3, step: 1e3, advanced: true },
  maxStateTokens: { kind: "number", min: 1, step: 1e3, advanced: true },
  maxRequestTokens: { kind: "number", min: 1, step: 1e3, advanced: true },
  goal: { kind: "string", advanced: true }
};
var JEV_SETTING_ORDER = Object.keys(JEV_SETTING_FIELDS);

// src/client/JevSettingsSection.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/settings/form.ts
var JEV_STAGED_FIELDS = JEV_SETTING_ORDER.filter((key) => JEV_SETTING_FIELDS[key].kind !== "boolean");
function carries(layer, field) {
  return typeof layer === "object" && layer !== null && field in layer;
}
function isOverridden(user, field) {
  return carries(user, field);
}
function draftFrom(value, user) {
  const draft = {};
  for (const field of JEV_STAGED_FIELDS) {
    const standing = carries(user, field) ? user[field] : value[field];
    draft[field] = standing === void 0 ? "" : String(standing);
  }
  return draft;
}
function issueOf(field, text) {
  const trimmed = text.trim();
  if (trimmed === "") return "empty";
  const spec = JEV_SETTING_FIELDS[field];
  if (spec.kind !== "number") return void 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "number";
  if (spec.min !== void 0 && parsed < spec.min) return "range";
  if (spec.max !== void 0 && parsed > spec.max) return "range";
  return void 0;
}
function valueOf(field, text) {
  const trimmed = text.trim();
  return JEV_SETTING_FIELDS[field].kind === "number" ? Number(trimmed) : trimmed;
}
function planWrites(draft, user, value) {
  const writes = [];
  for (const field of JEV_STAGED_FIELDS) {
    const text = draft[field] ?? "";
    if (issueOf(field, text) !== void 0) continue;
    const next = valueOf(field, text);
    const standing = carries(user, field) ? user[field] : value[field];
    if (next === standing) continue;
    writes.push({ field, value: next });
  }
  return writes;
}

// src/settings/locales.ts
var JEV_LOCALE_NAMESPACE = "settings.jev";
var en = {
  nav: "Jev compaction",
  title: "Jev compaction",
  intro: "Jev compacts by deciding which stale tool calls and results may leave the context and keeping everything else verbatim \u2014 it never summarizes. These values are read at every compaction, so a change applies to the next one.",
  enableLabel: "Enable Jev compaction",
  enableHint: "Off runs the built-in summary. Every Jev failure falls back to it as well \u2014 no credential, a transport error, an image inside the region, an unusable answer, or too little released \u2014 so an unconfigured or broken backend cannot fail a compaction.",
  stateOn: "On",
  stateOff: "Off",
  paramsTitle: "Values",
  advancedSummary: "Advanced values",
  advancedHint: "Endpoint, credential, model, token budgets, and the ongoing goal.",
  save: "Save",
  discard: "Discard changes",
  pendingHint: "Applied at the next compaction.",
  cleanHint: "No unsaved changes.",
  overridden: "Set here",
  reset: "Reset",
  loading: "Reading settings\u2026",
  unavailable: "This client cannot reach the dsh-compaction-jev namespace, so these values cannot be edited here.",
  notWritable: "This connection keeps preferences process-local, so a change is not persisted to the host.",
  invalidEmpty: "Required. Use Reset to go back to the default.",
  invalidNumber: "Enter a number.",
  invalidRange: "Enter a number between {min} and {max}.",
  invalidMin: "Enter a number of at least {min}.",
  invalidMax: "Enter a number of at most {max}.",
  enabledLabel: "Enable Jev compaction",
  enabledHint: "Off runs the built-in summary. Every Jev failure falls back to it as well, so an unconfigured or broken backend cannot fail a compaction.",
  keepThresholdLabel: "Keep threshold",
  keepThresholdHint: "Lowest keep probability that keeps a tool call or result. Lower keeps more.",
  preserveRecentMessagesLabel: "Recent messages kept",
  preserveRecentMessagesHint: "Newest messages a compaction never touches. The first message is always pinned.",
  minReductionRatioLabel: "Minimum released",
  minReductionRatioHint: "Share of the region a checkpoint must remove, or the built-in summary runs instead.",
  truncateHeadCharsLabel: "Dropped result head",
  truncateHeadCharsHint: "Characters of a dropped tool result kept before its note.",
  modelLabel: "Model",
  modelHint: "Jev model the backend asks for.",
  apiKeyEnvLabel: "Credential variable",
  apiKeyEnvHint: "Environment variable holding the TypeSafe API key. The key itself is never stored here.",
  baseUrlLabel: "Endpoint",
  baseUrlHint: "System One endpoint the backend posts to.",
  timeoutMsLabel: "Timeout (ms)",
  timeoutMsHint: "Per-request limit before the compaction falls back.",
  maxStateTokensLabel: "State budget (tokens)",
  maxStateTokensHint: "Estimated ceiling for the checkpoint state.",
  maxRequestTokensLabel: "Request budget (tokens)",
  maxRequestTokensHint: "Estimated ceiling for the state plus one batch of questions.",
  goalLabel: "Ongoing goal",
  goalHint: "Task description placed in the state. Empty uses the last three user prompts."
};
var zh = {
  nav: "Jev \u538B\u7F29",
  title: "Jev \u538B\u7F29",
  intro: "Jev \u901A\u8FC7\u5224\u65AD\u54EA\u4E9B\u9648\u65E7\u7684\u5DE5\u5177\u8C03\u7528\u4E0E\u7ED3\u679C\u53EF\u4EE5\u79BB\u5F00\u4E0A\u4E0B\u6587\u6765\u538B\u7F29,\u5176\u4F59\u5185\u5BB9\u9010\u5B57\u4FDD\u7559 \u2014\u2014 \u5B83\u4E0D\u505A\u6458\u8981\u3002\u8FD9\u4E9B\u53D6\u503C\u5728\u6BCF\u6B21\u538B\u7F29\u65F6\u8BFB\u53D6,\u6539\u52A8\u5BF9\u4E0B\u4E00\u6B21\u538B\u7F29\u751F\u6548\u3002",
  enableLabel: "\u542F\u7528 Jev \u538B\u7F29",
  enableHint: "\u5173\u95ED\u65F6\u4F7F\u7528\u5185\u7F6E\u6458\u8981\u3002Jev \u7684\u4EFB\u4F55\u5931\u8D25\u4E5F\u90FD\u4F1A\u9000\u56DE\u5185\u7F6E\u6458\u8981 \u2014\u2014 \u6CA1\u6709\u51ED\u636E\u3001\u4F20\u8F93\u9519\u8BEF\u3001\u533A\u57DF\u5185\u542B\u56FE\u7247\u3001\u56DE\u7B54\u4E0D\u53EF\u7528\u3001\u6216\u91CA\u653E\u91CF\u4E0D\u8DB3 \u2014\u2014 \u6240\u4EE5\u672A\u914D\u7F6E\u6216\u574F\u6389\u7684\u540E\u7AEF\u4E0D\u4F1A\u8BA9\u538B\u7F29\u5931\u8D25\u3002",
  stateOn: "\u5DF2\u5F00\u542F",
  stateOff: "\u5DF2\u5173\u95ED",
  paramsTitle: "\u53D6\u503C",
  advancedSummary: "\u9AD8\u7EA7\u53D6\u503C",
  advancedHint: "\u63A5\u53E3\u5730\u5740\u3001\u51ED\u636E\u3001\u6A21\u578B\u3001token \u9884\u7B97\u4E0E\u5F53\u524D\u76EE\u6807\u3002",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03\u6539\u52A8",
  pendingHint: "\u5C06\u5728\u4E0B\u4E00\u6B21\u538B\u7F29\u65F6\u751F\u6548\u3002",
  cleanHint: "\u6CA1\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8\u3002",
  overridden: "\u6B64\u5904\u5DF2\u8BBE",
  reset: "\u6062\u590D\u9ED8\u8BA4",
  loading: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026",
  unavailable: "\u8FD9\u4E2A\u5BA2\u6237\u7AEF\u8BBF\u95EE\u4E0D\u5230 dsh-compaction-jev \u547D\u540D\u7A7A\u95F4,\u65E0\u6CD5\u5728\u6B64\u4FEE\u6539\u8FD9\u4E9B\u53D6\u503C\u3002",
  notWritable: "\u5F53\u524D\u8FDE\u63A5\u628A\u504F\u597D\u4FDD\u5B58\u5728\u8FDB\u7A0B\u5185,\u6539\u52A8\u4E0D\u4F1A\u5199\u56DE\u5BBF\u4E3B\u3002",
  invalidEmpty: '\u6B64\u9879\u5FC5\u586B\u3002\u8981\u56DE\u5230\u9ED8\u8BA4\u503C\u8BF7\u70B9"\u6062\u590D\u9ED8\u8BA4"\u3002',
  invalidNumber: "\u8BF7\u8F93\u5165\u4E00\u4E2A\u6570\u5B57\u3002",
  invalidRange: "\u8BF7\u8F93\u5165 {min} \u5230 {max} \u4E4B\u95F4\u7684\u6570\u5B57\u3002",
  invalidMin: "\u8BF7\u8F93\u5165\u4E0D\u5C0F\u4E8E {min} \u7684\u6570\u5B57\u3002",
  invalidMax: "\u8BF7\u8F93\u5165\u4E0D\u5927\u4E8E {max} \u7684\u6570\u5B57\u3002",
  enabledLabel: "\u542F\u7528 Jev \u538B\u7F29",
  enabledHint: "\u5173\u95ED\u65F6\u4F7F\u7528\u5185\u7F6E\u6458\u8981\u3002Jev \u7684\u4EFB\u4F55\u5931\u8D25\u4E5F\u90FD\u4F1A\u9000\u56DE\u5185\u7F6E\u6458\u8981,\u6240\u4EE5\u672A\u914D\u7F6E\u6216\u574F\u6389\u7684\u540E\u7AEF\u4E0D\u4F1A\u8BA9\u538B\u7F29\u5931\u8D25\u3002",
  keepThresholdLabel: "\u4FDD\u7559\u9608\u503C",
  keepThresholdHint: "\u5DE5\u5177\u8C03\u7528\u6216\u7ED3\u679C\u88AB\u4FDD\u7559\u6240\u9700\u7684\u6700\u4F4E\u4FDD\u7559\u6982\u7387\u3002\u8D8A\u4F4E\u4FDD\u7559\u8D8A\u591A\u3002",
  preserveRecentMessagesLabel: "\u4FDD\u7559\u6700\u8FD1\u6D88\u606F\u6570",
  preserveRecentMessagesHint: "\u538B\u7F29\u7EDD\u4E0D\u89E6\u78B0\u7684\u6700\u65B0\u6D88\u606F\u6761\u6570\u3002\u7B2C\u4E00\u6761\u6D88\u606F\u59CB\u7EC8\u56FA\u5B9A\u4FDD\u7559\u3002",
  minReductionRatioLabel: "\u6700\u5C0F\u91CA\u653E\u6BD4\u4F8B",
  minReductionRatioHint: "\u68C0\u67E5\u70B9\u5FC5\u987B\u79FB\u9664\u7684\u533A\u57DF\u5360\u6BD4,\u5426\u5219\u6539\u7528\u5185\u7F6E\u6458\u8981\u3002",
  truncateHeadCharsLabel: "\u88AB\u4E22\u5F03\u7ED3\u679C\u4FDD\u7559\u5B57\u7B26\u6570",
  truncateHeadCharsHint: "\u88AB\u4E22\u5F03\u7684\u5DE5\u5177\u7ED3\u679C\u5728\u9644\u6CE8\u4E4B\u524D\u4FDD\u7559\u7684\u5B57\u7B26\u6570\u3002",
  modelLabel: "\u6A21\u578B",
  modelHint: "\u540E\u7AEF\u8BF7\u6C42\u7684 Jev \u6A21\u578B\u540D\u3002",
  apiKeyEnvLabel: "\u51ED\u636E\u73AF\u5883\u53D8\u91CF",
  apiKeyEnvHint: "\u5B58\u653E TypeSafe API key \u7684\u73AF\u5883\u53D8\u91CF\u540D\u3002key \u672C\u8EAB\u4E0D\u4F1A\u4FDD\u5B58\u5728\u8FD9\u91CC\u3002",
  baseUrlLabel: "\u63A5\u53E3\u5730\u5740",
  baseUrlHint: "\u540E\u7AEF\u8BF7\u6C42\u7684 System One \u63A5\u53E3\u5730\u5740\u3002",
  timeoutMsLabel: "\u8D85\u65F6(\u6BEB\u79D2)",
  timeoutMsHint: "\u5355\u6B21\u8BF7\u6C42\u7684\u4E0A\u9650,\u8D85\u8FC7\u5373\u9000\u56DE\u5185\u7F6E\u6458\u8981\u3002",
  maxStateTokensLabel: "\u72B6\u6001\u4E0A\u9650(tokens)",
  maxStateTokensHint: "\u68C0\u67E5\u70B9\u72B6\u6001\u7684\u4F30\u7B97\u4E0A\u9650\u3002",
  maxRequestTokensLabel: "\u5355\u6B21\u8BF7\u6C42\u4E0A\u9650(tokens)",
  maxRequestTokensHint: "\u72B6\u6001\u52A0\u4E00\u6279\u95EE\u9898\u5408\u8BA1\u7684\u4F30\u7B97\u4E0A\u9650\u3002",
  goalLabel: "\u5F53\u524D\u76EE\u6807",
  goalHint: "\u653E\u5165\u72B6\u6001\u7684\u4EFB\u52A1\u63CF\u8FF0\u3002\u7559\u7A7A\u5219\u4F7F\u7528\u6700\u8FD1\u4E09\u6761\u7528\u6237\u6D88\u606F\u3002"
};

// src/client/styles.ts
var RULES = {
  section: "display:flex;flex-direction:column;",
  title: "margin:0;font-size:15px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);",
  intro: "margin:6px 0 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary);",
  toggle: "display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);border-bottom:0.5px solid var(--dsw-alias-border-l2);",
  toggleText: "flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;",
  toggleLabel: "display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);",
  sectionTitle: "margin:18px 0 0;font-size:13px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary);",
  field: "display:flex;flex-direction:column;gap:6px;padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);",
  head: "display:flex;align-items:center;gap:8px;",
  label: "flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);",
  badges: "display:inline-flex;align-items:center;gap:8px;",
  reset: "border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer;",
  input: "height:34px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);",
  inputInvalid: "border-color:var(--dsw-alias-label-error);",
  hint: "margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);",
  invalid: "margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error);",
  note: "margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);",
  advanced: "margin-top:14px;",
  advancedSummary: "padding:12px 0;border-top:0.5px solid var(--dsw-alias-border-l2);cursor:pointer;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary);",
  actions: "display:flex;align-items:center;gap:8px;padding-top:16px;border-top:0.5px solid var(--dsw-alias-border-l2);",
  actionsNote: "flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);"
};
var css = Object.fromEntries(
  Object.keys(RULES).map((name) => [name, `jev-${name}`])
);
var jevStyleSheet = Object.entries(RULES).map(([name, body]) => `.jev-${name}{${body}}`).join("\n");
var JEV_STYLE_ELEMENT_ID = "dsh-compaction-jev-styles";
function ensureJevStyles(target = document) {
  if (target.getElementById(JEV_STYLE_ELEMENT_ID) !== null) return;
  const element = target.createElement("style");
  element.id = JEV_STYLE_ELEMENT_ID;
  element.textContent = jevStyleSheet;
  target.head.append(element);
}

// src/client/JevSettingsSection.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function refusalCopy(t, issue, spec) {
  if (issue === "empty") return t("invalidEmpty");
  if (issue === "number") return t("invalidNumber");
  if (spec.min !== void 0 && spec.max !== void 0) {
    return t("invalidRange", { min: spec.min, max: spec.max });
  }
  if (spec.min !== void 0) return t("invalidMin", { min: spec.min });
  return t("invalidMax", { max: spec.max });
}
function JevSettingsForm({ snapshot, settings, t, save, reset }) {
  const [draft, setDraft] = (0, import_react.useState)(() => draftFrom(settings, snapshot.user));
  const writable = snapshot.writable;
  (0, import_react.useEffect)(() => {
    setDraft(draftFrom(settings, snapshot.user));
  }, [snapshot.revision]);
  const refused = (0, import_react.useMemo)(() => {
    const found = /* @__PURE__ */ new Map();
    for (const field of JEV_STAGED_FIELDS) {
      const issue = issueOf(field, draft[field] ?? "");
      if (issue !== void 0) found.set(field, issue);
    }
    return found;
  }, [draft]);
  const writes = (0, import_react.useMemo)(() => planWrites(draft, snapshot.user, settings), [draft, snapshot.user, settings]);
  const renderField = (field) => {
    const spec = JEV_SETTING_FIELDS[field];
    const id = `jev-field-${field}`;
    const issue = refused.get(field);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.field, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.head, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: css.label, htmlFor: id, children: t(`${field}Label`) }),
        isOverridden(snapshot.user, field) ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: css.badges, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: "neutral", children: t("overridden") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              className: css.reset,
              disabled: !writable,
              onClick: () => {
                void reset(field);
              },
              children: t("reset")
            }
          )
        ] }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          id,
          className: issue === void 0 ? css.input : css.inputInvalid,
          type: "text",
          inputMode: spec.kind === "number" ? "decimal" : void 0,
          value: draft[field] ?? "",
          disabled: !writable,
          "aria-invalid": issue === void 0 ? void 0 : true,
          onChange: (event) => {
            setDraft({ ...draft, [field]: event.target.value });
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: issue === void 0 ? css.hint : css.invalid, children: issue === void 0 ? t(`${field}Hint`) : refusalCopy(t, issue, spec) })
    ] }, field);
  };
  const basic = JEV_STAGED_FIELDS.filter((field) => JEV_SETTING_FIELDS[field].advanced !== true);
  const advanced = JEV_STAGED_FIELDS.filter((field) => JEV_SETTING_FIELDS[field].advanced === true);
  const saving = writes.length > 0;
  const blocked = !writable || refused.size > 0;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: css.sectionTitle, children: t("paramsTitle") }),
    basic.map(renderField),
    advanced.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", { className: css.advanced, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { className: css.advancedSummary, children: t("advancedSummary") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.note, children: t("advancedHint") }),
      advanced.map(renderField)
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.actionsNote, children: writable ? saving ? t("pendingHint") : t("cleanHint") : t("notWritable") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          variant: "outline",
          disabled: !writable,
          onClick: () => {
            setDraft(draftFrom(settings, snapshot.user));
          },
          children: t("discard")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Button,
        {
          disabled: blocked || !saving,
          onClick: () => {
            void save(writes);
          },
          children: t("save")
        }
      )
    ] })
  ] });
}
function JevSettingsSection(props) {
  const snapshot = props.useJevSettings((sel) => sel);
  const t = props.t;
  if (snapshot.status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.note, children: t("loading") });
  const settings = snapshot.value;
  if (snapshot.status === "unavailable" || settings === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.note, children: t("unavailable") });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.section, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: css.title, children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.intro, children: t("intro") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.toggle, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css.toggleText, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: css.toggleLabel, children: [
          t("enableLabel"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.Tag, { tone: settings.enabled ? "neutral" : "quiet", children: t(settings.enabled ? "stateOn" : "stateOff") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: css.hint, children: t("enabledHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_dsh_client_ui_primitives.Switch,
        {
          checked: settings.enabled,
          label: t("enableLabel"),
          disabled: !snapshot.writable,
          onChange: (next) => {
            void props.setEnabled(next);
          }
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(JevSettingsForm, { snapshot, settings, t, save: props.save, reset: props.reset })
  ] });
}

// src/client/index.ts
var inject = ["slots", "locale", "settingsScope"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(JEV_LOCALE_NAMESPACE, { zh, en }), "dsh-compaction-jev: dictionaries");
  ensureJevStyles();
  const scope = ctx.settingsScope.bind({ namespace: JEV_SETTINGS_NAMESPACE });
  const t = ctx.locale.bind(JEV_LOCALE_NAMESPACE);
  const injected = () => ({
    hooks: { jevSettings: scope },
    // One field per write. The scope fences each with the latest namespace
    // revision and reloads host state when a write is rejected, so a refused
    // value cannot leave the page showing what the document does not hold.
    save: async (writes) => {
      for (const write of writes) await scope.set(write.field, write.value);
    },
    reset: async (field) => {
      await scope.unset(field);
    },
    setEnabled: async (enabled) => {
      await scope.set("enabled", enabled);
    }
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "jev-compaction",
    order: 10,
    label: () => t("nav"),
    locale: JEV_LOCALE_NAMESPACE,
    inject: injected
  }, JevSettingsSection));
}
return module.exports; } });
