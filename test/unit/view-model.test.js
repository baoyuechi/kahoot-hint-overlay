"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { QuestionEvent } = require("../../src/core/question-event.js");
const { buildAnswerView, NOTE_PLACEHOLDER, NOTE_MAPPED_BY_MODEL } = require("../../src/core/view-model.js");

function event(options, extra = {}) {
  return new QuestionEvent({ question: "Q", options, optionCount: options.length, ...extra });
}

test("占位符 + 无索引：全部不高亮，给出人工定位提示", () => {
  const view = buildAnswerView(
    event(["red triangle", "blue diamond", "yellow circle", "green square"]),
    { answerText: "Saturn", optionIds: [], target: "unmapped", confidence: null, reason: "x" },
    { placeholderNotice: true, showReason: true }
  );
  assert.equal(view.target, "unmapped");
  assert.equal(view.note, NOTE_PLACEHOLDER);
  assert.equal(view.rows.length, 4);
  assert.equal(view.rows.some((row) => row.highlight), false);
  assert.equal(view.rows[0].text, "红三角（左上）");
});

test("占位符 + 高置信索引：保留高亮并提示核对", () => {
  const view = buildAnswerView(
    event(["red triangle", "blue diamond", "yellow circle", "green square"]),
    { answerText: "Blue diamond", optionIds: [1], target: "option", confidence: 0.8, reason: "x" },
    { placeholderNotice: true }
  );
  assert.equal(view.target, "option");
  assert.equal(view.note, NOTE_MAPPED_BY_MODEL);
  const on = view.rows.filter((row) => row.highlight);
  assert.equal(on.length, 1);
  assert.equal(on[0].id, 1);
});

test("占位符 + 低置信索引：降级为 unmapped", () => {
  const view = buildAnswerView(
    event(["red triangle", "blue diamond"]),
    { answerText: "Red triangle", optionIds: [0], target: "option", confidence: 0.3 },
    { placeholderNotice: true }
  );
  assert.equal(view.target, "unmapped");
  assert.equal(view.rows.some((row) => row.highlight), false);
});

test("普通选项：恰好一行高亮，文本原样", () => {
  const view = buildAnswerView(
    event(["Saturn", "Jupiter", "Mars", "Venus"]),
    { answerText: "Jupiter", optionIds: [1], target: "option", confidence: 0.9, reason: "moons" },
    { showReason: true, showModel: false }
  );
  assert.equal(view.target, "option");
  assert.equal(view.note, "");
  assert.equal(view.rows.filter((row) => row.highlight).length, 1);
  assert.equal(view.rows[1].text, "Jupiter");
  assert.equal(view.reason, "moons");
  assert.equal(view.model, "");
});

test("placeholderNotice 关闭时不显示提示文案", () => {
  const view = buildAnswerView(
    event(["red triangle"]),
    { answerText: "Saturn", optionIds: [], target: "unmapped", confidence: null },
    { placeholderNotice: false }
  );
  assert.equal(view.note, "");
  assert.equal(view.target, "unmapped");
});
