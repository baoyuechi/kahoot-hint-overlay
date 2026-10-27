"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parse } = require("../../src/core/answer-parser.js");

function request(overrides = {}) {
  return {
    question: "Which planet has the most moons?",
    kind: "single",
    options: [
      { id: 0, text: "Saturn", placeholder: false },
      { id: 1, text: "Jupiter", placeholder: false },
      { id: 2, text: "Mars", placeholder: false },
      { id: 3, text: "Venus", placeholder: false }
    ],
    optionsArePlaceholders: false,
    ...overrides
  };
}

function placeholderRequest() {
  return {
    question: "Which planet has the most moons?",
    kind: "single",
    options: [
      { id: 0, text: "red triangle", placeholder: true },
      { id: 1, text: "blue diamond", placeholder: true },
      { id: 2, text: "yellow circle", placeholder: true },
      { id: 3, text: "green square", placeholder: true }
    ],
    optionsArePlaceholders: true
  };
}

test("文本与索引矛盾时以文本为准，并标记 idAdjusted", () => {
  const { result, error } = parse('{"answer_text":"Saturn","answer_options":[1],"confidence":0.8}', request());
  assert.equal(error, null);
  assert.equal(result.answerText, "Saturn");
  assert.deepEqual(result.optionIds, [0]);
  assert.equal(result.diagnostics.idAdjusted, true);
  assert.equal(result.target, "option");
});

test("只有索引时从选项文本派生答案", () => {
  const { result } = parse('{"answer_options":[2]}', request());
  assert.equal(result.answerText, "Mars");
  assert.deepEqual(result.optionIds, [2]);
  assert.equal(result.diagnostics.idAdjusted, false);
});

test("支持 ```json 围栏与尾部多余逗号", () => {
  const fenced = parse('```json\n{"answer_text":"Jupiter"}\n```', request());
  assert.equal(fenced.result.answerText, "Jupiter");
  assert.deepEqual(fenced.result.optionIds, [1]);

  const trailing = parse('{"answer_text":"Mars","answer_options":[2],}', request());
  assert.equal(trailing.error, null);
  assert.equal(trailing.result.answerText, "Mars");
});

test("纯散文无法解析时报 parse_failed", () => {
  const { result, error } = parse("The answer is Saturn.", request());
  assert.equal(result, null);
  assert.equal(error.code, "parse_failed");
});

test("空答案报 empty_answer", () => {
  const { result, error } = parse('{"answer_text":""}', request());
  assert.equal(result, null);
  assert.equal(error.code, "empty_answer");
});

test("占位符选项且无索引 → target 为 unmapped", () => {
  const { result } = parse('{"answer_text":"Saturn","confidence":0.9}', placeholderRequest());
  assert.equal(result.answerText, "Saturn");
  assert.deepEqual(result.optionIds, []);
  assert.equal(result.target, "unmapped");
});

test("占位符选项且模型显式给出索引 → target 为 option", () => {
  const { result } = parse('{"answer_text":"Blue diamond","answer_options":[1],"confidence":0.8}', placeholderRequest());
  assert.deepEqual(result.optionIds, [1]);
  assert.equal(result.target, "option");
});

test("越界索引被裁剪", () => {
  const { result } = parse('{"answer_text":"Venus","answer_options":[9]}', request());
  assert.deepEqual(result.optionIds, [3]);
});

test("多选题保留多个索引", () => {
  const multi = request({ kind: "multi" });
  const { result } = parse('{"answer_options":[0,2],"confidence":0.7}', multi);
  assert.deepEqual(result.optionIds, [0, 2]);
  assert.equal(result.answerText, "Saturn; Mars");
});

test("无选项时 target 为 text", () => {
  const short = { question: "Capital of Australia?", kind: "short", options: [], optionsArePlaceholders: false };
  const { result } = parse('{"answer_text":"Canberra","confidence":0.95}', short);
  assert.equal(result.target, "text");
  assert.equal(result.answerText, "Canberra");
});
