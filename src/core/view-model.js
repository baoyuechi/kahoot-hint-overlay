/*
 * 视图模型：把 QuestionEvent + SolveResult 变成浮层要渲染的纯数据。
 * 占位符场景的「不猜索引」规则在这里落地。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const QuestionEventModule = isNode
    ? require("./question-event.js")
    : (root.KC.core.QuestionEvent || {});
  const QuestionEvent = QuestionEventModule.QuestionEvent;

  const SHAPE_LABELS = ["红三角（左上）", "蓝菱形（右上）", "黄圆（左下）", "绿方（右下）"];
  const CONFIDENCE_GATE = 0.6;

  const NOTE_PLACEHOLDER =
    "选手端选项是颜色/图形占位符，无法定位具体选项，请对照大屏自行点选。";
  const NOTE_MAPPED_BY_MODEL =
    "模型按颜色位置给出了映射，仅供参考，请核对后点选。";

  function optionTexts(event) {
    const count = Math.max(event.optionCount || 0, event.options.length || 0);
    const out = [];
    for (let index = 0; index < count; index += 1) {
      out.push({ id: index, text: event.options[index] || `answer-${index}` });
    }
    return out;
  }

  function buildAnswerView(event, result, config = {}) {
    const qe = event instanceof QuestionEvent ? event : new QuestionEvent(event);
    const options = optionTexts(qe);
    const placeholders = QuestionEventModule.optionsArePlaceholders(qe.options);
    const ids = Array.isArray(result.optionIds) ? result.optionIds.slice() : [];

    let target = result.target || "text";
    let highlight = ids.slice();
    let note = "";

    if (placeholders && options.length) {
      const confident = typeof result.confidence === "number" && result.confidence >= CONFIDENCE_GATE;
      if (highlight.length && confident) {
        note = config.placeholderNotice === false ? "" : NOTE_MAPPED_BY_MODEL;
      } else {
        highlight = [];
        target = "unmapped";
        note = config.placeholderNotice === false ? "" : NOTE_PLACEHOLDER;
      }
    }

    const rows = options.map((option) => ({
      id: option.id,
      text: placeholders ? SHAPE_LABELS[option.id] || option.text : option.text,
      raw: option.text,
      highlight: highlight.includes(option.id)
    }));

    return {
      question: qe.question,
      answerText: result.answerText || "",
      target,
      rows,
      confidence: typeof result.confidence === "number" ? result.confidence : null,
      reason: config.showReason === false ? "" : result.reason || "",
      model: config.showModel === false ? "" : result.model || "",
      source: result.source || "ai",
      note
    };
  }

  const api = { buildAnswerView, SHAPE_LABELS, NOTE_PLACEHOLDER, NOTE_MAPPED_BY_MODEL, CONFIDENCE_GATE };

  if (isNode) module.exports = api;
  else root.KC.core.ViewModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
