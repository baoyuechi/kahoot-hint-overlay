"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const P = require("../../src/core/provider-presets.js");

test("每个预设都有 https 的地址、可核对的文档来源与核对日期", () => {
  for (const preset of P.listPresets()) {
    assert.match(preset.baseUrl, /^https:\/\//, `${preset.id} 的 baseUrl 必须是 https`);
    assert.equal(preset.baseUrl.endsWith("/"), false, `${preset.id} 的 baseUrl 不应带尾斜杠`);
    assert.ok(preset.docsUrl && preset.docsUrl.startsWith("https://"), `${preset.id} 缺少 docsUrl`);
    assert.ok(preset.region && preset.region.sourceUrl, `${preset.id} 缺少地区来源`);
    assert.match(preset.region.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${preset.id} 的核对日期格式不对`);
    assert.match(preset.label, /\S/);
  }
});

test("九家服务商都在，且按协议分组正确", () => {
  assert.equal(P.listPresets().length, 9);

  const openai = P.presetsFor("openai").map((p) => p.id);
  assert.deepEqual(openai.sort(), [
    "deepseek", "glm-cn", "glm-intl", "groq", "nvidia-nim", "openai", "openrouter"
  ]);

  assert.deepEqual(P.presetsFor("gemini").map((p) => p.id), ["google-ai-studio"]);
  assert.deepEqual(P.presetsFor("anthropic").map((p) => p.id), ["anthropic"]);
});

test("每个协议都有默认预设，且默认预设真实存在", () => {
  for (const protocol of ["openai", "gemini", "anthropic"]) {
    const id = P.defaultPresetId(protocol);
    assert.ok(id, `${protocol} 缺少默认预设`);
    const preset = P.getPreset(id);
    assert.ok(preset, `${protocol} 的默认预设 ${id} 不存在`);
    assert.equal(preset.protocol, protocol);
  }
});

test("关键地址与官方文档一致", () => {
  assert.equal(P.getPreset("openai").baseUrl, "https://api.openai.com");
  assert.equal(P.getPreset("anthropic").baseUrl, "https://api.anthropic.com");
  assert.equal(P.getPreset("google-ai-studio").baseUrl, "https://generativelanguage.googleapis.com");
  assert.equal(P.getPreset("deepseek").baseUrl, "https://api.deepseek.com");
  assert.equal(P.getPreset("glm-cn").baseUrl, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(P.getPreset("glm-intl").baseUrl, "https://api.z.ai/api/paas/v4");
  assert.equal(P.getPreset("openrouter").baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(P.getPreset("groq").baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(P.getPreset("nvidia-nim").baseUrl, "https://integrate.api.nvidia.com/v1");
});

test("白名单型服务商：中国大陆判为 blocked", () => {
  for (const id of ["openai", "anthropic", "google-ai-studio"]) {
    const verdict = P.regionVerdict(P.getPreset(id), "CN");
    assert.equal(verdict.level, "blocked", `${id} 在中国大陆应为 blocked`);
    assert.match(verdict.text, /中国大陆/);
    assert.match(verdict.sourceUrl, /^https:\/\//);
  }
});

test("白名单型服务商：非排除地区判为 check，而不是拍胸脯说可用", () => {
  const verdict = P.regionVerdict(P.getPreset("openai"), "JP");
  assert.equal(verdict.level, "check");
  assert.match(verdict.text, /日本/);
  assert.match(verdict.text, /白名单/);
});

test("Google 对中国香港有单独说明，避免与消费端清单混淆", () => {
  const verdict = P.regionVerdict(P.getPreset("google-ai-studio"), "HK");
  assert.equal(verdict.level, "blocked");
  assert.match(verdict.text, /中国香港/);
  assert.match(verdict.text, /消费端/);
});

test("没有官方清单的服务商如实标为 unknown", () => {
  for (const id of ["deepseek", "glm-cn", "glm-intl", "openrouter", "groq", "nvidia-nim"]) {
    const verdict = P.regionVerdict(P.getPreset(id), "CN");
    assert.equal(verdict.level, "unknown", `${id} 不应假装有地区结论`);
    assert.match(verdict.text, /没有可核对的官方地区清单/);
  }
});

test("未指定地区时不瞎判", () => {
  const verdict = P.regionVerdict(P.getPreset("openai"), "OTHER");
  assert.equal(verdict.level, "unknown");
  const empty = P.regionVerdict(P.getPreset("openai"), "");
  assert.equal(empty.level, "unknown");
});

test("时区推断：常见时区映射正确，未知时区回落 OTHER", () => {
  assert.equal(P.guessRegion("Asia/Shanghai"), "CN");
  assert.equal(P.guessRegion("Asia/Chongqing"), "CN");
  assert.equal(P.guessRegion("Asia/Hong_Kong"), "HK");
  assert.equal(P.guessRegion("Asia/Macau"), "MO");
  assert.equal(P.guessRegion("Asia/Taipei"), "TW");
  assert.equal(P.guessRegion("Asia/Tokyo"), "JP");
  assert.equal(P.guessRegion("America/New_York"), "US");
  assert.equal(P.guessRegion("Europe/London"), "GB");
  assert.equal(P.guessRegion("Africa/Nairobi"), "OTHER");
  assert.equal(P.guessRegion(""), "OTHER");
  assert.equal(P.guessRegion(undefined), "OTHER");
});

test("汇总计数覆盖全部预设", () => {
  const counts = P.summarize("CN");
  assert.equal(counts.blocked + counts.check + counts.unknown, 9);
  assert.equal(counts.blocked, 3);
  assert.equal(counts.unknown, 6);
});

test("地区标签覆盖所有下拉选项", () => {
  const codes = P.REGIONS.map((region) => region.code);
  assert.equal(new Set(codes).size, codes.length, "地区代码不能重复");
  assert.equal(P.regionLabel("CN"), "中国大陆");
  assert.equal(P.regionLabel("HK"), "中国香港");
  assert.equal(P.regionLabel("TW"), "中国台湾");
  assert.equal(P.regionLabel("ZZ"), "未知地区");
});

test("regionReport 产出可直接渲染的九行，且每行都带来源", () => {
  const report = P.regionReport("CN");
  assert.equal(report.code, "CN");
  assert.equal(report.label, "中国大陆");
  assert.equal(report.auto, false);
  assert.equal(report.rows.length, 9);
  assert.equal(report.counts.blocked, 3);
  assert.match(report.summary, /中国大陆/);
  assert.match(report.summary, /手动指定/);
  assert.match(report.summary, /3 家的官方清单未包含/);

  for (const row of report.rows) {
    assert.match(row.sourceUrl, /^https:\/\//);
    assert.equal(row.checkedAt, P.CHECKED_AT);
    assert.ok(["blocked", "check", "unknown"].includes(row.level));
    assert.ok(row.label && row.text && row.sourceLabel);
  }
});

test("regionReport 在 auto 模式按时区推断", () => {
  const report = P.regionReport("auto", "Asia/Shanghai");
  assert.equal(report.code, "CN");
  assert.equal(report.auto, true);
  assert.match(report.summary, /按时区推断/);
});

test("regionReport 对空配置回落到 auto 而非报错", () => {
  const report = P.regionReport("", "Asia/Tokyo");
  assert.equal(report.code, "JP");
  assert.equal(report.configured, "auto");
  assert.equal(report.rows.length, 9);
});
