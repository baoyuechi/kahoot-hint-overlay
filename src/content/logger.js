/*
 * 环形日志：调试开关关闭时只入环不上控制台。
 */
(function (root) {
  "use strict";

  function stringify(value) {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  class Logger {
    constructor(getConfig) {
      this.getConfig = typeof getConfig === "function" ? getConfig : () => ({});
      this.lines = [];
      this.cap = 500;
    }

    get debug() {
      try {
        return Boolean((this.getConfig() || {}).debug);
      } catch (_error) {
        return false;
      }
    }

    push(level, args) {
      const text = args.map(stringify).join(" ");
      this.lines.push({ at: Date.now(), level, text });
      if (this.lines.length > this.cap) this.lines.shift();
    }

    log(...args) {
      this.push("log", args);
      if (this.debug) console.log("[KC]", ...args);
    }

    warn(...args) {
      this.push("warn", args);
      if (this.debug) console.warn("[KC]", ...args);
    }

    error(...args) {
      this.push("error", args);
      console.error("[KC]", ...args);
    }

    tail(count = 20) {
      return this.lines.slice(-count);
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { Logger };
  else root.KC.content.Logger = { Logger };
})(typeof globalThis !== "undefined" ? globalThis : this);
