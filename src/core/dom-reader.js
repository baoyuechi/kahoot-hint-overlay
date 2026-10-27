/*
 * 通用 DOM 读取器：选择器全部由适配器注入，因此可以在 node 里用假 document 单测。
 */
(function (root) {
  "use strict";

  function isVisible(element, view) {
    try {
      if (typeof element.getBoundingClientRect === "function") {
        const rect = element.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return false;
      }
      if (view && typeof view.getComputedStyle === "function") {
        const style = view.getComputedStyle(element);
        if (style && (style.visibility === "hidden" || style.display === "none")) return false;
      }
      return true;
    } catch (_error) {
      return true;
    }
  }

  function textOf(element, profile) {
    if (!element) return "";
    for (const selector of (profile && profile.optionTextSelectors) || []) {
      const node = typeof element.querySelector === "function" ? element.querySelector(selector) : null;
      const value = node && node.textContent ? node.textContent.trim() : "";
      if (value) return value;
    }
    if (typeof element.getAttribute === "function") {
      const aria = element.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
    }
    return element.textContent ? String(element.textContent).trim() : "";
  }

  function readQuestion(doc, profile) {
    if (!doc || !profile) return "";
    for (const selector of profile.questionSelectors || []) {
      const node = doc.querySelector(selector);
      const value = node && node.textContent ? node.textContent.trim() : "";
      if (value) return value;
    }
    return "";
  }

  function readOptions(doc, profile, view) {
    if (!doc || !profile || !profile.optionSelector) return [];
    const nodes = Array.from(doc.querySelectorAll(profile.optionSelector) || []);
    const visible = nodes.filter((node) => isVisible(node, view));
    return visible.map((node, index) => ({
      index,
      text: textOf(node, profile) || `answer-${index}`
    }));
  }

  function snapshot(doc, profile, view) {
    const options = readOptions(doc, profile, view);
    return {
      question: readQuestion(doc, profile),
      options: options.map((option) => option.text),
      optionCount: options.length,
      source: "dom"
    };
  }

  const api = { isVisible, textOf, readQuestion, readOptions, snapshot };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KC.core.DomReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
