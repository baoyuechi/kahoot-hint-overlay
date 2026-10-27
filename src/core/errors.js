/*
 * 统一错误：所有 Solver 失败都以 SolverError 抛出，携带是否可重试。
 */
(function (root) {
  "use strict";

  const CODES = Object.freeze({
    no_api_key: { text: "未配置 API Key，请先在设置中填写", retryable: false },
    invalid_endpoint: { text: "接口地址无效，需要以 http:// 或 https:// 开头", retryable: false },
    model_not_found: { text: "没有可用模型，请先在设置中加载或填写模型名", retryable: false },
    http_4xx: { text: "服务端拒绝了请求（4xx），请检查 Key 与模型权限", retryable: false },
    http_5xx: { text: "服务端错误（5xx），稍后重试", retryable: true },
    rate_limited: { text: "请求过于频繁，已被限流", retryable: true },
    network: { text: "网络请求失败，请检查网络或接口地址", retryable: true },
    timeout: { text: "请求超时", retryable: true },
    parse_failed: { text: "模型返回的内容无法解析为 JSON", retryable: true },
    empty_answer: { text: "模型没有给出可用答案", retryable: true },
    aborted: { text: "请求已取消", retryable: false },
    queue_full: { text: "请求队列已满，已丢弃最旧的一题", retryable: false },
    no_adapter: { text: "当前站点没有匹配的适配器", retryable: false }
  });

  class SolverError extends Error {
    constructor(code, extra) {
      const meta = CODES[code] || { text: code, retryable: false };
      const detail = extra && extra.message ? String(extra.message) : "";
      super(detail || meta.text);
      this.name = "SolverError";
      this.code = code;
      this.retryable = extra && extra.retryable !== undefined ? Boolean(extra.retryable) : meta.retryable;
      this.provider = (extra && extra.provider) || "";
      this.httpStatus = (extra && extra.httpStatus) || null;
      this.cause = (extra && extra.cause) || null;
    }

    toJSON() {
      return { code: this.code, message: this.message, retryable: this.retryable, provider: this.provider };
    }
  }

  function fromHttpStatus(status, provider, detail) {
    if (status === 429) return new SolverError("rate_limited", { provider, httpStatus: status, message: detail });
    if (status >= 500) return new SolverError("http_5xx", { provider, httpStatus: status, message: detail });
    return new SolverError("http_4xx", { provider, httpStatus: status, message: detail });
  }

  const api = { CODES, SolverError, fromHttpStatus };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KC.core.Errors = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
