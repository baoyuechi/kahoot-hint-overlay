"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { BoundedQueue } = require("../../src/core/queue.js");
const { DedupeGuard } = require("../../src/core/dedupe.js");

test("队列按容量淘汰最旧的低优先级项", () => {
  const queue = new BoundedQueue(2);
  assert.equal(queue.push("A", 1).accepted, true);
  assert.equal(queue.push("B", 1).accepted, true);
  const third = queue.push("C", 1);
  assert.equal(third.accepted, true);
  assert.equal(third.dropped, "A");
  assert.equal(queue.size, 2);
});

test("队列：来项更差时丢弃来项本身", () => {
  const queue = new BoundedQueue(2);
  queue.push("A", 1);
  queue.push("B", 0);
  const rejected = queue.push("C", 5);
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.dropped, "C");
  assert.equal(queue.size, 2);
});

test("队列：优先级数值小的先出", () => {
  const queue = new BoundedQueue(4);
  queue.push("low", 1);
  queue.push("high", 0);
  queue.push("mid", 1);
  assert.equal(queue.shift(), "high");
  assert.equal(queue.shift(), "low");
});

test("队列 clear 返回全部条目", () => {
  const queue = new BoundedQueue(4);
  queue.push("A");
  queue.push("B");
  const removed = queue.clear();
  assert.equal(removed.length, 2);
  assert.equal(queue.size, 0);
});

test("去重闸门：首次 admit，在飞期间 join 同一个 promise", () => {
  let now = 0;
  const guard = new DedupeGuard({ cooldownMs: 1000, now: () => now });
  assert.equal(guard.check("k").state, "admit");
  const first = guard.begin("k");
  const second = guard.check("k");
  assert.equal(second.state, "join");
  assert.equal(second.promise, first.promise);
});

test("去重闸门：完成后冷却期内 cooldown，过期后重新 admit", () => {
  let now = 0;
  const guard = new DedupeGuard({ cooldownMs: 1000, now: () => now });
  const deferred = guard.begin("k");
  guard.settle("k", { ok: true, value: "done" });

  now = 500;
  assert.equal(guard.check("k").state, "cooldown");

  now = 1001;
  assert.equal(guard.check("k").state, "admit");
  return deferred.promise;
});

test("去重闸门：冷却只作用于同一个 key", () => {
  let now = 0;
  const guard = new DedupeGuard({ cooldownMs: 8000, now: () => now });
  guard.begin("a");
  guard.settle("a", { ok: true, value: 1 });
  assert.equal(guard.check("a").state, "cooldown");
  assert.equal(guard.check("b").state, "admit");
});

test("去重闸门：条目数受上限约束", () => {
  const guard = new DedupeGuard({ cooldownMs: 1000, maxEntries: 2, now: () => 0 });
  guard.begin("a");
  guard.begin("b");
  guard.begin("c");
  assert.equal(guard.size, 2);
  assert.equal(guard.peek("a"), null);
});
