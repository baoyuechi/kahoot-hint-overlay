/*
 * HTTP 与 URL 工具（后台专用）。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Errors = isNode ? require("../core/errors.js") : root.KC.core.Errors;
  const Config = isNode ? require("../core/config.js") : root.KC.core.Config;
  const { SolverError } = Errors;

  class Http {
    static async text(url, init = {}, timeoutMs = 20000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const body = await response.text().catch(() => "");
        return { ok: response.ok, status: response.status, statusText: response.statusText, body };
      } catch (error) {
        if (error && error.name === "AbortError") {
          throw new SolverError("timeout", { message: `${url} 请求超时` });
        }
        throw new SolverError("network", { message: error && error.message, cause: error });
      } finally {
        clearTimeout(timer);
      }
    }

    static parseJson(body, label) {
      try {
        return JSON.parse(body);
      } catch (_error) {
        throw new SolverError("parse_failed", {
          message: `${label} 返回的不是 JSON：${String(body || "").slice(0, 200)}`
        });
      }
    }

    static bearer(apiKey, withContentType = true) {
      const headers = {};
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      if (withContentType) headers["Content-Type"] = "application/json";
      return headers;
    }

    static ensureOk(response, provider) {
      if (response.ok) return;
      throw Errors.fromHttpStatus(
        response.status,
        provider,
        `${provider} HTTP ${response.status}：${String(response.body || "").slice(0, 300)}`
      );
    }
  }

  class ApiUrl {
    /**
     * 拼接 API 路径。
     * 有些服务商的 base 里已经带了版本段（例如 GLM 的 /api/paas/v4、Groq 的 /openai/v1），
     * 这种情况下不能再补一次 /v1，否则会拼出 /paas/v4/v1/chat/completions 这种 404 路径。
     */
    static joinVersion(baseUrl, version, path) {
      const base = Config.endpoint(baseUrl).replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(base)) {
        throw new SolverError("invalid_endpoint", { message: "接口地址需要以 http:// 或 https:// 开头" });
      }
      const alreadyVersioned = /\/v\d+[a-z0-9]*$/i.test(base);
      return `${alreadyVersioned ? base : `${base}/${version}`}/${String(path || "").replace(/^\/+/, "")}`;
    }
  }

  const api = { Http, ApiUrl };

  if (isNode) module.exports = api;
  else root.KC.bg.Http = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
