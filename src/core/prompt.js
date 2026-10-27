/*
 * 提示词：输出契约以「答案文本」为主，索引只是可选的补充。
 * 与参考实现的关键差异：不再强制 answer_indices，也不再丢弃 answer_text。
 */
(function (root) {
  "use strict";

  const COLOR_LABELS = [
    "red triangle (top-left)",
    "blue diamond (top-right)",
    "yellow circle (bottom-left)",
    "green square (bottom-right)"
  ];

  function system() {
    return [
      "You are a quiz answer assistant. Reply with exactly one JSON object, no markdown, no prose.",
      'Schema: {"answer_text":string,"answer_options":number[],"confidence":number,"reason":string}',
      "Rules:",
      "1. answer_text MUST be the correct option copied VERBATIM from the given options when options are listed. Preserve the original language, case and punctuation. Do not translate.",
      "2. answer_options is OPTIONAL. Include a 0-based index only when that index's text is exactly your answer. Never guess an index.",
      "3. Never invent or rephrase options. If the correct answer is not present in the option list, still give your best answer in answer_text and set confidence <= 0.4.",
      "4. For multi-answer questions return answer_options with every correct index; answer_text may list them separated by \"; \".",
      "5. For numeric or slider questions put the number in answer_text and leave answer_options empty.",
      "6. confidence is 0..1. reason is under 12 words."
    ].join("\n");
  }

  function optionLines(request) {
    return request.options
      .map((option) => `${option.id}. ${option.text}`)
      .join("\n");
  }

  function placeholderBlock(request) {
    const mapping = request.options
      .map((option) => `${option.id} = ${COLOR_LABELS[option.id] || "unknown shape"}`)
      .join(", ");
    return [
      "Note: the participant screen shows only colored shapes, not option text:",
      `${mapping}.`,
      "The host screen shows the real option text. If you can determine which shape the correct answer sits on, put that shape's text (for example \"Red triangle\") in answer_text AND set answer_options to that index with confidence >= 0.6.",
      "If you cannot determine the shape, answer the question normally in answer_text and leave answer_options empty."
    ].join("\n");
  }

  function user(request) {
    const hasOptions = Array.isArray(request.options) && request.options.length > 0;
    const imageNote = request.imageUrl
      ? "\nNote: the question references an image that you cannot see. Answer from the text alone if possible, and lower your confidence if the image is essential."
      : "";

    if (!hasOptions) {
      return [
        `Type: ${request.kind}`,
        `Question: ${request.question}${imageNote}`,
        'Answer with the JSON object only: {"answer_text":"...","answer_options":[],"confidence":0.0,"reason":"..."}'
      ].join("\n");
    }

    const parts = [
      `Type: ${request.kind}`,
      `Question: ${request.question}${imageNote}`,
      "Options:",
      optionLines(request)
    ];
    if (request.optionsArePlaceholders) parts.push(placeholderBlock(request));
    else parts.push("answer_text must be one of the options above, copied exactly.");
    parts.push('Answer with the JSON object only: {"answer_text":"...","answer_options":[],"confidence":0.0,"reason":"..."}');
    return parts.join("\n");
  }

  const api = { COLOR_LABELS, system, user };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KC.core.Prompt = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
