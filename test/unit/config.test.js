"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const Config = require("../../src/core/config.js");

test("project('public') 不包含任何 API Key", () => {
  const merged = Config.merge({
    openAiApiKey: "sk-secret-value",
    geminiApiKey: "AIza-secret",
    anthropicApiKey: "sk-ant-secret"
  });
  const pub = Config.project(merged, "public");
  const serialized = JSON.stringify(pub);
  assert.equal(serialized.includes("ApiKey"), false);
  assert.equal(serialized.includes("sk-secret-value"), false);
  assert.equal("openAiApiKey" in pub, false);
});

test("project('secret') 只包含 secret 区", () => {
  const merged = Config.merge({ debug: true, openAiModel: "gpt-x" });
  const secret = Config.project(merged, "secret");
  assert.equal(secret.openAiModel, "gpt-x");
  assert.equal("debug" in secret, false);
});

test("未知键被丢弃", () => {
  assert.deepEqual(Config.clean({ nope: 1 }), {});
});

test("数值被夹紧到合法区间", () => {
  assert.equal(Config.coerce("overlayMaxWidth", 9999), 560);
  assert.equal(Config.coerce("overlayMaxWidth", 10), 220);
  assert.equal(Config.coerce("queueCapacity", 0), 1);
  assert.equal(Config.coerce("cooldownMs", -5), 0);
});

test("非法枚举回落默认值", () => {
  assert.equal(Config.coerce("overlayCorner", "middle"), "bottom-right");
  assert.equal(Config.coerce("preferredProvider", "xyz"), "auto");
});

test("endpoint 自动补协议头", () => {
  assert.equal(Config.endpoint("api.example.com"), "https://api.example.com");
  assert.equal(Config.endpoint("http://localhost:11434"), "http://localhost:11434");
  assert.equal(Config.endpoint(""), "");
});

test("geminiModels 为空数组时不抛异常", () => {
  const merged = Config.merge({ geminiModels: [] });
  assert.deepEqual(merged.geminiModels, []);
});

test("hasSecret 与 secretValues 反映真实状态", () => {
  const empty = Config.merge({});
  assert.equal(Config.hasSecret(empty), false);
  assert.deepEqual(Config.secretValues(empty), []);

  const filled = Config.merge({ openAiApiKey: "sk-123456" });
  assert.equal(Config.hasSecret(filled), true);
  assert.deepEqual(Config.secretValues(filled), ["sk-123456"]);
});
