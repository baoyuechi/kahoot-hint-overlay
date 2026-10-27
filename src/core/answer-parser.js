/*
 * 模型输出解析：文本优先。
 * 与参考实现的关键差异：不再「只要有 options 就用索引覆盖 answer_text」。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Text = isNode ? require("./text.js") : root.KC.core.Text;
  const Errors = isNode ? require("./errors.js") : root.KC.core.Errors;

  const MATCH_THRESHOLD = 0.72;
  const INDEX_KEYS = ["answer_options", "answer_indices", "option_ids", "indices", "indexes", "answer_index", "answer_id"];
  const TEXT_KEYS = ["answer_text", "answer", "answerText", "text", "response"];

  function pickIndexPayload(data) {
    for (const key of INDEX_KEYS) {
      if (data[key] !== undefined && data[key] !== null) return data[key];
    }
    return null;
  }

  function pickText(data) {
    for (const key of TEXT_KEYS) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
    }
    return "";
  }

  function cleanIds(value, request) {
    const optionCount = (request.options || []).length;
    if (!optionCount || value === null || value === undefined) return [];
    const raw = Array.isArray(value)
      ? value
      : typeof value === "number"
        ? [value]
        : String(value).split(/[,\s]+/);
    const out = [];
    for (const item of raw) {
      const index = Number.parseInt(item, 10);
      if (!Number.isFinite(index) || index < 0 || index >= optionCount) continue;
      if (!out.includes(index)) out.push(index);
    }
    if (request.kind !== "multi" && request.kind !== "order") return out.slice(0, 1);
    return out;
  }

  function bestMatch(text, options) {
    let bestId = null;
    let bestScore = 0;
    for (const option of options) {
      const score = Text.fuzzyScore(text, option.text);
      if (score > bestScore) {
        bestScore = score;
        bestId = option.id;
      }
    }
    return bestScore >= MATCH_THRESHOLD ? { id: bestId, score: bestScore } : null;
  }

  function salvageText(rawText) {
    const match = String(rawText || "").match(/"answer_text"\s*:\s*"((?:[^"\\]|\\.)+)"/);
    if (!match) return "";
    return match[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
  }

  function parse(rawText, request, meta = {}) {
    const options = request.options || [];
    const diagnostics = { idAdjusted: false, salvaged: false, raw: "" };

    let data = null;
    try {
      data = JSON.parse(Text.extractJson(rawText));
    } catch (_error) {
      try {
        data = JSON.parse(Text.repairJson(rawText));
      } catch (_error2) {
        const salvaged = salvageText(rawText);
        if (!salvaged) {
          return { result: null, error: new Errors.SolverError("parse_failed"), diagnostics };
        }
        diagnostics.salvaged = true;
        return {
          result: finish({ answerText: salvaged, ids: [], request, meta, diagnostics, confidence: null, reason: "" }),
          error: null,
          diagnostics
        };
      }
    }

    if (!data || typeof data !== "object") {
      return { result: null, error: new Errors.SolverError("parse_failed"), diagnostics };
    }

    let answerText = pickText(data);
    let ids = cleanIds(pickIndexPayload(data), request);

    if (answerText && options.length) {
      const matched = bestMatch(answerText, options);
      if (matched) {
        if (ids.length !== 1 || ids[0] !== matched.id) diagnostics.idAdjusted = true;
        ids = [matched.id];
        const canonical = options.find((option) => option.id === matched.id);
        if (canonical && canonical.text) answerText = canonical.text;
      } else {
        ids = ids.filter((id) => {
          const option = options.find((item) => item.id === id);
          return option ? Text.fuzzyScore(answerText, option.text) >= MATCH_THRESHOLD : false;
        });
      }
    }

    if (!answerText && ids.length) {
      answerText = ids
        .map((id) => {
          const option = options.find((item) => item.id === id);
          return option ? option.text : "";
        })
        .filter(Boolean)
        .join("; ");
    }

    const confidenceRaw = Number(data.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null;
    const reason = String(data.reason || data.short_reason || "").trim();

    if (!answerText && !ids.length) {
      return { result: null, error: new Errors.SolverError("empty_answer"), diagnostics };
    }

    return {
      result: finish({ answerText, ids, request, meta, diagnostics, confidence, reason }),
      error: null,
      diagnostics
    };
  }

  function finish({ answerText, ids, request, meta, diagnostics, confidence, reason }) {
    const options = request.options || [];
    let target;
    if (!options.length) target = "text";
    else if (ids.length) target = "option";
    else if (request.optionsArePlaceholders) target = "unmapped";
    else target = "text";

    return {
      answerText: String(answerText || "").trim(),
      optionIds: ids,
      target,
      confidence,
      reason,
      model: meta.model || "",
      provider: meta.provider || "",
      source: meta.source || "ai",
      elapsedMs: meta.elapsedMs || 0,
      diagnostics
    };
  }

  const api = { parse, MATCH_THRESHOLD };

  if (isNode) module.exports = api;
  else root.KC.core.AnswerParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
