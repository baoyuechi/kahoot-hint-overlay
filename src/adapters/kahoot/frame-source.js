/*
 * FrameSource 的参考实现：把 PageBridge 收到的页内消息转成 RawFrame。
 * start() 之前到达的帧由 PageBridge 缓冲，start 后按序 flush。
 */
(function (root) {
  "use strict";

  const MAX_PAYLOAD_BYTES = 256 * 1024;

  class BridgeFrameSource {
    constructor(deps = {}) {
      this.id = deps.id || "bridge-ws";
      this.bridge = deps.bridge;
      this.maxPayloadBytes = deps.maxPayloadBytes || MAX_PAYLOAD_BYTES;
      this.listener = null;
      this.unsubscribe = null;
    }

    isReady() {
      return Boolean(this.bridge && this.bridge.isReady());
    }

    start(onFrame) {
      if (!this.bridge) return;
      this.listener = (message) => {
        if (!message || message.kind !== "ws-frame") return;
        if (message.direction !== "received") return;
        if (typeof message.payload !== "string") return;
        if (!message.payload || message.payload.length > this.maxPayloadBytes) return;
        onFrame({
          direction: "received",
          socketUrl: String(message.url || ""),
          socketId: Number(message.socketId) || 0,
          payload: message.payload,
          at: Number(message.at) || Date.now()
        });
      };
      this.unsubscribe = this.bridge.subscribe(this.listener);
    }

    stop() {
      if (typeof this.unsubscribe === "function") this.unsubscribe();
      this.unsubscribe = null;
      this.listener = null;
    }
  }

  if (typeof module === "object" && module.exports) module.exports = { BridgeFrameSource };
  else root.KC.adapters.BridgeFrameSource = { BridgeFrameSource };
})(typeof globalThis !== "undefined" ? globalThis : this);
