"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Prompt = require("../../src/core/prompt.js");

const normalRequest = {
  question: "Which planet has the most moons?",
  kind: "single",
  options: [
    { id: 0, text: "Saturn", placeholder: false },
    { id: 1, text: "Jupiter", placeholder: false }
  ],
  optionsArePlaceholders: false
};

const placeholderRequest = {
  question: "Which planet has the most moons?",
  kind: "single",
  options: [
    { id: 0, text: "red triangle", placeholder: true },
    { id: 1, text: "blue diamond", placeholder: true }
  ],
  optionsArePlaceholders: true
};

test("system 要求 answer_options，且不强制索引", () => {
  const system = Prompt.system();
  assert.match(system, /answer_text/);
  assert.match(system, /answer_options/);
  assert.doesNotMatch(system, /answer_indices is mandatory/);
  assert.match(system, /Never guess an index/);
});

test("普通选项提示词逐条列出选项文本", () => {
  const user = Prompt.user(normalRequest);
  assert.match(user, /0\. Saturn/);
  assert.match(user, /1\. Jupiter/);
  assert.doesNotMatch(user, /ColorIndexMap/);
  assert.doesNotMatch(user, /answer_indices/);
});

test("占位符分支包含颜色映射并要求高置信才给索引", () => {
  const user = Prompt.user(placeholderRequest);
  assert.match(user, /red triangle/);
  assert.match(user, /confidence >= 0\.6/);
  assert.match(user, /colored shapes/);
});

test("无选项时没有 Options 段", () => {
  const user = Prompt.user({ question: "Capital of Australia?", kind: "short", options: [], optionsArePlaceholders: false });
  assert.doesNotMatch(user, /^Options:/m);
  assert.match(user, /Capital of Australia\?/);
});

test("题干里的中文与引号原样保留", () => {
  const user = Prompt.user({ ...normalRequest, question: '「天王星」的卫星数量是？ "重要"' });
  assert.match(user, /「天王星」的卫星数量是？ "重要"/);
});

test("带图片时追加不可见提示", () => {
  const user = Prompt.user({ ...normalRequest, imageUrl: "https://example.com/a.png" });
  assert.match(user, /cannot see/);
});
