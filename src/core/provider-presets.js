/*
 * 服务商预设：官方 Base URL + 地区可用性数据。
 *
 * 两条自我约束：
 * 1. 地址与地区政策都标注来源与核对日期，便于过期后复查；不填猜出来的值。
 * 2. 只预填 baseUrl，不预填模型名——模型 ID 变动比地址快得多，硬编码只会制造新的过期数据。
 */
(function (root) {
  "use strict";

  const CHECKED_AT = "2026-10-27";

  const ALLOWLIST_EXCLUSIONS = ["CN", "HK", "MO", "RU", "IR", "KP", "CU", "SY"];

  const REGIONS = [
    { code: "CN", label: "中国大陆" },
    { code: "HK", label: "中国香港" },
    { code: "MO", label: "中国澳门" },
    { code: "TW", label: "中国台湾" },
    { code: "JP", label: "日本" },
    { code: "KR", label: "韩国" },
    { code: "SG", label: "新加坡" },
    { code: "IN", label: "印度" },
    { code: "US", label: "美国" },
    { code: "CA", label: "加拿大" },
    { code: "GB", label: "英国" },
    { code: "DE", label: "德国" },
    { code: "AU", label: "澳大利亚" },
    { code: "OTHER", label: "其他 / 不确定" }
  ];

  const TIMEZONE_MAP = {
    "asia/shanghai": "CN",
    "asia/chongqing": "CN",
    "asia/harbin": "CN",
    "asia/urumqi": "CN",
    "asia/hong_kong": "HK",
    "asia/macau": "MO",
    "asia/taipei": "TW",
    "asia/tokyo": "JP",
    "asia/seoul": "KR",
    "asia/singapore": "SG",
    "asia/kolkata": "IN",
    "asia/calcutta": "IN",
    "america/new_york": "US",
    "america/chicago": "US",
    "america/denver": "US",
    "america/los_angeles": "US",
    "america/toronto": "CA",
    "america/vancouver": "CA",
    "europe/london": "GB",
    "europe/berlin": "DE",
    "europe/paris": "DE",
    "australia/sydney": "AU",
    "australia/melbourne": "AU"
  };

  const ALLOWLIST_NOTE =
    "官方只公布支持白名单，未列入的地区即不受支持；在未列地区使用可能违反条款并导致账号受限。";

  const PRESETS = [
    {
      id: "openai",
      label: "OpenAI",
      protocol: "openai",
      baseUrl: "https://api.openai.com",
      docsUrl: "https://platform.openai.com/docs/api-reference/introduction",
      note: "官方文档的 base 为 https://api.openai.com/v1；此处填根地址，扩展会自动补 /v1。另有 us./eu./jp. 等区域端点可选。",
      region: {
        mode: "allowlist",
        knownUnlisted: ALLOWLIST_EXCLUSIONS,
        sourceLabel: "OpenAI 官方：API 受支持的国家和地区",
        sourceUrl: "https://help.openai.com/zh-hans-cn/articles/5347006",
        checkedAt: CHECKED_AT,
        detail: ALLOWLIST_NOTE
      }
    },
    {
      id: "anthropic",
      label: "Anthropic（Claude）",
      protocol: "anthropic",
      baseUrl: "https://api.anthropic.com",
      docsUrl: "https://platform.claude.com/docs/en/api/overview",
      note: "Messages API 路径为 /v1/messages，扩展会自动补 /v1。需要 anthropic-version 头，扩展已内置。",
      region: {
        mode: "allowlist",
        knownUnlisted: ALLOWLIST_EXCLUSIONS,
        sourceLabel: "Anthropic 官方：Supported countries & regions",
        sourceUrl: "https://www.anthropic.com/supported-countries",
        checkedAt: CHECKED_AT,
        detail: ALLOWLIST_NOTE
      }
    },
    {
      id: "google-ai-studio",
      label: "Google AI Studio / Gemini API",
      protocol: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com",
      docsUrl: "https://ai.google.dev/gemini-api/docs/available-regions",
      note: "AI Studio 与 Gemini API 是同一个端点（走 /v1beta）。Vertex AI 的 Gemini 使用另一套 OAuth 与区域域名，本扩展不支持。",
      region: {
        mode: "allowlist",
        knownUnlisted: ALLOWLIST_EXCLUSIONS,
        perRegion: {
          HK: "AI Studio 与 Gemini API 的官方适用地区清单中未见中国香港；Gemini 消费端应用的支持清单则包含中国香港——两者是不同产品的清单，请按你实际使用的入口判断。",
          MO: "AI Studio 与 Gemini API 的官方适用地区清单中未见中国澳门。"
        },
        sourceLabel: "Google 官方：Google AI Studio 和 Gemini API 的适用区域",
        sourceUrl: "https://ai.google.dev/gemini-api/docs/available-regions",
        checkedAt: CHECKED_AT,
        detail: ALLOWLIST_NOTE
      }
    },
    {
      id: "deepseek",
      label: "DeepSeek",
      protocol: "openai",
      baseUrl: "https://api.deepseek.com",
      docsUrl: "https://api-docs.deepseek.com/",
      note: "官方 base 就是 https://api.deepseek.com，不需要 /v1；扩展补 /v1 后同样可用。",
      region: {
        mode: "unsourced",
        sourceLabel: "DeepSeek 官方文档（未见地区限制清单）",
        sourceUrl: "https://api-docs.deepseek.com/",
        checkedAt: CHECKED_AT
      }
    },
    {
      id: "glm-cn",
      label: "智谱 GLM（BigModel，中国区）",
      protocol: "openai",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      docsUrl: "https://docs.bigmodel.cn/cn/guide/models/text",
      note: "base 已含 /api/paas/v4，扩展不会再补 /v1。国内平台账号与国际版 z.ai 的 Key 不通用。",
      region: {
        mode: "unsourced",
        sourceLabel: "智谱官方文档（未见地区限制清单）",
        sourceUrl: "https://docs.bigmodel.cn/cn/guide/models/text",
        checkedAt: CHECKED_AT
      }
    },
    {
      id: "glm-intl",
      label: "智谱 GLM（Z.AI 国际版）",
      protocol: "openai",
      baseUrl: "https://api.z.ai/api/paas/v4",
      docsUrl: "https://docs.z.ai/api-reference/",
      note: "国际站端点，base 已含 /api/paas/v4。与国内 open.bigmodel.cn 的 Key 不通用。",
      region: {
        mode: "unsourced",
        sourceLabel: "Z.AI 官方 API 参考（未见地区限制清单）",
        sourceUrl: "https://docs.z.ai/api-reference/",
        checkedAt: CHECKED_AT
      }
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      protocol: "openai",
      baseUrl: "https://openrouter.ai/api/v1",
      docsUrl: "https://openrouter.ai/docs",
      note: "base 已含 /api/v1。上游模型各自可能有各自的地区限制，需逐个查看模型页。",
      region: {
        mode: "unsourced",
        sourceLabel: "OpenRouter 官方文档（未见统一地区清单）",
        sourceUrl: "https://openrouter.ai/docs",
        checkedAt: CHECKED_AT
      }
    },
    {
      id: "groq",
      label: "Groq",
      protocol: "openai",
      baseUrl: "https://api.groq.com/openai/v1",
      docsUrl: "https://console.groq.com/docs",
      note: "官方要求带 /openai 段：写成 https://api.groq.com/v1 会 404。",
      region: {
        mode: "unsourced",
        sourceLabel: "Groq 官方文档（未见地区限制清单）",
        sourceUrl: "https://console.groq.com/docs",
        checkedAt: CHECKED_AT
      }
    },
    {
      id: "nvidia-nim",
      label: "NVIDIA NIM",
      protocol: "openai",
      baseUrl: "https://integrate.api.nvidia.com/v1",
      docsUrl: "https://docs.nvidia.com/nim/",
      note: "托管 NIM 的 OpenAI 兼容端点，base 已含 /v1。自建 NIM 改成 http://localhost:8080/v1 即可。",
      region: {
        mode: "unsourced",
        sourceLabel: "NVIDIA 官方文档（未见地区限制清单）",
        sourceUrl: "https://docs.nvidia.com/nim/",
        checkedAt: CHECKED_AT
      }
    }
  ];

  const DEFAULT_BY_PROTOCOL = {
    openai: "openai",
    gemini: "google-ai-studio",
    anthropic: "anthropic"
  };

  function listPresets() {
    return PRESETS.slice();
  }

  function presetsFor(protocol) {
    return PRESETS.filter((preset) => preset.protocol === protocol);
  }

  function getPreset(id) {
    return PRESETS.find((preset) => preset.id === id) || null;
  }

  function defaultPresetId(protocol) {
    return DEFAULT_BY_PROTOCOL[protocol] || null;
  }

  function regionLabel(code) {
    const found = REGIONS.find((region) => region.code === code);
    return found ? found.label : "未知地区";
  }

  function guessRegion(timeZone) {
    const zone = String(timeZone || "").toLowerCase().trim();
    if (!zone) return "OTHER";
    return TIMEZONE_MAP[zone] || "OTHER";
  }

  function currentTimeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_error) {
      return "";
    }
  }

  /**
   * @returns {{level:"blocked"|"check"|"unknown", text:string, sourceLabel:string, sourceUrl:string, checkedAt:string}}
   */
  function regionVerdict(preset, code) {
    const region = (preset && preset.region) || {};
    const meta = {
      sourceLabel: region.sourceLabel || "",
      sourceUrl: region.sourceUrl || (preset && preset.docsUrl) || "",
      checkedAt: region.checkedAt || ""
    };

    if (!code || code === "OTHER") {
      return {
        level: "unknown",
        text: "未选择具体地区，无法与官方清单比对。",
        ...meta
      };
    }

    if (region.mode === "allowlist") {
      const override = region.perRegion && region.perRegion[code];
      if ((region.knownUnlisted || []).includes(code)) {
        return {
          level: "blocked",
          text: override || `官方支持清单未包含${regionLabel(code)}。在该地区使用可能违反条款，账号有被限制的风险。`,
          ...meta
        };
      }
      if (override) {
        return { level: "check", text: override, ...meta };
      }
      return {
        level: "check",
        text: `${regionLabel(code)} 不在我们记录的排除名单内；但官方以白名单为准，请点开来源自行确认。`,
        ...meta
      };
    }

    return {
      level: "unknown",
      text: "该服务商没有可核对的官方地区清单，请以其条款与注册页提示为准。",
      ...meta
    };
  }

  function summarize(regionCode) {
    const counts = { blocked: 0, check: 0, unknown: 0 };
    for (const preset of PRESETS) counts[regionVerdict(preset, regionCode).level] += 1;
    return counts;
  }

  /**
   * 把「地区 + 全部预设」摊平成可直接渲染的数据，DOM 层只负责套模板。
   * @param {string} configuredRegion 配置里的 regionCode（"auto" 或两位代码）
   * @param {string} [timeZone] 用于 auto 推断的时区
   */
  function regionReport(configuredRegion, timeZone) {
    const configured = !configuredRegion || configuredRegion === "auto" ? "auto" : configuredRegion;
    const code = configured === "auto" ? guessRegion(timeZone === undefined ? currentTimeZone() : timeZone) : configured;
    const counts = summarize(code);

    const notes = [];
    if (counts.blocked) notes.push(`${counts.blocked} 家的官方清单未包含该地区`);
    if (counts.unknown) notes.push(`${counts.unknown} 家没有可核对的官方清单`);

    return {
      code,
      configured,
      label: regionLabel(code),
      auto: configured === "auto",
      counts,
      summary: `判定地区：${regionLabel(code)}（${configured === "auto" ? "按时区推断，可手动改" : "手动指定"}）${notes.length ? ` · ${notes.join(" · ")}` : ""}`,
      rows: PRESETS.map((preset) => {
        const verdict = regionVerdict(preset, code);
        return {
          id: preset.id,
          label: preset.label,
          level: verdict.level,
          text: verdict.text,
          sourceLabel: verdict.sourceLabel,
          sourceUrl: verdict.sourceUrl,
          checkedAt: verdict.checkedAt
        };
      })
    };
  }

  const api = {
    CHECKED_AT,
    PRESETS,
    REGIONS,
    listPresets,
    presetsFor,
    getPreset,
    defaultPresetId,
    regionLabel,
    guessRegion,
    currentTimeZone,
    regionVerdict,
    summarize,
    regionReport
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.ProviderPresets = api;
    if (root.KC && root.KC.core) root.KC.core.ProviderPresets = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
