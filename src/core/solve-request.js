/*
 * 把 QuestionEvent 归一成与平台无关的 SolveRequest。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const QuestionEventModule = isNode
    ? require("./question-event.js")
    : (root.KC.core.QuestionEvent || {});
  const QuestionEvent = QuestionEventModule.QuestionEvent;

  function kindOf(event) {
    if (event.isOrdered()) return "order";
    if (event.isMulti()) return "multi";
    if (event.isSlider()) return "slider";
    if (!event.isChoice()) return "short";
    return "single";
  }

  function isPlaceholderText(text, index, pattern) {
    const value = String(text == null ? "" : text).trim();
    if (!value) return true;
    if (value === `answer-${index}`) return true;
    return pattern ? pattern.test(value) : false;
  }

  function toSolveRequest(rawEvent, options = {}) {
    const event = rawEvent instanceof QuestionEvent ? rawEvent : new QuestionEvent(rawEvent);
    if (!event.question) return null;

    const pattern = options.placeholderPattern || QuestionEventModule.DEFAULT_PLACEHOLDER_RE;
    const count = Math.max(event.optionCount || 0, event.options.length || 0);

    const list = [];
    for (let index = 0; index < count; index += 1) {
      const text = event.options[index] || `answer-${index}`;
      list.push({ id: index, text, placeholder: isPlaceholderText(text, index, pattern) });
    }

    const choiceList = event.isChoice() || event.isSlider() ? list : [];
    const optionsArePlaceholders =
      choiceList.length > 0 && choiceList.every((option) => option.placeholder);

    return {
      question: event.question,
      options: choiceList,
      kind: kindOf(event),
      questionType: event.questionType,
      optionsArePlaceholders,
      optionCount: choiceList.length,
      imageUrl: event.imageUrl || null,
      dedupeKey: event.dedupeKey
    };
  }

  const api = { toSolveRequest, kindOf };

  if (isNode) module.exports = api;
  else root.KC.core.SolveRequest = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
