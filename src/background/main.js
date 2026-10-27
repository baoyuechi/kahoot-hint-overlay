/*
 * 后台入口：消息路由 + sender 校验 + 错误统一包装。
 * 安全要点：API Key 只在本文件所在上下文可见，绝不下发给内容脚本。
 */
(function (root) {
  "use strict";

  const KC = root.KC;
  if (!KC || !KC.bg) return;

  try {
    KC.assertReady(["bg.Http", "bg.ConfigStore", "bg.AiRouter", "bg.ModelCatalog", "core.Config"]);
  } catch (error) {
    console.error(error);
    return;
  }

  const Config = KC.core.Config;
  const { SolverError } = KC.core.Errors;
  const { ConfigStore } = KC.bg.ConfigStore;
  const { AiRouter } = KC.bg.AiRouter;
  const { ModelCatalog } = KC.bg.ModelCatalog;

  const KAHOOT_URL = /^https:\/\/([a-z0-9-]+\.)*kahoot\.it\//i;
  const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;

  function getRuntime() {
    if (typeof browser !== "undefined" && browser.runtime) return browser;
    if (typeof chrome !== "undefined" && chrome.runtime) return chrome;
    return null;
  }

  const runtime = getRuntime();
  if (!runtime) return;

  const store = new ConfigStore(runtime);
  const router = new AiRouter();

  function tabUrl(sender) {
    return (sender && sender.tab && sender.tab.url) || "";
  }

  function fromGameTab(sender) {
    const url = tabUrl(sender);
    return Boolean(sender && sender.tab) && (KAHOOT_URL.test(url) || LOCAL_URL.test(url));
  }

  function fromExtensionPage(sender) {
    return Boolean(sender) && !sender.tab;
  }

  function redactSecret(secret) {
    const copy = { ...secret };
    delete copy.openAiApiKey;
    delete copy.geminiApiKey;
    delete copy.anthropicApiKey;
    return copy;
  }

  async function handleSolve(message, sender) {
    if (!fromGameTab(sender)) throw new SolverError("http_4xx", { message: "拒绝来源不明的求解请求" });
    const request = message.request;
    if (!request || typeof request.question !== "string" || !request.question.trim()) {
      throw new SolverError("empty_answer", { message: "请求缺少题干" });
    }
    const config = await store.get();
    const result = await router.answer(
      {
        question: request.question,
        options: Array.isArray(request.options) ? request.options : [],
        kind: request.kind || "single",
        optionsArePlaceholders: Boolean(request.optionsArePlaceholders)
      },
      config
    );
    return { ok: true, result };
  }

  async function handleGetConfig(sender) {
    if (!fromGameTab(sender)) throw new SolverError("http_4xx", { message: "拒绝来源不明的配置请求" });
    return store.getPublic();
  }

  async function handleUiMessage(message, sender) {
    if (!fromExtensionPage(sender)) throw new SolverError("http_4xx", { message: "该操作只允许扩展页面调用" });

    if (message.type === "kc.ui.getConfig") {
      const all = await store.get();
      const flags = await store.secretFlags();
      return {
        ok: true,
        public: Config.project(all, "public"),
        secret: redactSecret(Config.project(all, "secret")),
        flags
      };
    }

    if (message.type === "kc.ui.savePublic") {
      await store.save(Config.project(Config.clean(message.config || {}), "public"));
      const publicConfig = await store.getPublic();
      broadcast({ type: "kc.config.changed", config: publicConfig });
      return { ok: true, public: publicConfig, flags: await store.secretFlags() };
    }

    if (message.type === "kc.ui.saveSecret") {
      const incoming = Config.clean(message.config || {});
      const patch = Config.project(incoming, "secret");
      await store.save(patch);
      return { ok: true, secret: redactSecret(await store.getSecret()), flags: await store.secretFlags() };
    }

    if (message.type === "kc.ui.listModels") {
      const saved = await store.getSecret();
      const baseUrl = message.baseUrl || saved[`${message.provider === "openai" ? "openAi" : message.provider}BaseUrl`];
      const apiKey = message.apiKey || saved[`${message.provider === "openai" ? "openAi" : message.provider}ApiKey`];
      const result = await ModelCatalog.list(message.provider, baseUrl, apiKey);
      return { ok: true, models: result.models, url: result.url };
    }

    throw new SolverError("http_4xx", { message: `未知的消息类型：${message.type}` });
  }

  function broadcast(message) {
    try {
      const result = runtime.tabs.query({});
      if (!result || typeof result.then !== "function") return;
      result
        .then((tabs) => {
          for (const tab of tabs || []) {
            const url = String(tab.url || "");
            if (!/kahoot\.it|localhost|127\.0\.0\.1/.test(url)) continue;
            try {
              const sending = runtime.tabs.sendMessage(tab.id, message);
              if (sending && typeof sending.catch === "function") sending.catch(() => {});
            } catch (_error) {
              /* 忽略无内容脚本的标签页 */
            }
          }
        })
        .catch(() => {});
    } catch (_error) {
      /* 忽略 */
    }
  }

  async function route(message, sender) {
    if (!message || typeof message.type !== "string") {
      throw new SolverError("http_4xx", { message: "无效的消息" });
    }

    if (message.type === "kc.config.get") return handleGetConfig(sender);
    if (message.type === "kc.solve") return handleSolve(message, sender);
    if (message.type.startsWith("kc.ui.")) return handleUiMessage(message, sender);

    throw new SolverError("http_4xx", { message: `未知的消息类型：${message.type}` });
  }

  runtime.runtime.onMessage.addListener((message, sender, sendResponse) => {
    route(message, sender)
      .then((value) => sendResponse(value))
      .catch((error) => {
        const normalized = error instanceof SolverError
          ? error
          : new SolverError("network", { message: String((error && error.message) || error) });
        sendResponse({ ok: false, error: normalized.toJSON() });
      });
    return true;
  });

  if (runtime.runtime.onInstalled) {
    runtime.runtime.onInstalled.addListener(() => {
      store.installDefaults().catch((error) => console.error("[KC] 初始化默认配置失败", error));
    });
  }

  console.info("[KC] background ready");
})(typeof globalThis !== "undefined" ? globalThis : this);
