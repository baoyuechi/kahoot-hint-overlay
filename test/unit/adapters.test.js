"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../mock/fixtures.js");

const { KahootQuestionExtractor } = require("../../src/adapters/kahoot/extractor.js");
const registry = require("../../src/adapters/registry.js");
const profile = require("../../src/adapters/kahoot/dom-profile.js");

const fixtures = globalThis.KCFixtures;

function rawFrame(payload) {
  return {
    direction: "received",
    socketUrl: "wss://kahoot.it/cometd/live/x",
    socketId: 1,
    payload: typeof payload === "string" ? payload : JSON.stringify(payload),
    at: Date.now()
  };
}

test("从真实形状的帧里解析出题干与四个选项", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const extractions = extractor.extract(rawFrame(fixtures.questionFrame(0)));
  assert.equal(extractions.length, 1);
  assert.equal(extractions[0].phase, "question");
  assert.equal(extractions[0].event.question, "Which planet has the most moons?");
  assert.deepEqual(extractions[0].event.options, ["Saturn", "Jupiter", "Mars", "Venus"]);
  assert.equal(extractions[0].event.questionIndex, 0);
});

test("numberOfChoices 帧被判定为 reveal", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const extractions = extractor.extract(rawFrame(fixtures.revealFrame(1)));
  assert.equal(extractions[0].phase, "reveal");
  assert.equal(extractions[0].event.question, "Which ocean is the deepest?");
});

test("占位符帧的选项被识别为占位符", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const extractions = extractor.extract(rawFrame(fixtures.placeholderFrame(0)));
  const event = extractions[0].event;
  assert.deepEqual(event.options, ["answer-0", "answer-1", "answer-2", "answer-3"]);
  assert.equal(event.hasUsableParticipantState(), false);
});

test("坏 JSON 返回 ignore 且不抛错", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const extractions = extractor.extract(rawFrame(fixtures.badJson()));
  assert.equal(extractions.length, 1);
  assert.equal(extractions[0].phase, "ignore");
  assert.equal(extractions[0].reason, "bad-json");
});

test("非玩家频道与二进制帧被忽略", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const otherChannel = JSON.stringify([{ channel: "/service/controller", data: { content: "{}" } }]);
  assert.equal(extractor.extract(rawFrame(otherChannel))[0].reason, "not-player-channel");

  const binary = { direction: "received", payload: "", socketId: 1, at: 0 };
  assert.equal(extractor.extract(binary)[0].reason, "not-accepted");
});

test("同一个帧对象只解析一次", () => {
  const extractor = new KahootQuestionExtractor({ profile });
  const frame = rawFrame(fixtures.questionFrame(0));
  const first = extractor.extract(frame);
  const second = extractor.extract(frame);
  assert.equal(first[0].event.question, second[0].event.question);
  assert.equal(extractor.parsed.has(frame), true);
});

test("registry 按站点解析适配器", () => {
  const kahoot = require("../../src/adapters/kahoot/index.js");
  assert.equal(kahoot.id, "kahoot");

  const found = registry.hostMatches;
  assert.equal(found("kahoot.it", "kahoot.it"), true);
  assert.equal(found("*.kahoot.it", "play.kahoot.it"), true);
  assert.equal(found("*.kahoot.it", "kahoot.it"), true);
  assert.equal(found("*.kahoot.it", "notkahoot.it"), false);
  assert.equal(found("kahoot.it", "evil-kahoot.it"), false);
});
