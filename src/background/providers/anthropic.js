/*
 * Anthropic Messages 兼容 Provider。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Prompt = isNode ? require("../../core/prompt.js") : root.KC.core.Prompt;
  const Errors = isNode ? require("../../core/errors.js") : root.KC.core.Errors;
  const httpModule = isNode ? require("../http.js") : root.KC.bg.Http;
  const { SolverError } = Errors;
  const { Http, ApiUrl } = httpModule;

  const API_VERSION = "2023-06-01";

  class AnthropicProvider {
    constructor() {
      this.id = "anthropic";
      this.name = "Anthropic Messages compatible";
    }

    models(config) {
      const model = String(config.anthropicModel || "").trim();
      return model ? [model] : [];
    }

    available(config) {
      return Boolean(config.anthropicApiKey && config.anthropicBaseUrl && this.models(config).length);
    }

    headers(apiKey) {
      return { "x-api-key": apiKey, "anthropic-version": API_VERSION, "Content-Type": "application/json" };
    }

    async answer(request, config, context = {}) {
      const models = this.models(config);
      if (!models.length) {
        throw new SolverError("model_not_found", { provider: this.name, message: "未配置 Anthropic 模型" });
      }

      const model = models[0];
      const rawText = await this.callModel(model, request, config, context.signal);
      const outcome = context.parse ? context.parse(rawText, model) : null;
      if (outcome && outcome.error) throw outcome.error;
      if (!outcome || !outcome.result) throw new SolverError("empty_answer", { provider: this.name });
      return outcome.result;
    }

    async callModel(model, request, config, signal) {
      const timeout = Number(config.requestTimeoutMs) || 20000;
      const url = ApiUrl.joinVersion(config.anthropicBaseUrl, "v1", "messages");

      const build = (messages) => ({
        model,
        max_tokens: 400,
        temperature: 0,
        system: Prompt.system(),
        messages,
        ...(config.anthropicWebSearch
          ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }] }
          : {})
      });

      let messages = [{ role: "user", content: [{ type: "text", text: Prompt.user(request) }] }];
      let response = await Http.text(
        url,
        { method: "POST", headers: this.headers(config.anthropicApiKey), body: JSON.stringify(build(messages)), signal },
        timeout
      );
      Http.ensureOk(response, this.name);

      let data = Http.parseJson(response.body, this.name);
      if (data.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: data.content }];
        response = await Http.text(
          url,
          { method: "POST", headers: this.headers(config.anthropicApiKey), body: JSON.stringify(build(messages)), signal },
          timeout
        );
        Http.ensureOk(response, this.name);
        data = Http.parseJson(response.body, this.name);
      }

      return (data.content || [])
        .filter((item) => item && item.type === "text")
        .map((item) => String(item.text || ""))
        .join("\n")
        .trim();
    }
  }

  const api = { AnthropicProvider };

  if (isNode) module.exports = api;
  else root.KC.bg.AnthropicProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
