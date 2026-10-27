/*
 * 求解流水线：有界队列 + 单并发 + 去重 + 失败重试。
 * 这一层不认识任何平台：只有 solver / guard / queue / 回调。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const { SolverError } = isNode ? require("./errors.js") : root.KC.core.Errors;
  const { DedupeGuard } = isNode ? require("./dedupe.js") : root.KC.core.Dedupe;
  const { BoundedQueue } = isNode ? require("./queue.js") : root.KC.core.Queue;
  const SolveRequestModule = isNode ? require("./solve-request.js") : root.KC.core.SolveRequest;

  function normalizeError(error) {
    if (error instanceof SolverError) return error;
    if (error && error.name === "AbortError") return new SolverError("aborted");
    if (error && /timeout|timed out/i.test(String(error.message || ""))) {
      return new SolverError("timeout", { message: error.message, cause: error });
    }
    return new SolverError("network", { message: error && error.message, cause: error });
  }

  class SolvePipeline {
    constructor(deps = {}) {
      this.solver = deps.solver;
      this.config = typeof deps.config === "function" ? deps.config : () => deps.config || {};
      this.toRequest = deps.toRequest || SolveRequestModule.toSolveRequest;
      this.onAnswer = deps.onAnswer || (() => {});
      this.onError = deps.onError || (() => {});
      this.onStatus = deps.onStatus || (() => {});
      this.now = deps.now || (() => Date.now());
      this.sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms))));

      this.guard = deps.guard || new DedupeGuard({
        cooldownMs: this.config().cooldownMs,
        now: this.now
      });
      this.queue = deps.queue || new BoundedQueue(this.config().queueCapacity);

      this.running = false;
      this.disposed = false;
      this.lastCallAt = 0;
      this.inflight = null;
      this.stats = { solved: 0, failed: 0, joined: 0, cooled: 0, dropped: 0 };
    }

    async submit(event, options = {}) {
      const config = this.config();
      if (this.disposed || config.enabled === false) return { skipped: "disabled" };

      const key = options.key || event.dedupeKey || event.question || "unknown";
      const decision = this.guard.check(key);

      if (decision.state === "join") {
        this.stats.joined += 1;
        return decision.promise;
      }
      if (decision.state === "cooldown") {
        this.stats.cooled += 1;
        this.onStatus({ phase: "cooldown" });
        return { skipped: "cooldown" };
      }

      const deferred = this.guard.begin(key);
      const job = { key, event, attempts: 0, deferred };
      const priority = options.priority === undefined ? 1 : options.priority;
      const push = this.queue.push(job, priority);

      if (push.dropped) {
        this.stats.dropped += 1;
        this.guard.settle(push.dropped.key, {
          ok: false,
          error: new SolverError("queue_full")
        });
        this.onStatus({ phase: "queue_full" });
      }

      this.kick();
      return deferred.promise;
    }

    kick() {
      if (this.running) return;
      this.loop();
    }

    async loop() {
      if (this.running) return;
      this.running = true;
      try {
        for (;;) {
          if (this.disposed) break;
          const job = this.queue.shift();
          if (!job) {
            this.running = false;
            if (this.queue.size > 0) {
              this.running = true;
              continue;
            }
            break;
          }
          await this.runJob(job);
        }
      } finally {
        this.running = false;
      }
    }

    async runJob(job) {
      const request = this.toRequest(job.event);
      if (!request) {
        this.fail(job, new SolverError("empty_answer"));
        return;
      }

      for (;;) {
        const config = this.config();
        if (this.disposed) {
          this.fail(job, new SolverError("aborted"));
          return;
        }

        const gap = Number(config.minCallIntervalMs || 0) - (this.now() - this.lastCallAt);
        if (gap > 0) await this.sleep(gap);
        this.lastCallAt = this.now();

        const controller = typeof AbortController === "function" ? new AbortController() : null;
        this.inflight = controller;
        this.onStatus({ phase: "solving", key: job.key });

        try {
          const result = await this.solver.solve(request, {
            signal: controller ? controller.signal : undefined
          });
          this.inflight = null;
          this.stats.solved += 1;
          this.guard.settle(job.key, { ok: true, value: result });
          this.onAnswer(job.event, result, request);
          return;
        } catch (error) {
          this.inflight = null;
          const normalize = normalizeError(error);
          if (normalize.code === "aborted") {
            this.fail(job, normalize, true);
            return;
          }
          const retryable = normalize.retryable && job.attempts < Number(config.retryCount || 0);
          if (retryable) {
            job.attempts += 1;
            this.onStatus({ phase: "retrying", attempt: job.attempts });
            await this.sleep(Number(config.retryBackoffMs || 0) * job.attempts);
            continue;
          }
          this.fail(job, normalize);
          return;
        }
      }
    }

    fail(job, error, silent) {
      this.stats.failed += 1;
      this.guard.settle(job.key, { ok: false, error });
      if (!silent) this.onError(job.event, error);
    }

    clear() {
      const removed = this.queue.clear();
      for (const job of removed) {
        this.guard.settle(job.key, { ok: false, error: new SolverError("aborted") });
      }
      return removed.length;
    }

    dispose() {
      this.disposed = true;
      this.clear();
      if (this.inflight && typeof this.inflight.abort === "function") this.inflight.abort();
      this.inflight = null;
    }
  }

  const api = { SolvePipeline, normalizeError };

  if (isNode) module.exports = api;
  else root.KC.core.Pipeline = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
