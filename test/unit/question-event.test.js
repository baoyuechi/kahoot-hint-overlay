"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  QuestionEvent,
  parseFrame,
  optionsArePlaceholders,
  makeDedupeKey
} = require("../../src/core/question-event.js");

function frameFrom(content, extra = {}) {
  return [
    {
      channel: "/service/player",
      data: { content: JSON.stringify(content), ...extra }
    }
  ];
}

test("parseFrame 展开 data.content 里的 JSON 字符串", () => {
  const events = parseFrame(
    frameFrom({ question: "Which planet has the most moons?", choices: [{ answer: "Saturn" }, { answer: "Jupiter" }] }, { questionIndex: 2 })
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].question, "Which planet has the most moons?");
  assert.deepEqual(events[0].options, ["Saturn", "Jupiter"]);
  assert.equal(events[0].questionIndex, 2);
});

test("parseFrame 支持字符串数组（Bayeux 帧）与纯对象帧", () => {
  const payload = frameFrom({ question: "Q", choices: ["A", "B"] });
  const fromString = parseFrame(JSON.stringify(payload));
  assert.equal(fromString.length, 1);
  assert.equal(fromString[0].question, "Q");

  const direct = parseFrame({ type: "question", question: "Direct", choices: ["X"] });
  assert.equal(direct.length, 1);
  assert.equal(direct[0].source, "direct");
});

test("坏 JSON 与空对象都不会抛错", () => {
  assert.deepEqual(parseFrame("{ broken"), []);
  assert.deepEqual(parseFrame(null), []);
  assert.deepEqual(parseFrame([{}]), []);
});

test("选项三种形态归一化一致", () => {
  const objects = new QuestionEvent({ question: "Q", choices: [{ answer: "A" }, { text: "B" }] });
  const dict = new QuestionEvent({ question: "Q", options: { 0: "A", 1: "B" } });
  const strings = new QuestionEvent({ question: "Q", options: ["A", "B"] });
  assert.deepEqual(objects.options, ["A", "B"]);
  assert.deepEqual(dict.options, ["A", "B"]);
  assert.deepEqual(strings.options, ["A", "B"]);
});

test("占位符识别：answer-0 与颜色描述都算占位", () => {
  assert.equal(optionsArePlaceholders(["answer-0", "answer-1"]), true);
  assert.equal(optionsArePlaceholders(["Red triangle", "Blue diamond", "Yellow circle", "Green square"]), true);
  assert.equal(optionsArePlaceholders(["Saturn", "Jupiter"]), false);
  assert.equal(optionsArePlaceholders([]), true);
});

test("answerFrame 由 numberOfChoices 判定", () => {
  const reveal = parseFrame(frameFrom({ question: "Q", choices: ["A"], numberOfChoices: 2 }));
  assert.equal(reveal.length, 1);
  assert.equal(reveal[0].answerFrame, true);

  const normal = parseFrame(frameFrom({ question: "Q2", choices: ["A"] }));
  assert.equal(normal[0].answerFrame, false);
});

test("merge 按置信度升序叠加，真实选项覆盖占位符", () => {
  const question = "Which planet has the most moons?";
  const low = new QuestionEvent({ question, options: ["answer-0", "answer-1"], questionIndex: 0, source: "frame" });
  const high = new QuestionEvent({ question, options: ["Saturn", "Jupiter"], questionIndex: 0, source: "dom" });
  const merged = QuestionEvent.merge(low, high);
  assert.deepEqual(merged.options, ["Saturn", "Jupiter"]);
  assert.equal(merged.hasUsableParticipantState(), true);
});

test("merge 后重算 dedupeKey", () => {
  const a = new QuestionEvent({ question: "Q", questionIndex: 0 });
  const merged = QuestionEvent.merge(a, new QuestionEvent({ question: "Q", questionIndex: 0, options: ["A"] }));
  assert.equal(merged.dedupeKey, makeDedupeKey(merged));
});

test("makeDedupeKey 组合 id/idx/q/type", () => {
  const key = makeDedupeKey(new QuestionEvent({ question: "Hello World", questionIndex: 3, questionType: "quiz" }));
  assert.match(key, /idx:3/);
  assert.match(key, /q:hello world/);
  assert.match(key, /type:quiz/);
});

test("isMulti / isOrdered / isSlider / isChoice 判定", () => {
  const multi = new QuestionEvent({ question: "Q", options: ["A", "B"], questionType: "multi_select" });
  assert.equal(multi.isMulti(), true);
  assert.equal(multi.isOrdered(), false);

  const jumble = new QuestionEvent({ question: "Q", options: ["A", "B"], questionType: "jumble" });
  assert.equal(jumble.isOrdered(), true);
  assert.equal(jumble.isMulti(), false);

  const slider = new QuestionEvent({ question: "Q", questionType: "slider" });
  assert.equal(slider.isSlider(), true);
  assert.equal(slider.isChoice(), false);

  const short = new QuestionEvent({ question: "Q", questionType: "short_answer" });
  assert.equal(short.isChoice(), false);
});
