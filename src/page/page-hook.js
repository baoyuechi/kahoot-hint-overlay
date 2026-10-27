/*
 * 页面世界钩子：只 patch WebSocket 构造函数一次，只转发收到的文本帧。
 * 该文件必须自包含（页面世界没有 KC 命名空间，也不应依赖扩展 API）。
 */
(function () {
  "use strict";

  const W = window;
  if (W.__KC_HOOK_V1__) return;
  try {
    Object.defineProperty(W, "__KC_HOOK_V1__", { value: 1, enumerable: false, configurable: false });
  } catch (_error) {
    return;
  }

  const SOURCE = "quiz-hint";
  const VERSION = 1;
  const MAX_PAYLOAD = 256 * 1024;
  const ORIGIN = W.location && W.location.origin && W.location.origin !== "null" ? W.location.origin : "*";

  function post(kind, extra) {
    try {
      const message = Object.assign({ source: SOURCE, v: VERSION, kind }, extra || {});
      W.postMessage(message, ORIGIN);
    } catch (_error) {
      /* 沉默：转发失败不应影响页面 */
    }
  }

  const Native = W.WebSocket;
  if (typeof Native !== "function") return;

  let socketSeq = 0;

  function HookedWebSocket(url, protocols) {
    const socket = protocols === undefined ? new Native(url) : new Native(url, protocols);
    const socketId = (socketSeq += 1);
    const socketUrl = String(url || "");
    try {
      post("ws-open", { socketId, url: socketUrl });
      socket.addEventListener("message", (event) => {
        const payload = event && event.data;
        if (typeof payload !== "string") return;
        if (!payload.length || payload.length > MAX_PAYLOAD) return;
        post("ws-frame", {
          socketId,
          url: socketUrl,
          direction: "received",
          payload,
          at: Date.now()
        });
      });
    } catch (_error) {
      /* 监听失败时退化为无数据 */
    }
    return socket;
  }

  HookedWebSocket.prototype = Native.prototype;
  try {
    Object.setPrototypeOf(HookedWebSocket, Native);
  } catch (_error) {
    /* 忽略 */
  }

  try {
    Object.defineProperty(W, "WebSocket", {
      configurable: true,
      writable: true,
      value: HookedWebSocket
    });
  } catch (_error) {
    return;
  }

  W.addEventListener("message", (event) => {
    if (event.source !== W) return;
    const data = event.data;
    if (!data || data.source !== "quiz-hint-content" || data.kind !== "ping") return;
    post("pong", { hookVersion: VERSION });
  });

  post("ws-hook-ready", { href: W.location.href });
})();
