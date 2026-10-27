/*
 * 模型目录发现（设置页用）。只在用户点击「加载模型」时触发。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Errors = isNode ? require("../core/errors.js") : root.KC.core.Errors;
  const Text = isNode ? require("../core/text.js") : root.KC.core.Text;
  const httpModule = isNode ? require("./http.js") : root.KC.bg.Http;
  const { SolverError } = Errors;
  const { Http, ApiUrl } = httpModule;

  function uniqSorted(list) {
    return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    );
  }

  class ModelCatalog {
    static async list(provider, baseUrl, apiKey) {
      if (provider === "openai") return ModelCatalog.openai(baseUrl, apiKey);
      if (provider === "gemini") return ModelCatalog.gemini(baseUrl, apiKey);
      if (provider === "anthropic") return ModelCatalog.anthropic(baseUrl, apiKey);
      throw new SolverError("model_not_found", { message: "未知的 provider" });
    }

    static async openai(baseUrl, apiKey) {
      const url = ApiUrl.joinVersion(baseUrl, "v1", "models");
      const response = await Http.text(url, { headers: Http.bearer(apiKey, false) }, 12000);
      Http.ensureOk(response, "OpenAI compatible");
      const payload = Http.parseJson(response.body, "OpenAI compatible");
      const entries = Array.isArray(payload) ? payload : payload.data || payload.models || [];
      const models = uniqSorted(entries.map((entry) => (typeof entry === "string" ? entry : entry && (entry.id || entry.name))));
      if (!models.length) throw new SolverError("model_not_found", { message: "该接口没有返回任何模型" });
      return { models, url };
    }

    static async gemini(baseUrl, apiKey) {
      const key = String(apiKey || "").trim();
      if (!key) throw new SolverError("no_api_key", { message: "请先填写 Gemini API Key" });

      const catalogUrl = ApiUrl.joinVersion(baseUrl, "v1beta", "models");
      const models = [];
      let pageToken = "";
      try {
        do {
          const url = new URL(catalogUrl);
          url.searchParams.set("key", key);
          url.searchParams.set("pageSize", "100");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const response = await Http.text(url.toString(), {}, 12000);
          Http.ensureOk(response, "Gemini compatible");
          const payload = Http.parseJson(response.body, "Gemini compatible");
          for (const entry of payload.models || []) {
            const methods = entry && entry.supportedGenerationMethods;
            if (!Array.isArray(methods) || !methods.includes("generateContent")) continue;
            const model = String(entry.name || "").replace(/^models\//, "").trim();
            if (model) models.push(model);
          }
          pageToken = String(payload.nextPageToken || "");
        } while (pageToken);
      } catch (error) {
        throw new SolverError(
          error instanceof SolverError ? error.code : "network",
          { message: Text.redact(String((error && error.message) || error), [key]) }
        );
      }
      if (!models.length) throw new SolverError("model_not_found", { message: "没有支持 generateContent 的模型" });
      return { models: uniqSorted(models), url: catalogUrl };
    }

    static async anthropic(baseUrl, apiKey) {
      const key = String(apiKey || "").trim();
      if (!key) throw new SolverError("no_api_key", { message: "请先填写 Anthropic API Key" });
      const url = ApiUrl.joinVersion(baseUrl, "v1", "models");
      const response = await Http.text(
        url,
        { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } },
        12000
      );
      Http.ensureOk(response, "Anthropic Messages compatible");
      const payload = Http.parseJson(response.body, "Anthropic Messages compatible");
      const entries = payload.data || payload.models || [];
      const models = uniqSorted(entries.map((entry) => (typeof entry === "string" ? entry : entry && (entry.id || entry.name))));
      if (!models.length) throw new SolverError("model_not_found", { message: "该接口没有返回任何模型" });
      return { models, url };
    }
  }

  const api = { ModelCatalog };

  if (isNode) module.exports = api;
  else root.KC.bg.ModelCatalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
