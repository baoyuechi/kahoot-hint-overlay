/*
 * 浮层展示层。接口里没有任何 click/submit —— 这是产品的安全边界。
 * 内部样式放在 Shadow DOM，避免被站点 CSS 污染。
 */
(function (root) {
  "use strict";

  const CARD_CSS = `
:host { all: initial; }
.card {
  box-sizing: border-box;
  width: 340px;
  max-width: calc(100vw - 24px);
  background: rgba(18, 20, 26, 0.94);
  color: #eef1f6;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 12px 11px;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  pointer-events: none;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
}
.bar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #8b93a3; flex: 0 0 auto; }
.label { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #9aa3b2; }
.idx { margin-left: auto; font-size: 11px; color: #9aa3b2; font-variant-numeric: tabular-nums; }
.close {
  pointer-events: auto; background: none; border: 0; color: #9aa3b2;
  font-size: 15px; line-height: 1; cursor: pointer; padding: 2px 5px; border-radius: 4px;
}
.close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.status { font-size: 12px; color: #9aa3b2; }
.answer { margin-top: 4px; font-size: 19px; font-weight: 600; line-height: 1.35; word-break: break-word; }
.rows { list-style: none; margin: 7px 0 0; padding: 0; display: grid; gap: 3px; }
.rows li { display: flex; gap: 7px; align-items: baseline; padding: 2px 6px; border-radius: 5px; color: #c8cfda; font-size: 12px; }
.rows li .n { color: #7d8697; font-variant-numeric: tabular-nums; min-width: 12px; }
.rows li.on { background: rgba(74, 222, 128, 0.16); color: #eafff1; font-weight: 600; }
.rows li.on .n { color: #4ade80; }
.note {
  margin-top: 7px; padding: 6px 8px; border-radius: 6px;
  background: rgba(245, 158, 11, 0.14); border: 1px solid rgba(245, 158, 11, 0.35);
  color: #fbd38d; font-size: 11.5px; line-height: 1.45;
}
.meta { margin-top: 6px; font-size: 10.5px; color: #7d8697; display: flex; gap: 8px; flex-wrap: wrap; }
.card[data-phase="error"] .dot { background: #f87171; }
.card[data-phase="error"] .status { color: #fca5a5; }
.card[data-phase="solving"] .dot { background: #60a5fa; animation: kc-pulse 1.1s ease-in-out infinite; }
.card[data-phase="cooldown"] .dot { background: #fbbf24; }
.card[data-phase="answer"] .dot { background: #4ade80; }
@keyframes kc-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .card[data-phase="solving"] .dot { animation: none; } }
`;

  const TEMPLATE = `
<div class="card" data-phase="idle">
  <div class="bar">
    <span class="dot"></span>
    <span class="label">Quiz Hint</span>
    <span class="idx"></span>
    <button class="close" type="button" title="隐藏（下一题自动恢复）">×</button>
  </div>
  <div class="status" role="status">初始化…</div>
  <div class="answer" hidden></div>
  <ul class="rows" hidden></ul>
  <div class="note" hidden></div>
  <div class="meta" hidden></div>
</div>`;

  class Presenter {
    constructor(deps = {}) {
      this.getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});
      this.logger = deps.logger || { warn() {} };
      this.host = null;
      this.root = null;
      this.refs = {};
      this.enabled = true;
      this.dismissed = false;
      this.lastQuestionKey = null;
    }

    mount(parent) {
      if (this.host || typeof document === "undefined") return;

      const build = () => {
        const container = parent || document.documentElement || document.body;
        if (!container) return false;

        const host = document.createElement("div");
        host.id = "kc-host";
        const shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = CARD_CSS;
        const wrapper = document.createElement("div");
        wrapper.innerHTML = TEMPLATE;
        shadow.appendChild(style);
        shadow.appendChild(wrapper);

        const card = wrapper.querySelector(".card");
        this.refs = {
          card,
          idx: wrapper.querySelector(".idx"),
          status: wrapper.querySelector(".status"),
          answer: wrapper.querySelector(".answer"),
          rows: wrapper.querySelector(".rows"),
          note: wrapper.querySelector(".note"),
          meta: wrapper.querySelector(".meta"),
          close: wrapper.querySelector(".close")
        };
        this.refs.close.addEventListener("click", () => {
          this.dismissed = true;
          this.hide();
        });

        this.host = host;
        this.root = shadow;
        this.applyConfig();
        container.appendChild(host);
        return true;
      };

      if (build()) return;

      // document_start 时 documentElement 可能还没出现，短暂重试
      let attempts = 0;
      const retry = () => {
        if (this.host) return;
        if (build()) return;
        attempts += 1;
        if (attempts < 50) setTimeout(retry, 10);
      };
      setTimeout(retry, 10);
    }

    applyConfig() {
      const config = this.getConfig() || {};
      if (!this.host) return;
      this.host.dataset.corner = config.overlayCorner || "bottom-right";
      if (this.refs.card) {
        this.refs.card.style.width = `${Math.min(560, Math.max(220, Number(config.overlayMaxWidth) || 340))}px`;
      }
      if (!config.overlayEnabled) this.hide();
    }

    hide() {
      if (this.host) this.host.style.setProperty("display", "none", "important");
    }

    reveal() {
      if (this.host) this.host.style.removeProperty("display");
    }

    setEnabled(flag) {
      this.enabled = Boolean(flag);
      if (!this.enabled) this.hide();
      else if (!this.dismissed) this.reveal();
    }

    setStatus(status = {}) {
      if (!this.host) return;
      const phase = status.phase || "idle";
      this.refs.card.dataset.phase = phase;
      if (status.text) this.refs.status.textContent = status.text;
      if (status.questionIndex !== undefined && status.questionIndex !== null) {
        this.refs.idx.textContent = `Q${Number(status.questionIndex) + 1}`;
      }
      if (phase === "error") this.dismissed = false;
      if (this.enabled) this.reveal();
    }

    showAnswer(view) {
      if (!this.host || !view) return;
      const sameQuestion = view.question === this.lastQuestionKey;
      if (!sameQuestion) {
        this.lastQuestionKey = view.question;
        this.dismissed = false;
      }
      this.refs.card.dataset.phase = "answer";
      this.refs.status.textContent = view.target === "unmapped" ? "已作答 · 需人工定位" : "已作答";

      this.refs.answer.hidden = !view.answerText;
      this.refs.answer.textContent = view.answerText || "";

      this.refs.rows.replaceChildren(
        ...view.rows.map((row) => {
          const li = document.createElement("li");
          if (row.highlight) li.className = "on";
          const index = document.createElement("span");
          index.className = "n";
          index.textContent = String(row.id);
          const text = document.createElement("span");
          text.textContent = row.text;
          li.append(index, text);
          return li;
        })
      );
      this.refs.rows.hidden = view.rows.length === 0;

      this.refs.note.hidden = !view.note;
      this.refs.note.textContent = view.note || "";

      const meta = [];
      if (typeof view.confidence === "number") meta.push(`conf ${view.confidence.toFixed(2)}`);
      if (view.reason) meta.push(view.reason);
      if (view.model) meta.push(view.model);
      if (view.source === "mock") meta.push("mock");
      this.refs.meta.replaceChildren(
        ...meta.map((item) => {
          const span = document.createElement("span");
          span.textContent = item;
          return span;
        })
      );
      this.refs.meta.hidden = meta.length === 0;

      if (this.enabled && !this.dismissed) this.reveal();
    }

    clear() {
      if (!this.host) return;
      this.refs.card.dataset.phase = "idle";
      this.refs.answer.hidden = true;
      this.refs.rows.hidden = true;
      this.refs.note.hidden = true;
      this.refs.meta.hidden = true;
      this.refs.rows.replaceChildren();
      this.refs.answer.textContent = "";
      this.refs.note.textContent = "";
      this.refs.meta.replaceChildren();
    }

    destroy() {
      if (this.host && this.host.parentNode) this.host.parentNode.removeChild(this.host);
      this.host = null;
      this.root = null;
      this.refs = {};
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { Presenter, CARD_CSS, TEMPLATE };
  else root.KC.content.Presenter = { Presenter };
})(typeof globalThis !== "undefined" ? globalThis : this);
