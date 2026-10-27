/*
 * 统一题目模型：把 WebSocket 帧、DOM 快照归一成同一种对象。
 * 这里是纯解析，不含任何平台特有的选择器（选择器由适配器提供）。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Text = isNode ? require("./text.js") : root.KC.core.Text;

  const DEFAULT_PLACEHOLDER_RE = /^(?:answer[- ]?\d+|red triangle|blue diamond|yellow circle|green square)$/i;
  const SHAPE_KEYS = [
    "question", "title", "choices", "options", "questionType",
    "image", "image_url", "nextGameBlockData", "numberOfChoices"
  ];
  const ORDERED_TYPES = new Set(["jumble", "puzzle", "ordering", "order"]);
  const SLIDER_TYPES = new Set(["slider", "numeric", "number"]);
  const MULTI_TYPES = new Set(["multi_select", "multi-select", "multiple_select", "multiple-select", "multiple"]);
  const NON_CHOICE_TYPES = new Set(["short_answer", "slider", "numeric", "number"]);

  function safeParse(value) {
    if (typeof value !== "string") return value && typeof value === "object" ? value : null;
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  class QuestionEvent {
    constructor(value = {}) {
      this.questionIndex = Text.safeInt(value.questionIndex, null);
      this.questionId = Text.noneIfEmpty(value.questionId || value.question_id || value.id);
      this.question = String(value.question || value.title || "").trim();
      this.options = QuestionEvent.cleanOptions(value.options || value.choices || []);
      this.optionCount = Math.max(
        this.options.length,
        Text.safeInt(value.optionCount, 0) || 0,
        Text.safeInt(value.numberOfChoices, 0) || 0
      );
      this.questionType = QuestionEvent.inferType(value);
      this.numberOfAnswersAllowed = Text.safeInt(value.numberOfAnswersAllowed, 1) || 1;
      this.imageUrl = Text.noneIfEmpty(
        value.imageUrl || value.image_url || value.image || QuestionEvent.mediaUrl(value.media)
      );
      this.raw = value.raw || null;
      this.source = value.source || "unknown";
      this.answerFrame = Boolean(value.answerFrame);
      this.confidence = value.confidence !== undefined ? value.confidence : QuestionEvent.confidence(this);
      this.dedupeKey = value.dedupeKey || QuestionEvent.makeDedupeKey(this);
    }

    static mediaUrl(media) {
      return (Array.isArray(media) ? media : [])
        .map((item) => item && (item.url || item.stillUrl))
        .find(Boolean) || null;
    }

    static choiceText(choice) {
      if (choice && typeof choice === "object") {
        return String(choice.answer || choice.text || choice.title || choice.value || "").trim();
      }
      return String(choice == null ? "" : choice).trim();
    }

    static cleanOptions(options) {
      let list = [];
      if (Array.isArray(options)) {
        list = options.map(QuestionEvent.choiceText);
      } else if (options && typeof options === "object") {
        const numeric = (key) => {
          const value = Text.safeInt(key, null);
          return value === null ? Number.MAX_SAFE_INTEGER : value;
        };
        list = Object.keys(options)
          .sort((a, b) => numeric(a) - numeric(b))
          .map((key) => QuestionEvent.choiceText(options[key]));
      }
      return list.map((item) => String(item || "").trim()).filter(Boolean);
    }

    static inferType(value = {}) {
      const raw = String(value.questionType || value.type || value.gameBlockType || "").toLowerCase().trim();
      if (MULTI_TYPES.has(raw)) return "multi_select";
      if (["short_answer", "short-answer", "shortanswer", "open_ended", "open-ended"].includes(raw)) return "short_answer";
      if (SLIDER_TYPES.has(raw)) return "slider";
      return ["", "message", "question", "next_question", "quiz"].includes(raw) ? "quiz" : raw;
    }

    static fromPayload(payload, raw, source) {
      return new QuestionEvent({
        questionIndex: payload.questionIndex,
        questionId: payload.question_id || payload.questionId || payload.id,
        question: payload.question || payload.title || "",
        options: payload.options || payload.choices || [],
        optionCount: payload.optionCount !== undefined ? payload.optionCount : payload.numberOfChoices,
        questionType: payload.questionType || payload.type || payload.gameBlockType,
        numberOfAnswersAllowed: payload.numberOfAnswersAllowed,
        imageUrl: payload.image_url || payload.image,
        media: payload.media,
        raw,
        source,
        answerFrame:
          Object.prototype.hasOwnProperty.call(payload, "numberOfChoices") && !payload.nextGameBlockData
      });
    }

    static parseFrame(frame) {
      const input = typeof frame === "string" ? safeParse(frame) : frame;
      if (input === null || input === undefined) return [];
      const messages = Array.isArray(input) ? input : [input];
      const events = [];
      const seen = new Set();

      const push = (event) => {
        if (!event) return;
        const usable = Boolean(event.question || event.options.length || event.imageUrl || event.optionCount > 0);
        if (!usable) return;
        const signature = `${event.dedupeKey}|${event.answerFrame ? "r" : "q"}|${event.options.length}`;
        if (seen.has(signature)) return;
        seen.add(signature);
        events.push(event);
      };

      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        const directType = String(message.type || "").toLowerCase();
        if (["question", "next_question", "quiz_question"].includes(directType)) {
          push(QuestionEvent.fromPayload(message, message, "direct"));
          continue;
        }

        const data = message.data && typeof message.data === "object" ? message.data : {};
        const content = safeParse(data.content);
        const candidates = [];
        if (content && typeof content === "object" && !Array.isArray(content)) candidates.push(content);
        if (Object.keys(data).length) candidates.push(data);

        for (const candidate of candidates) {
          const hasShape = SHAPE_KEYS.some((key) => key in candidate) || candidate.questionIndex !== undefined;
          if (!hasShape) continue;

          const useBlock = candidate.nextGameBlockData && !candidate.choices && !candidate.options;
          const payload = useBlock
            ? {
                ...candidate.nextGameBlockData,
                questionIndex: candidate.questionIndex !== undefined ? candidate.questionIndex : data.questionIndex,
                gameBlockType: candidate.gameBlockType
              }
            : { ...candidate };

          if (payload.questionIndex === undefined) {
            payload.questionIndex = candidate.questionIndex !== undefined ? candidate.questionIndex : data.questionIndex;
          }

          push(QuestionEvent.fromPayload(payload, message, "frame"));
        }
      }
      return events;
    }

    static optionsArePlaceholders(options, pattern) {
      const re = pattern || DEFAULT_PLACEHOLDER_RE;
      const list = options || [];
      if (!list.length) return true;
      return list.every((option, index) => {
        const text = String(option == null ? "" : option).trim();
        return !text || text === `answer-${index}` || re.test(text);
      });
    }

    static confidence(event) {
      let score = 0;
      if (event.question && event.question.length >= 3) score += 4;
      if (event.options.length && !QuestionEvent.optionsArePlaceholders(event.options)) score += 3;
      else if (event.optionCount > 0) score += 1;
      if (event.imageUrl) score += 1;
      if (event.questionIndex !== null) score += 1;
      return score;
    }

    static makeDedupeKey(event) {
      const parts = [];
      if (event.questionId) parts.push(`id:${event.questionId}`);
      if (event.questionIndex !== null && event.questionIndex !== undefined) parts.push(`idx:${event.questionIndex}`);
      if (event.question) parts.push(`q:${Text.normalize(event.question).slice(0, 120)}`);
      if (event.questionType) parts.push(`type:${event.questionType}`);
      return parts.join("|") || "unknown";
    }

    static merge(...events) {
      const valid = events
        .filter(Boolean)
        .map((event) => (event instanceof QuestionEvent ? event : new QuestionEvent(event)));
      if (!valid.length) return new QuestionEvent();

      const base = new QuestionEvent();
      const ordered = valid.slice().sort((a, b) => (a.confidence || 0) - (b.confidence || 0));

      for (const event of ordered) {
        const sameQuestion =
          base.questionIndex === null || event.questionIndex === null || base.questionIndex === event.questionIndex;
        if (event.questionIndex !== null) base.questionIndex = event.questionIndex;
        if (sameQuestion && event.questionId) base.questionId = event.questionId;
        if (sameQuestion && event.question) base.question = event.question;
        if (event.optionCount) base.optionCount = Math.max(base.optionCount || 0, event.optionCount);
        if (sameQuestion && event.options.length) {
          const incoming = QuestionEvent.optionsArePlaceholders(event.options);
          const existing = QuestionEvent.optionsArePlaceholders(base.options);
          if (!incoming || existing) base.options = event.options.slice();
        }
        if (event.questionType) base.questionType = event.questionType;
        if (event.numberOfAnswersAllowed) base.numberOfAnswersAllowed = event.numberOfAnswersAllowed;
        if (sameQuestion && event.imageUrl) base.imageUrl = event.imageUrl;
        if (sameQuestion && event.raw) base.raw = event.raw;
        if (event.source) base.source = event.source;
        if (event.answerFrame) base.answerFrame = true;
      }

      base.confidence = QuestionEvent.confidence(base);
      base.dedupeKey = QuestionEvent.makeDedupeKey(base);
      return base;
    }

    hasUsableText() {
      return Boolean(this.question && this.question.length >= 3);
    }

    hasUsableOptions() {
      return Boolean(this.options.length && !QuestionEvent.optionsArePlaceholders(this.options));
    }

    hasUsableParticipantState() {
      return this.hasUsableText() && this.hasUsableOptions();
    }

    isChoice() {
      return Boolean(this.optionCount || this.options.length) && !NON_CHOICE_TYPES.has(this.questionType);
    }

    isOrdered() {
      return ORDERED_TYPES.has(this.questionType);
    }

    isMulti() {
      return this.isChoice() && !this.isOrdered() &&
        (MULTI_TYPES.has(this.questionType) || Number(this.numberOfAnswersAllowed || 1) > 1);
    }

    isSlider() {
      return SLIDER_TYPES.has(this.questionType);
    }

    toJSON() {
      return {
        questionIndex: this.questionIndex,
        questionId: this.questionId,
        question: this.question,
        options: this.options,
        optionCount: this.optionCount,
        questionType: this.questionType,
        numberOfAnswersAllowed: this.numberOfAnswersAllowed,
        imageUrl: this.imageUrl,
        source: this.source,
        answerFrame: this.answerFrame,
        confidence: this.confidence,
        dedupeKey: this.dedupeKey
      };
    }
  }

  const api = {
    QuestionEvent,
    DEFAULT_PLACEHOLDER_RE,
    safeParse,
    parseFrame: QuestionEvent.parseFrame,
    merge: QuestionEvent.merge,
    makeDedupeKey: QuestionEvent.makeDedupeKey,
    optionsArePlaceholders: QuestionEvent.optionsArePlaceholders,
    inferType: QuestionEvent.inferType,
    cleanOptions: QuestionEvent.cleanOptions
  };

  if (isNode) module.exports = api;
  else root.KC.core.QuestionEvent = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
