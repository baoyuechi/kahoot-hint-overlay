/*
 * Provider 排序与降级。解析在每次模型尝试后立即进行，解析失败会继续尝试下一个模型/Provider。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Prompt = isNode ? require("../core/prompt.js") : root.KC.core.Prompt;
  const Parser = isNode ? require("../core/answer-parser.js") : root.KC.core.AnswerParser;
  const Errors = isNode ? require("../core/errors.js") : root.KC.core.Errors;
  const { SolverError } = Errors;

  function loadProvider(id) {
    if (isNode) {
      if (id === "openai") return require("./providers/openai.js").OpenAiProvider;
      if (id === "gemini") return require("./providers/gemini.js").GeminiProvider;
      return require("./providers/anthropic.js").AnthropicProvider;
    }
    if (id === "openai") return root.KC.bg.OpenAiProvider.OpenAiProvider;
    if (id === "gemini") return root.KC.bg.GeminiProvider.GeminiProvider;
    return root.KC.bg.AnthropicProvider.AnthropicProvider;
  }

  class AiRouter {
    constructor() {
      this.providers = new Map([
        ["openai", new (loadProvider("openai"))()],
        ["gemini", new (loadProvider("gemini"))()],
        ["anthropic", new (loadProvider("anthropic"))()]
      ]);
    }

    order(config) {
      const preferred = String(config.preferredProvider || "auto").toLowerCase();
      const fallback = ["openai", "anthropic", "gemini"];
      const names = this.providers.has(preferred)
        ? [preferred, ...fallback.filter((name) => name !== preferred)]
        : fallback;
      return names
        .map((name) => this.providers.get(name))
        .filter((provider) => provider && provider.available(config));
    }

    async answer(request, config) {
      const providers = this.order(config);
      if (!providers.length) {
        throw new SolverError("no_api_key", {
          message: "没有可用的 Provider。请先在设置中填写任意一家的 Key、地址与模型。"
        });
      }

      const errors = [];
      for (const provider of providers) {
        const startedAt = Date.now();
        const parse = (rawText, model) => {
          const parsed = Parser.parse(rawText, request, {
            model,
            provider: provider.name,
            source: "ai",
            elapsedMs: Date.now() - startedAt
          });
          return parsed;
        };

        try {
          return await provider.answer(request, config, { parse });
        } catch (error) {
          const normalized = error instanceof SolverError
            ? error
            : new SolverError("network", { message: error && error.message, provider: provider.name, cause: error });
          errors.push(normalized);
        }
      }

      if (!errors.length) throw new SolverError("no_api_key");
      const retryable = errors.find((error) => error.retryable);
      const chosen = retryable || errors[0];
      throw new SolverError(chosen.code, {
        message: errors.map((error) => `${error.provider || "provider"}: ${error.message}`).join(" | "),
        retryable: chosen.retryable,
        provider: chosen.provider,
        httpStatus: chosen.httpStatus
      });
    }
  }

  const api = { AiRouter };

  if (isNode) module.exports = api;
  else root.KC.bg.AiRouter = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
