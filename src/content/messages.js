/*
 * 扩展运行时封装：抹平 Firefox (browser.*) 与 Chrome (chrome.*) 的差异。
 * 同时兼容「返回 Promise」与「回调」两种 sendMessage 语义。
 */
(function (root) {
  "use strict";

  const api =
    typeof browser !== "undefined" && browser.runtime
      ? browser
      : typeof chrome !== "undefined" && chrome.runtime
        ? chrome
        : null;

  function send(message) {
    return new Promise((resolve, reject) => {
      if (!api || !api.runtime || typeof api.runtime.sendMessage !== "function") {
        reject(new Error("扩展运行时不可用"));
        return;
      }
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
        fail(error);
        return;
      }
      if (returned && typeof returned.then === "function") returned.then(done, fail);
    });
  }

  function onMessage(handler) {
    if (!api || !api.runtime) return () => {};
    api.runtime.onMessage.addListener(handler);
    return () => {
      try {
        api.runtime.onMessage.removeListener(handler);
      } catch (_error) {
        /* 忽略 */
      }
    };
  }

  function getURL(path) {
    try {
      return api && api.runtime && api.runtime.getURL ? api.runtime.getURL(path) : path;
    } catch (_error) {
      return path;
    }
  }

  const exportsObj = { available: Boolean(api), api, send, onMessage, getURL };

  if (typeof module === "object" && module.exports) module.exports = exportsObj;
  else root.KC.content.messages = exportsObj;
})(typeof globalThis !== "undefined" ? globalThis : this);
