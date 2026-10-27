"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { QuestionEvent } = require("../../src/core/question-event.js");
const { DedupeGuard } = require("../../src/core/dedupe.js");
const { SolvePipeline } = require("../../src/core/pipeline.js");
const { SolverError } = require("../../src/core/errors.js");

const BASE_CONFIG = {
  enabled: true,
  retryCount: 1,
  retryBackoffMs: 0,
  minCallIntervalMs: 0,
  cooldownMs: 0,
  queueCapacity: 4
};

const OK_RESULT = {
  answerText: "A",
  optionIds: [0],
  target: "option",
  confidence: 0.9,
  reason: "",
  model: "test",
  source: "ai"
};

function makeEvent(question = "Q1") {
  return new QuestionEvent({ question, options: ["A", "B"], optionCount: 2 });
}

function makeSolver(behavior) {
  const calls = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  return {
    calls,
    get maxConcurrent() {
      return maxConcurrent;
    },
    async solve(request, context) {
      calls.push(request);
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        return await behavior(request, calls.length, context);
      } finally {
        concurrent -= 1;
      }
    }
  };
}

function build(solver, overrides = {}) {
  const errors = [];
  const pipeline = new SolvePipeline({
    solver,
    config: () => ({ ...BASE_CONFIG, ...overrides }),
    guard: new DedupeGuard({ cooldownMs: 0, now: () => Date.now() }),
    sleep: () => Promise.resolve(),
    onError: (_event, error) => errors.push(error),
    ...overrides.deps
  });
  return { pipeline, errors };
}

async function waitFor(predicate, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("waitFor 超时");
}

test("同一 key 连投 5 次只调用一次 solver", async () => {
  const solver = makeSolver(async () => OK_RESULT);
  const { pipeline } = build(solver);
  const submissions = [];
  for (let i = 0; i < 5; i += 1) submissions.push(pipeline.submit(makeEvent(), { key: "k1" }));
  await Promise.all(submissions);
  assert.equal(solver.calls.length, 1);
  assert.equal(pipeline.stats.joined, 4);
});

test("不同 key 连投 3 次，调用 3 次且并发恒为 1", async () => {
  const solver = makeSolver(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return OK_RESULT;
  });
  const { pipeline } = build(solver);
  await Promise.all([
    pipeline.submit(makeEvent("Q1"), { key: "k1" }),
    pipeline.submit(makeEvent("Q2"), { key: "k2" }),
    pipeline.submit(makeEvent("Q3"), { key: "k3" })
  ]);
  assert.equal(solver.calls.length, 3);
  assert.equal(solver.maxConcurrent, 1);
});

test("可重试错误重试一次后成功", async () => {
  const solver = makeSolver(async (_request, count) => {
    if (count === 1) throw new SolverError("timeout");
    return OK_RESULT;
  });
  const { pipeline, errors } = build(solver);
  await pipeline.submit(makeEvent(), { key: "k1" });
  assert.equal(solver.calls.length, 2);
  assert.equal(errors.length, 0);
});

test("不可重试错误只调用一次并回调 onError", async () => {
  const solver = makeSolver(async () => {
    throw new SolverError("http_4xx");
  });
  const { pipeline, errors } = build(solver);
  await pipeline.submit(makeEvent(), { key: "k1" });
  assert.equal(solver.calls.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "http_4xx");
});

test("重试次数上限被遵守", async () => {
  const solver = makeSolver(async () => {
    throw new SolverError("http_5xx");
  });
  const { pipeline, errors } = build(solver, { retryCount: 2 });
  await pipeline.submit(makeEvent(), { key: "k1" });
  assert.equal(solver.calls.length, 3);
  assert.equal(errors.length, 1);
});

test("队列满时丢弃最旧项并给出错误", async () => {
  const solver = makeSolver(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return OK_RESULT;
  });
  const { pipeline } = build(solver, { queueCapacity: 1 });
  const first = pipeline.submit(makeEvent("Q1"), { key: "k1" });
  const second = pipeline.submit(makeEvent("Q2"), { key: "k2" });
  const third = pipeline.submit(makeEvent("Q3"), { key: "k3" });
  const [a, b, c] = await Promise.all([first, second, third]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(b.error.code, "queue_full");
  assert.equal(solver.calls.length, 2);
  assert.ok(c);
});

test("enabled=false 时直接跳过", async () => {
  const solver = makeSolver(async () => OK_RESULT);
  const { pipeline } = build(solver, { enabled: false });
  const outcome = await pipeline.submit(makeEvent(), { key: "k1" });
  assert.equal(outcome.skipped, "disabled");
  assert.equal(solver.calls.length, 0);
});

test("dispose 后不再发起新请求", async () => {
  const solver = makeSolver(async () => OK_RESULT);
  const { pipeline } = build(solver);
  pipeline.dispose();
  const outcome = await pipeline.submit(makeEvent(), { key: "k1" });
  assert.equal(outcome.skipped, "disabled");
  await waitFor(() => solver.calls.length === 0);
});
