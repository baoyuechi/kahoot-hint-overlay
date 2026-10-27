/*
 * 配置模式：public 区可下发到内容脚本，secret 区只留在后台。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Text = isNode ? require("./text.js") : root.KC.core.Text;

  const PUBLIC_DEFAULTS = Object.freeze({
    enabled: true,
    autoSolve: true,
    adapterId: "auto",
    regionCode: "auto",
    cooldownMs: 8000,
    minCallIntervalMs: 500,
    queueCapacity: 4,
    solveTimeoutMs: 20000,
    retryCount: 1,
    retryBackoffMs: 700,
    domWaitMs: 800,
    overlayEnabled: true,
    overlayCorner: "bottom-right",
    overlayMaxWidth: 340,
    overlayOpacity: 0.94,
    showReason: true,
    showConfidence: true,
    showModel: false,
    placeholderNotice: true,
    mockSolver: false,
    debug: false
  });

  const SECRET_DEFAULTS = Object.freeze({
    preferredProvider: "auto",
    openAiApiKey: "",
    openAiBaseUrl: "",
    openAiModel: "",
    openAiModels: [],
    openAiTryNextModel: true,
    openAiWebSearch: false,
    geminiApiKey: "",
    geminiBaseUrl: "https://generativelanguage.googleapis.com",
    geminiModels: [],
    geminiTryNextModel: true,
    geminiWebSearch: false,
    anthropicApiKey: "",
    anthropicBaseUrl: "https://api.anthropic.com",
    anthropicModel: "",
    anthropicWebSearch: false,
    requestTimeoutMs: 20000
  });

  const PUBLIC_KEYS = Object.freeze(Object.keys(PUBLIC_DEFAULTS));
  const SECRET_KEYS = Object.freeze(Object.keys(SECRET_DEFAULTS));
  const DEFAULT_CONFIG = Object.freeze({ ...PUBLIC_DEFAULTS, ...SECRET_DEFAULTS });

  const ENUMS = {
    adapterId: ["auto", "kahoot"],
    overlayCorner: ["bottom-right", "bottom-left", "top-right", "top-left"],
    preferredProvider: ["auto", "openai", "gemini", "anthropic"]
  };

  const RANGES = {
    cooldownMs: [0, 60000],
    minCallIntervalMs: [0, 10000],
    queueCapacity: [1, 16],
    solveTimeoutMs: [1000, 60000],
    retryCount: [0, 3],
    retryBackoffMs: [0, 10000],
    domWaitMs: [0, 5000],
    overlayMaxWidth: [220, 560],
    overlayOpacity: [0.4, 1],
    requestTimeoutMs: [1000, 60000]
  };

  const MODEL_LISTS = ["openAiModels", "geminiModels"];

  function endpoint(value) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    return /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  }

  function modelList(value, fallback) {
    const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]+/);
    const seen = new Set();
    const models = raw
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .filter((model) => {
        if (seen.has(model)) return false;
        seen.add(model);
        return true;
      });
    if (models.length) return models;
    return Array.isArray(fallback) ? [] : [];
  }

  function clamp(key, value) {
    const range = RANGES[key];
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_CONFIG[key];
    return Math.min(range[1], Math.max(range[0], number));
  }

  function coerce(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) return undefined;

    if (key.endsWith("BaseUrl")) return endpoint(value);

    if (key === "regionCode") {
      const code = String(value || "auto").trim().toUpperCase();
      return /^(AUTO|OTHER|[A-Z]{2})$/.test(code) ? code : "auto";
    }

    if (ENUMS[key]) {
      const candidate = String(value || "").toLowerCase();
      return ENUMS[key].includes(candidate) ? candidate : DEFAULT_CONFIG[key];
    }

    if (MODEL_LISTS.includes(key)) return modelList(value, []);

    if (Object.prototype.hasOwnProperty.call(RANGES, key)) {
      if (typeof DEFAULT_CONFIG[key] === "boolean") return Boolean(value);
      return clamp(key, value);
    }

    if (typeof DEFAULT_CONFIG[key] === "boolean") return Boolean(value);
    if (typeof DEFAULT_CONFIG[key] === "number") {
      const number = Number(value);
      return Number.isFinite(number) && number >= 0 ? number : DEFAULT_CONFIG[key];
    }
    return String(value == null ? "" : value);
  }

  function clean(partial) {
    const out = {};
    for (const key of Object.keys(partial || {})) {
      const next = coerce(key, partial[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }

  function merge(saved) {
    return { ...DEFAULT_CONFIG, ...clean({ ...DEFAULT_CONFIG, ...(saved || {}) }) };
  }

  function project(config, scope) {
    const keys = scope === "secret" ? SECRET_KEYS : scope === "public" ? PUBLIC_KEYS : PUBLIC_KEYS.concat(SECRET_KEYS);
    const out = {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(config || {}, key)) out[key] = config[key];
    }
    return out;
  }

  function hasSecret(config) {
    const c = config || {};
    return Boolean(c.openAiApiKey || c.geminiApiKey || c.anthropicApiKey);
  }

  function secretValues(config) {
    const c = config || {};
    return [c.openAiApiKey, c.geminiApiKey, c.anthropicApiKey].map((v) => String(v || "")).filter(Boolean);
  }

  const api = {
    PUBLIC_DEFAULTS,
    SECRET_DEFAULTS,
    PUBLIC_KEYS,
    SECRET_KEYS,
    DEFAULT_CONFIG,
    endpoint,
    coerce,
    clean,
    merge,
    project,
    hasSecret,
    secretValues,
    redact: Text.redact
  };

  if (isNode) module.exports = api;
  else root.KC.core.Config = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
