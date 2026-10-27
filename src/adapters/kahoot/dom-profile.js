/*
 * Kahoot 参考适配器的 DOM 剖面。所有平台特有的选择器集中在这里。
 */
(function (root) {
  "use strict";

  const profile = {
    id: "kahoot",
    questionSelectors: [
      '[data-functional-selector="question-title"]',
      '[class*="QuestionTitle"]',
      "h1",
      "h2"
    ],
    optionSelector: [
      'button[data-functional-selector^="answer-"]',
      '[role="button"][data-functional-selector^="answer-"]'
    ].join(","),
    optionTextSelectors: [
      '[class*="SROnly"]',
      '[class*="sr-only"]',
      '[class*="VisuallyHidden"]'
    ],
    placeholderPattern: /^(?:answer[- ]?\d+|red triangle|blue diamond|yellow circle|green square)$/i,
    playerChannel: "/service/player"
  };

  if (typeof module === "object" && module.exports) module.exports = profile;
  else root.KC.adapters.kahootProfile = profile;
})(typeof globalThis !== "undefined" ? globalThis : this);
