"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ApiUrl } = require("../../src/background/http.js");

function join(base, version, path) {
  return ApiUrl.joinVersion(base, version, path);
}

test("根地址会补上版本段", () => {
  assert.equal(join("https://api.openai.com", "v1", "chat/completions"), "https://api.openai.com/v1/chat/completions");
  assert.equal(join("https://api.deepseek.com", "v1", "chat/completions"), "https://api.deepseek.com/v1/chat/completions");
  assert.equal(
    join("https://generativelanguage.googleapis.com", "v1beta", "models/gemini-pro:generateContent"),
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
  );
});

test("已含 /v1 的地址不会被重复补版本段", () => {
  assert.equal(
    join("https://api.groq.com/openai/v1", "v1", "chat/completions"),
    "https://api.groq.com/openai/v1/chat/completions"
  );
  assert.equal(
    join("https://openrouter.ai/api/v1", "v1", "chat/completions"),
    "https://openrouter.ai/api/v1/chat/completions"
  );
  assert.equal(
    join("https://integrate.api.nvidia.com/v1", "v1", "chat/completions"),
    "https://integrate.api.nvidia.com/v1/chat/completions"
  );
});

test("GLM 的 /api/paas/v4 不会被拼成 /paas/v4/v1", () => {
  assert.equal(
    join("https://open.bigmodel.cn/api/paas/v4", "v1", "chat/completions"),
    "https://open.bigmodel.cn/api/paas/v4/chat/completions"
  );
  assert.equal(
    join("https://api.z.ai/api/paas/v4", "v1", "chat/completions"),
    "https://api.z.ai/api/paas/v4/chat/completions"
  );
});

test("尾斜杠与缺失协议头都能被规整", () => {
  assert.equal(join("https://api.openai.com/", "v1", "/chat/completions"), "https://api.openai.com/v1/chat/completions");
  assert.equal(join("api.openai.com", "v1", "chat/completions"), "https://api.openai.com/v1/chat/completions");
});

test("非法地址抛 invalid_endpoint", () => {
  assert.throws(() => join("", "v1", "chat/completions"), /invalid_endpoint|http/);
});

test("本地自建服务（含端口）保持不变", () => {
  assert.equal(join("http://localhost:11434/v1", "v1", "chat/completions"), "http://localhost:11434/v1/chat/completions");
  assert.equal(join("http://localhost:8080", "v1", "chat/completions"), "http://localhost:8080/v1/chat/completions");
});
