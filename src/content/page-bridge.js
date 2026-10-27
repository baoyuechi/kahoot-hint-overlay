/*
 * 内容脚本 ↔ 页面世界的通道。
 * 三重校验（source / origin / v），并在 start 之前缓冲有限帧。
 */
(function (root) {
  "use strict";

  const PAGE_SOURCE = "quiz-hint";
  const CONTENT_SOURCE = "quiz-hint-content";
  const VERSION = 1;

  class PageBridge {
    constructor(options = {}) {
      this.logger = options.logger || { log() {}, warn() {}, error() {} };
      this.origin = options.origin || (typeof location !== "undefined" ? location.origin : "");
      this.buffer = [];
      this.cap = Number(options.cap) || 32;
      this.listeners = new Set();
      this.ready = false;
      this.stopped = false;
      this.onReady = null;
      this.pingTimer = null;
      this.pingCount = 0;
      this.maxPings = Number(options.maxPings) || 8;
      this.handleMessage = (event) => this.onMessage(event);
    }

    start(options = {}) {
      if (typeof window === "undefined") return;
      window.addEventListener("message", this.handleMessage);
      if (options.onReady) this.onReady = options.onReady;
      this.ping();
      this.pingTimer = setInterval(() => this.ping(), 300 + Math.floor(Math.random() * 120));
    }

    ping() {
      if (this.stopped || this.ready) {
        this.stopPings();
        return;
      }
      if (this.pingCount >= this.maxPings) {
        this.stopPings();
        this.logger.warn("page hook 未响应 ping，可能需要降级到 DOM 读取");
        return;
      }
      this.pingCount += 1;
      try {
        window.postMessage({ source: CONTENT_SOURCE, v: VERSION, kind: "ping" }, this.origin || "*");
      } catch (_error) {
        /* 忽略 */
      }
    }

    stopPings() {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    injectScript(url) {
      if (typeof document === "undefined" || !url) return false;
      try {
        const parent = document.documentElement || document.head;
        if (!parent) return false;
        const script = document.createElement("script");
        script.src = url;
        script.async = false;
        script.onload = () => script.remove();
        script.onerror = () => {
          this.logger.warn("注入 page-hook 失败（可能被页面 CSP 拦截）");
          script.remove();
        };
        parent.appendChild(script);
        return true;
      } catch (error) {
        this.logger.warn("注入 page-hook 抛错", error);
        return false;
      }
    }

    onMessage(event) {
      if (event.source !== window) return;
      if (this.origin && this.origin !== "null" && event.origin && event.origin !== this.origin) return;
      const data = event.data;
      if (!data || data.source !== PAGE_SOURCE || data.v !== VERSION) return;

      if (data.kind === "pong" || data.kind === "ws-hook-ready") {
        this.markReady();
        return;
      }
      if (data.kind === "ws-frame" || data.kind === "ws-open") {
        this.deliver(data);
      }
    }

    markReady() {
      if (this.ready) return;
      this.ready = true;
      this.stopPings();
      this.logger.log("page hook 已就绪");
      if (typeof this.onReady === "function") this.onReady();
      this.flush();
    }

    deliver(message) {
      if (this.listeners.size) {
        for (const listener of this.listeners) {
          try {
            listener(message);
          } catch (error) {
            this.logger.error("帧处理异常", error);
          }
        }
        return;
      }
      this.buffer.push(message);
      if (this.buffer.length > this.cap) this.buffer.shift();
    }

    flush() {
      if (!this.buffer.length) return;
      const pending = this.buffer;
      this.buffer = [];
      for (const message of pending) this.deliver(message);
    }

    subscribe(listener) {
      this.listeners.add(listener);
      if (this.ready) this.flush();
      return () => this.listeners.delete(listener);
    }

    isReady() {
      return this.ready;
    }

    stop() {
      this.stopped = true;
      this.stopPings();
      this.listeners.clear();
      this.buffer = [];
      if (typeof window !== "undefined") window.removeEventListener("message", this.handleMessage);
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { PageBridge, PAGE_SOURCE, CONTENT_SOURCE, VERSION };
  else root.KC.content.PageBridge = { PageBridge, PAGE_SOURCE, CONTENT_SOURCE, VERSION };
})(typeof globalThis !== "undefined" ? globalThis : this);
