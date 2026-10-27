/*
 * 设置页：public 区直接读写，secret 区的 API Key 只写不读。
 */
(function () {
  "use strict";

  const api =
    typeof browser !== "undefined" && browser.runtime
      ? browser
      : typeof chrome !== "undefined" && chrome.runtime
        ? chrome
        : null;

  const statusEl = document.getElementById("status");
  const controls = Array.from(document.querySelectorAll("[data-config]"));
  const KEY_FIELDS = { openAiApiKey: "hasOpenAiKey", geminiApiKey: "hasGeminiKey", anthropicApiKey: "hasAnthropicKey" };
  const P = window.ProviderPresets;
  const PROTOCOLS = ["openai", "gemini", "anthropic"];

  let state = { public: {}, secret: {}, flags: {} };
  let saveTimer = null;

  function prefixFor(protocol) {
    return protocol === "openai" ? "openAi" : protocol;
  }

  function baseUrlControl(protocol) {
    return document.querySelector(`[data-config="${prefixFor(protocol)}BaseUrl"]`);
  }

  function setupPresets() {
    if (!P) return;

    for (const protocol of PROTOCOLS) {
      const select = document.querySelector(`[data-preset="${protocol}"]`);
      if (!select) continue;
      for (const preset of P.presetsFor(protocol)) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.label;
        select.appendChild(option);
      }
      select.addEventListener("change", () => {
        const preset = P.getPreset(select.value);
        if (!preset) return;
        const input = baseUrlControl(protocol);
        if (!input) return;
        input.value = preset.baseUrl;
        select.value = "";
        renderPresetStates();
        persist(input);
        setStatus(`已填入 ${preset.label} 官方地址，可直接修改`, "ok");
      });
    }

    const regionSelect = document.getElementById("regionCode");
    if (regionSelect) {
      for (const region of P.REGIONS) {
        const option = document.createElement("option");
        option.value = region.code;
        option.textContent = region.label;
        regionSelect.appendChild(option);
      }
    }
  }

  function renderPresetStates() {
    if (!P) return;
    for (const protocol of PROTOCOLS) {
      const input = baseUrlControl(protocol);
      const badge = document.querySelector(`[data-preset-state="${protocol}"]`);
      if (!input || !badge) continue;

      const value = input.value.trim();
      if (!value) {
        badge.textContent = "未设置";
        badge.dataset.tone = "muted";
        continue;
      }
      const match = P.presetsFor(protocol).find((preset) => preset.baseUrl === value);
      if (match) {
        badge.textContent = `官方地址 · ${match.label}`;
        badge.dataset.tone = "ok";
      } else {
        badge.textContent = "自定义地址";
        badge.dataset.tone = "custom";
      }
    }
  }

  async function prefillBaseUrls() {
    if (!P) return;
    const touched = [];
    for (const protocol of PROTOCOLS) {
      const input = baseUrlControl(protocol);
      if (!input || input.value.trim()) continue;
      const id = P.defaultPresetId(protocol);
      const preset = id ? P.getPreset(id) : null;
      if (!preset) continue;
      input.value = preset.baseUrl;
      touched.push(input);
    }
    for (const input of touched) await persist(input);
    if (touched.length) setStatus("已预填官方地址（可随时修改）", "ok");
  }

  function renderRegion() {
    if (!P) return;
    const summaryEl = document.getElementById("regionSummary");
    const list = document.getElementById("regionList");
    if (!summaryEl || !list) return;

    const report = P.regionReport(state.public.regionCode || "auto");
    summaryEl.textContent = report.summary;
    summaryEl.className = "hint";

    list.replaceChildren(
      ...report.rows.map((row) => {
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.dataset.level = row.level;

        const body = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = row.label;
        const text = document.createElement("div");
        text.textContent = row.text;
        const src = document.createElement("span");
        src.className = "src";
        src.textContent = `${row.sourceLabel} · 核对 ${row.checkedAt} `;
        const link = document.createElement("a");
        link.href = row.sourceUrl;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        link.textContent = "打开来源";
        src.appendChild(link);

        body.append(title, document.createTextNode(" "), text, src);
        li.append(dot, body);
        return li;
      })
    );
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      if (!api || !api.runtime) return reject(new Error("扩展运行时不可用"));
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      let returned;
      try {
        returned = api.runtime.sendMessage(message, (response) => {
          const lastError = api.runtime.lastError;
          if (lastError) return fail(new Error(lastError.message || String(lastError)));
          done(response);
        });
      } catch (error) {
        return fail(error);
      }
      if (returned && typeof returned.then === "function") returned.then(done, fail);
    });
  }

  function setStatus(text, tone) {
    statusEl.textContent = text;
    statusEl.className = tone || "";
  }

  function isSecret(control) {
    return control.dataset.secret === "1";
  }

  function render() {
    for (const control of controls) {
      const key = control.dataset.config;
      const source = isSecret(control) ? state.secret : state.public;
      const value = source ? source[key] : undefined;

      if (KEY_FIELDS[key]) {
        const saved = Boolean(state.flags && state.flags[KEY_FIELDS[key]]);
        control.value = "";
        control.placeholder = saved ? "已保存（留空表示不修改）" : control.dataset.placeholder || "";
        continue;
      }

      if (control.type === "checkbox") {
        control.checked = Boolean(value);
        continue;
      }

      if (Array.isArray(value)) {
        control.value = value.join(", ");
        continue;
      }

      control.value = value === undefined || value === null ? "" : String(value);
    }
  }

  function readValue(control) {
    if (control.type === "checkbox") return control.checked;
    if (control.type === "number") return Number(control.value || 0);
    return control.value;
  }

  async function persist(control) {
    const key = control.dataset.config;
    const value = readValue(control);

    if (KEY_FIELDS[key] && String(value).trim() === "") return;

    const secret = isSecret(control);
    const payload = { [key]: value };

    try {
      const response = await send({
        type: secret ? "kc.ui.saveSecret" : "kc.ui.savePublic",
        config: payload
      });
      if (!response || response.ok === false) throw new Error((response && response.error && response.error.message) || "保存失败");
      if (response.public) state.public = response.public;
      if (response.secret) state.secret = response.secret;
      if (response.flags) state.flags = response.flags;
      setStatus("已保存", "ok");

      if (key === "regionCode") renderRegion();
      if (key.endsWith("BaseUrl")) renderPresetStates();
    } catch (error) {
      setStatus(String(error.message || error), "err");
    }
  }

  function scheduleSave(control) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(control), 300);
  }

  async function loadModels(button) {
    const provider = button.dataset.loadModels;
    const prefix = provider === "openai" ? "openAi" : provider;
    const baseUrlControl = document.querySelector(`[data-config="${prefix}BaseUrl"]`);
    const keyControl = document.querySelector(`[data-config="${prefix}ApiKey"]`);
    const hint = document.querySelector(`[data-model-hint="${provider}"]`);
    hint.className = "hint";
    hint.textContent = "正在加载模型目录…";

    try {
      const response = await send({
        type: "kc.ui.listModels",
        provider,
        baseUrl: baseUrlControl ? baseUrlControl.value.trim() : "",
        apiKey: keyControl ? keyControl.value.trim() : ""
      });
      if (!response || response.ok === false) {
        throw new Error((response && response.error && response.error.message) || "加载失败");
      }
      hint.className = "hint ok";
      hint.textContent = `共 ${response.models.length} 个模型：${response.models.slice(0, 6).join(", ")}${response.models.length > 6 ? " …" : ""}`;

      if (provider === "openai") {
        const modelControl = document.querySelector('[data-config="openAiModel"]');
        if (modelControl && !modelControl.value.trim() && response.models.length) {
          modelControl.value = response.models[0];
          await persist(modelControl);
        }
      } else if (provider === "gemini") {
        const modelsControl = document.querySelector('[data-config="geminiModels"]');
        if (modelsControl) {
          modelsControl.value = response.models.join(", ");
          await persist(modelsControl);
        }
      } else {
        const modelControl = document.querySelector('[data-config="anthropicModel"]');
        if (modelControl && !modelControl.value.trim() && response.models.length) {
          modelControl.value = response.models[0];
          await persist(modelControl);
        }
      }
    } catch (error) {
      hint.className = "hint err";
      hint.textContent = String(error.message || error);
    }
  }

  function reloadTab() {
    if (!api || !api.tabs) return;
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return;
      api.tabs.reload(tab.id, () => {
        if (api.runtime.lastError) setStatus("无法自动刷新，请手动刷新页面", "err");
      });
    });
  }

  async function init() {
    setupPresets();

    for (const control of controls) {
      const event = control.type === "checkbox" || control.tagName === "SELECT" ? "change" : "input";
      control.addEventListener(event, () => scheduleSave(control));
      if (control.dataset.config && control.dataset.config.endsWith("BaseUrl")) {
        control.addEventListener("input", renderPresetStates);
      }
      if (KEY_FIELDS[control.dataset.config]) {
        control.dataset.placeholder = control.getAttribute("placeholder") || "";
      }
    }

    for (const button of document.querySelectorAll("[data-load-models]")) {
      button.addEventListener("click", () => loadModels(button));
    }
    document.getElementById("reload").addEventListener("click", reloadTab);

    try {
      const response = await send({ type: "kc.ui.getConfig" });
      if (!response || response.ok === false) throw new Error("读取配置失败");
      state.public = response.public || {};
      state.secret = response.secret || {};
      state.flags = response.flags || {};
      render();
      renderPresetStates();
      renderRegion();
      setStatus("就绪", "");
      await prefillBaseUrls();
    } catch (error) {
      setStatus(String(error.message || error), "err");
    }
  }

  init();
})();
