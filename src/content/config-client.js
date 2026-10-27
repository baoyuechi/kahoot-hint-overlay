/*
 * 配置客户端：只拉取 public 区，永远看不到 API Key。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Config = isNode ? require("../core/config.js") : root.KC.core.Config;

  class ConfigClient {
    constructor(deps = {}) {
      this.messages = deps.messages;
      this.logger = deps.logger || { warn() {} };
      this.config = Config.merge({});
      this.listeners = new Set();
      this.unsubscribe = null;
    }

    async init() {
      try {
        const saved = await this.messages.send({ type: "kc.config.get" });
        if (saved && typeof saved === "object") this.config = Config.merge(saved);
      } catch (error) {
        this.logger.warn("读取配置失败，使用默认值", error);
      }

      this.unsubscribe = this.messages.onMessage((message) => {
        if (!message || message.type !== "kc.config.changed") return false;
        this.config = Config.merge(message.config || {});
        for (const listener of this.listeners) listener(this.config);
        return false;
      });

      return this.config;
    }

    get() {
      return this.config;
    }

    onChange(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    dispose() {
      if (typeof this.unsubscribe === "function") this.unsubscribe();
      this.listeners.clear();
    }
  }

  if (isNode) module.exports = { ConfigClient };
  else root.KC.content.ConfigClient = { ConfigClient };
})(typeof globalThis !== "undefined" ? globalThis : this);
