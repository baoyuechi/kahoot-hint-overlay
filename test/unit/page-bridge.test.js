"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { PageBridge } = require("../../src/content/page-bridge.js");

const ORIGIN = "https://kahoot.it";
const quiet = { log() {}, warn() {}, error() {} };

function makeWindow(origin = ORIGIN) {
  const handlers = new Set();
  const posted = [];
  const win = {
    location: { origin, href: `${origin}/` },
    addEventListener(type, fn) {
      if (type === "message") handlers.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === "message") handlers.delete(fn);
    },
    postMessage(message, targetOrigin) {
      posted.push({ message, targetOrigin });
    },
    emit(data, fromOrigin = origin, source) {
      for (const fn of handlers) fn({ source: source || win, origin: fromOrigin, data });
    },
    posted
  };
  return win;
}

function withWindow(fn) {
  return async () => {
    const win = makeWindow();
    globalThis.window = win;
    try {
      await fn(win);
    } finally {
      delete globalThis.window;
    }
  };
}

test("ping 使用精确 origin，而不是通配符", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN });
  bridge.start();
  assert.ok(win.posted.length >= 1);
  assert.equal(win.posted[0].targetOrigin, ORIGIN);
  assert.equal(win.posted[0].message.source, "quiz-hint-content");
  assert.equal(win.posted[0].message.kind, "ping");
  bridge.stop();
}));

test("pong 之前到达的帧被缓冲，就绪后按序 flush", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN });
  bridge.start();

  win.emit({ source: "quiz-hint", v: 1, kind: "ws-frame", direction: "received", payload: "{\"a\":1}", socketId: 1, at: 1 });
  assert.equal(bridge.isReady(), false);

  win.emit({ source: "quiz-hint", v: 1, kind: "pong", hookVersion: 1 });
  assert.equal(bridge.isReady(), true);

  const received = [];
  bridge.subscribe((message) => received.push(message));
  assert.equal(received.length, 1);
  assert.equal(received[0].payload, "{\"a\":1}");
  bridge.stop();
}));

test("来源 origin 不匹配的帧被丢弃", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN });
  bridge.start();
  win.emit({ source: "quiz-hint", v: 1, kind: "pong" });

  const received = [];
  bridge.subscribe((message) => received.push(message));
  win.emit({ source: "quiz-hint", v: 1, kind: "ws-frame", payload: "evil" }, "https://evil.example");
  assert.equal(received.length, 0);
  bridge.stop();
}));

test("source 或版本不匹配的帧被丢弃", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN });
  bridge.start();
  win.emit({ source: "quiz-hint", v: 1, kind: "pong" });

  const received = [];
  bridge.subscribe((message) => received.push(message));
  win.emit({ source: "someone-else", v: 1, kind: "ws-frame", payload: "x" });
  win.emit({ source: "quiz-hint", v: 2, kind: "ws-frame", payload: "x" });
  assert.equal(received.length, 0);
  bridge.stop();
}));

test("缓冲上限生效，超出丢弃最旧的", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN, cap: 2 });
  bridge.start();
  for (let i = 0; i < 5; i += 1) {
    win.emit({ source: "quiz-hint", v: 1, kind: "ws-frame", payload: `p${i}` });
  }
  win.emit({ source: "quiz-hint", v: 1, kind: "pong" });
  const received = [];
  bridge.subscribe((message) => received.push(message.payload));
  assert.deepEqual(received, ["p3", "p4"]);
  bridge.stop();
}));

test("订阅者抛错不会打断其他订阅者", withWindow(async (win) => {
  const bridge = new PageBridge({ logger: quiet, origin: ORIGIN });
  bridge.start();
  win.emit({ source: "quiz-hint", v: 1, kind: "pong" });

  const received = [];
  bridge.subscribe(() => {
    throw new Error("boom");
  });
  bridge.subscribe((message) => received.push(message.payload));
  win.emit({ source: "quiz-hint", v: 1, kind: "ws-frame", payload: "ok" });
  assert.deepEqual(received, ["ok"]);
  bridge.stop();
}));
