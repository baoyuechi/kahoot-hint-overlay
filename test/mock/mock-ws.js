/*
 * 本地 mock：必须在页面任何脚本创建 WebSocket 之前加载。
 * 用 __mock.replay(frames) 主动推送帧，走与真实 socket 完全相同的路径。
 */
(function () {
  "use strict";

  const Native = window.WebSocket;
  const sockets = [];

  function MockWebSocket(url, protocols) {
    const listeners = { message: [], open: [], close: [], error: [] };
    const socket = {
      url: String(url || ""),
      protocols,
      readyState: 1,
      binaryType: "blob",
      bufferedAmount: 0,
      onmessage: null,
      onopen: null,
      onclose: null,
      onerror: null,
      addEventListener(type, handler) {
        if (!listeners[type]) listeners[type] = [];
        listeners[type].push(handler);
      },
      removeEventListener(type, handler) {
        listeners[type] = (listeners[type] || []).filter((fn) => fn !== handler);
      },
      dispatchEvent(event) {
        for (const handler of listeners[event.type] || []) handler(event);
        const inline = socket[`on${event.type}`];
        if (typeof inline === "function") inline(event);
        return true;
      },
      send() {},
      close() {
        socket.readyState = 3;
        socket.dispatchEvent({ type: "close" });
      },
      __emit(frames) {
        const data = typeof frames === "string" ? frames : JSON.stringify(frames);
        socket.dispatchEvent({ type: "message", data });
      }
    };

    sockets.push(socket);
    setTimeout(() => {
      socket.readyState = 1;
      socket.dispatchEvent({ type: "open" });
    }, 0);

    return socket;
  }

  MockWebSocket.prototype = Native ? Native.prototype : {};
  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  window.WebSocket = MockWebSocket;

  window.__mock = {
    sockets,
    replay(frames) {
      const socket = sockets[sockets.length - 1];
      if (!socket) {
        console.warn("[mock] 没有活动的 socket，请先点「建立连接」");
        return;
      }
      socket.__emit(frames);
    },
    raw(text) {
      const socket = sockets[sockets.length - 1];
      if (socket) socket.__emit(text);
    }
  };
})();
