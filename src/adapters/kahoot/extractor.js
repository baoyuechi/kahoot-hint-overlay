/*
 * Kahoot 帧 → QuestionEvent。纯解析，不碰 DOM（enrich 除外）。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const QuestionEventModule = isNode
    ? require("../../core/question-event.js")
    : root.KC.core.QuestionEvent;
  const DomReader = isNode ? require("../../core/dom-reader.js") : root.KC.core.DomReader;
  const Profile = isNode ? require("./dom-profile.js") : root.KC.adapters.kahootProfile;

  const MAX_PAYLOAD_BYTES = 256 * 1024;

  function isPlayerFrame(json) {
    const messages = Array.isArray(json) ? json : [json];
    return messages.some((message) => {
      if (!message || typeof message !== "object") return false;
      // Bayeux 包把 channel 放在顶层；少数实现放在 data 里，两者都认
      const channel = message.channel || (message.data && message.data.channel);
      return !channel || String(channel).includes(Profile.playerChannel);
    });
  }

  class KahootQuestionExtractor {
    constructor(options = {}) {
      this.id = options.id || "kahoot";
      this.profile = options.profile || Profile;
      this.parsed = new WeakMap();
    }

    accepts(frame) {
      return Boolean(
        frame &&
        frame.direction === "received" &&
        typeof frame.payload === "string" &&
        frame.payload.length > 0 &&
        frame.payload.length <= MAX_PAYLOAD_BYTES
      );
    }

    parseOnce(frame) {
      if (this.parsed.has(frame)) return this.parsed.get(frame);
      let json = null;
      try {
        json = JSON.parse(frame.payload);
      } catch (_error) {
        json = null;
      }
      this.parsed.set(frame, json);
      return json;
    }

    extract(frame) {
      if (!this.accepts(frame)) {
        return [{ phase: "ignore", event: null, reason: "not-accepted" }];
      }
      const json = this.parseOnce(frame);
      if (json === null) {
        return [{ phase: "ignore", event: null, reason: "bad-json" }];
      }
      if (!isPlayerFrame(json)) {
        return [{ phase: "ignore", event: null, reason: "not-player-channel" }];
      }
      const events = QuestionEventModule.parseFrame(json);
      if (!events.length) {
        return [{ phase: "ignore", event: null, reason: "no-shape" }];
      }
      return events.map((event) => ({
        phase: event.answerFrame ? "reveal" : "question",
        event,
        reason: ""
      }));
    }

    /**
     * 题干可用但选项是占位符时，尝试在 deadlineMs 内从 DOM 读到真实选项文本。
     * 超时返回原 event，不抛错。
     */
    async enrich(event, context = {}) {
      const doc = context.document;
      const deadlineMs = Math.max(0, Number(context.deadlineMs) || 0);
      const view = context.view || (typeof window !== "undefined" ? window : null);
      if (!doc || !event) return event;

      const attempt = () => {
        const snapshot = DomReader.snapshot(doc, this.profile, view);
        if (!snapshot.optionCount) return null;
        if (QuestionEventModule.optionsArePlaceholders(snapshot.options, this.profile.placeholderPattern)) {
          return null;
        }
        return QuestionEventModule.merge(
          event,
          new QuestionEventModule.QuestionEvent({
            questionIndex: event.questionIndex,
            questionId: event.questionId,
            question: snapshot.question || event.question,
            options: snapshot.options,
            optionCount: snapshot.optionCount,
            questionType: event.questionType,
            numberOfAnswersAllowed: event.numberOfAnswersAllowed,
            source: "dom"
          })
        );
      };

      const immediate = attempt();
      if (immediate) return immediate;
      if (!deadlineMs) return event;

      return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
          const merged = attempt();
          if (merged) {
            resolve(merged);
            return;
          }
          if (Date.now() - started >= deadlineMs) {
            resolve(event);
            return;
          }
          setTimeout(tick, 60);
        };
        setTimeout(tick, 60);
      });
    }
  }

  const api = { KahootQuestionExtractor, isPlayerFrame, MAX_PAYLOAD_BYTES };

  if (isNode) module.exports = api;
  else root.KC.adapters.kahootExtractor = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
