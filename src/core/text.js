/*
 * 文本工具：归一化、模糊匹配、JSON 抢救、日志脱敏。
 */
(function (root) {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value)
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function fuzzyNormalize(value) {
    return normalize(value)
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\b(?:the|a|an)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function dice(a, b) {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const grams = new Map();
    for (let i = 0; i < a.length - 1; i += 1) {
      const gram = a.slice(i, i + 2);
      grams.set(gram, (grams.get(gram) || 0) + 1);
    }
    let overlap = 0;
    for (let i = 0; i < b.length - 1; i += 1) {
      const gram = b.slice(i, i + 2);
      const count = grams.get(gram) || 0;
      if (count) {
        overlap += 1;
        grams.set(gram, count - 1);
      }
    }
    return (2 * overlap) / (a.length + b.length - 2);
  }

  function fuzzyScore(a, b) {
    const left = fuzzyNormalize(a);
    const right = fuzzyNormalize(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) {
      return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    }
    return dice(left, right);
  }

  function extractJson(text) {
    const clean = String(text == null ? "" : text)
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    return start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  }

  function repairJson(text) {
    let out = extractJson(text);
    out = out.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    out = out.replace(/,\s*([}\]])/g, "$1");
    out = out.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    if (!out.endsWith("}") && out.startsWith("{")) out += "}";
    return out;
  }

  function redact(text, secrets) {
    let out = String(text == null ? "" : text);
    for (const secret of secrets || []) {
      const value = String(secret || "").trim();
      if (value.length < 6) continue;
      out = out.split(value).join("[redacted]");
    }
    return out;
  }

  function safeInt(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback === undefined ? null : fallback;
  }

  function noneIfEmpty(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  function truncate(value, max) {
    const text = String(value == null ? "" : value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  const api = {
    normalize,
    fuzzyNormalize,
    dice,
    fuzzyScore,
    extractJson,
    repairJson,
    redact,
    safeInt,
    noneIfEmpty,
    truncate
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KC.core.Text = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
