/*
 * Gemini 兼容 Provider。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Prompt = isNode ? require("../../core/prompt.js") : root.KC.core.Prompt;
  const Errors = isNode ? require("../../core/errors.js") : root.KC.core.Errors;
  const httpModule = isNode ? require("../http.js") : root.KC.bg.Http;
  const { SolverError } = Errors;
  const { Http, ApiUrl } = httpModule;

  class GeminiProvider {
    constructor() {
      this.id = "gemini";
      this.name = "Gemini compatible";
    }

    models(config) {
      const list = (config.geminiModels || []).map((item) => String(item || "").trim()).filter(Boolean);
      const unique = [...new Set(list)];
      return config.geminiTryNextModel === false ? unique.slice(0, 1) : unique;
    }

    available(config) {
      return Boolean(config.geminiApiKey && this.models(config).length);
    }

    async answer(request, config, context = {}) {
      const models = this.models(config);
      if (!models.length) {
        throw new SolverError("model_not_found", {
          provider: this.name,
          message: "未加载 Gemini 模型，请先在设置中加载模型目录"
        });
      }

      const errors = [];
      for (const model of models) {
        try {
          const rawText = await this.callModel(model, request, config, context.signal);
          const outcome = context.parse ? context.parse(rawText, model) : null;
          if (outcome && outcome.error) throw outcome.error;
          if (!outcome || !outcome.result) throw new SolverError("empty_answer", { provider: this.name });
          return outcome.result;
        } catch (error) {
          const normalized = error instanceof SolverError
            ? error
            : new SolverError("network", { message: error && error.message, provider: this.name, cause: error });
          errors.push(normalized);
          if (!normalized.retryable) break;
        }
      }
      throw errors[0] || new SolverError("empty_answer", { provider: this.name });
    }

    async callModel(model, request, config, signal) {
      const timeout = Number(config.requestTimeoutMs) || 20000;
      const url = ApiUrl.joinVersion(
        config.geminiBaseUrl,
        "v1beta",
        `models/${encodeURIComponent(model)}:generateContent`
      );

      const generationConfig = { temperature: 0, maxOutputTokens: 400 };
      if (!config.geminiWebSearch) generationConfig.responseMimeType = "application/json";

      const body = {
        contents: [
          {
            parts: [{ text: `${Prompt.system()}\n\n${Prompt.user(request)}` }]
          }
        ],
        generationConfig
      };
      if (config.geminiWebSearch) body.tools = [{ google_search: {} }];

      const response = await Http.text(
        url,
        {
          method: "POST",
          headers: { "x-goog-api-key": config.geminiApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal
        },
        timeout
      );
      Http.ensureOk(response, this.name);
      const data = Http.parseJson(response.body, this.name);
      const candidate = data.candidates && data.candidates[0];
      const parts = (candidate && candidate.content && candidate.content.parts) || [];
      return parts.map((part) => String(part.text || "")).join("\n").trim();
    }
  }

  const api = { GeminiProvider };

  if (isNode) module.exports = api;
  else root.KC.bg.GeminiProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
