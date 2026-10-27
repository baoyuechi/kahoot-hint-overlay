/*
 * OpenAI 兼容 Provider（含 /v1/responses 的联网搜索分支）。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Prompt = isNode ? require("../../core/prompt.js") : root.KC.core.Prompt;
  const Errors = isNode ? require("../../core/errors.js") : root.KC.core.Errors;
  const httpModule = isNode ? require("../http.js") : root.KC.bg.Http;
  const { SolverError } = Errors;
  const { Http, ApiUrl } = httpModule;

  class OpenAiProvider {
    constructor() {
      this.id = "openai";
      this.name = "OpenAI compatible";
    }

    models(config) {
      const list = [config.openAiModel, ...(config.openAiModels || [])]
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const unique = [...new Set(list)];
      return config.openAiTryNextModel === false ? unique.slice(0, 1) : unique;
    }

    available(config) {
      return Boolean(config.openAiApiKey && config.openAiBaseUrl && this.models(config).length);
    }

    async answer(request, config, context = {}) {
      const models = this.models(config);
      if (!models.length) {
        throw new SolverError("model_not_found", { provider: this.name, message: "未配置 OpenAI 兼容模型" });
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
      const isResponses = Boolean(config.openAiWebSearch);
      const url = isResponses
        ? ApiUrl.joinVersion(config.openAiBaseUrl, "v1", "responses")
        : ApiUrl.joinVersion(config.openAiBaseUrl, "v1", "chat/completions");

      const body = isResponses
        ? {
            model,
            input: [
              { role: "developer", content: Prompt.system() },
              { role: "user", content: [{ type: "input_text", text: Prompt.user(request) }] }
            ],
            tools: [{ type: "web_search" }],
            temperature: 0,
            max_output_tokens: 400
          }
        : {
            model,
            messages: [
              { role: "system", content: Prompt.system() },
              { role: "user", content: Prompt.user(request) }
            ],
            temperature: 0,
            max_tokens: 400
          };

      const response = await Http.text(
        url,
        {
          method: "POST",
          headers: Http.bearer(config.openAiApiKey),
          body: JSON.stringify(body),
          signal
        },
        timeout
      );
      Http.ensureOk(response, this.name);
      const data = Http.parseJson(response.body, this.name);

      if (isResponses) {
        if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
        return (data.output || [])
          .filter((item) => item && item.type === "message")
          .flatMap((item) => item.content || [])
          .filter((part) => part && (part.type === "output_text" || part.type === "text"))
          .map((part) => String(part.text || ""))
          .join("\n")
          .trim();
      }

      return String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "").trim();
    }
  }

  const api = { OpenAiProvider };

  if (isNode) module.exports = api;
  else root.KC.bg.OpenAiProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
