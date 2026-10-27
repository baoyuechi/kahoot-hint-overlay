/*
 * 去重闸门：同一个 dedupeKey 只允许一次在飞请求，冷却窗口内不再重算。
 * 冷却只作用于同一个 key，不阻塞下一题。
 */
(function (root) {
  "use strict";

  class DedupeGuard {
    constructor(options = {}) {
      this.cooldownMs = Math.max(0, Number(options.cooldownMs) || 0);
      this.maxEntries = Math.max(1, Number(options.maxEntries) || 64);
      this.now = typeof options.now === "function" ? options.now : () => Date.now();
      this.entries = new Map();
    }

    get size() {
      return this.entries.size;
    }

    peek(key) {
      return this.entries.get(key) || null;
    }

    /**
     * @returns {{state:"admit"} | {state:"join", promise:Promise} | {state:"cooldown", at:number}}
     */
    check(key) {
      const entry = this.entries.get(key);
      if (!entry) return { state: "admit" };
      if (entry.state === "inflight") return { state: "join", promise: entry.promise };
      const age = this.now() - entry.at;
      if (age < this.cooldownMs) return { state: "cooldown", at: entry.at };
      this.entries.delete(key);
      return { state: "admit" };
    }

    /**
     * 认领一个 key，返回可在后续 settle 的 deferred。
     * deferred 永远 resolve 成 {ok, value, error}，避免未处理的 rejection。
     */
    begin(key) {
      let resolveFn = null;
      const promise = new Promise((resolve) => {
        resolveFn = resolve;
      });
      const entry = { state: "inflight", at: this.now(), promise, resolve: resolveFn };
      this.entries.delete(key);
      this.entries.set(key, entry);
      this.trim();
      return { promise, entry };
    }

    settle(key, outcome) {
      const entry = this.entries.get(key);
      if (!entry) return;
      entry.state = outcome && outcome.ok ? "done" : "failed";
      entry.at = this.now();
      if (typeof entry.resolve === "function") entry.resolve(outcome);
    }

    forget(key) {
      this.entries.delete(key);
    }

    clear() {
      this.entries.clear();
    }

    trim() {
      while (this.entries.size > this.maxEntries) {
        const oldest = this.entries.keys().next();
        if (oldest.done) return;
        this.entries.delete(oldest.value);
      }
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { DedupeGuard };
  else root.KC.core.Dedupe = { DedupeGuard };
})(typeof globalThis !== "undefined" ? globalThis : this);
