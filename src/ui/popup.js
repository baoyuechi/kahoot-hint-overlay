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

  let state = { public: {}, secret: {}, flags: {} };
  let saveTimer = null;

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
    for (const control of controls) {
      const event = control.type === "checkbox" || control.tagName === "SELECT" ? "change" : "input";
      control.addEventListener(event, () => scheduleSave(control));
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
      setStatus("就绪", "");
    } catch (error) {
      setStatus(String(error.message || error), "err");
    }
  }

  init();
})();
