/*
 * 配置存储：public / secret 分区。public 可下发到内容脚本，secret 永不出后台。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Config = isNode ? require("../core/config.js") : root.KC.core.Config;
  const Errors = isNode ? require("../core/errors.js") : root.KC.core.Errors;

  function getRuntime() {
    if (typeof browser !== "undefined" && browser.runtime) return browser;
    if (typeof chrome !== "undefined" && chrome.runtime) return chrome;
    return null;
  }

  const ALL_KEYS = Config.PUBLIC_KEYS.concat(Config.SECRET_KEYS);

  class ConfigStore {
    constructor(runtime) {
      this.runtime = runtime || getRuntime();
    }

    storage() {
      if (!this.runtime || !this.runtime.storage || !this.runtime.storage.local) {
        throw new Errors.SolverError("network", { message: "扩展存储不可用" });
      }
      return this.runtime.storage.local;
    }

    async get() {
      const saved = await this.storage().get(ALL_KEYS);
      return Config.merge(saved || {});
    }

    async getPublic() {
      return Config.project(await this.get(), "public");
    }

    async getSecret() {
      return Config.project(await this.get(), "secret");
    }

    async save(partial) {
      const clean = Config.clean(partial || {});
      if (Object.keys(clean).length) await this.storage().set(clean);
      return this.get();
    }

    async installDefaults() {
      const current = await this.storage().get(ALL_KEYS);
      const merged = Config.merge(current || {});
      await this.storage().set(merged);
      return merged;
    }

    async secretFlags() {
      const secret = await this.getSecret();
      return {
        hasOpenAiKey: Boolean(secret.openAiApiKey),
        hasGeminiKey: Boolean(secret.geminiApiKey),
        hasAnthropicKey: Boolean(secret.anthropicApiKey)
      };
    }
  }

  if (isNode) module.exports = { ConfigStore };
  else root.KC.bg.ConfigStore = { ConfigStore };
})(typeof globalThis !== "undefined" ? globalThis : this);
