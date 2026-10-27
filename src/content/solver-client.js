/*
 * Solver 的内容脚本实现：把求解请求丢给后台，并加上超时与取消。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const Errors = isNode ? require("../core/errors.js") : root.KC.core.Errors;
  const { SolverError } = Errors;

  function withTimeout(promise, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal && onAbort) signal.removeEventListener("abort", onAbort);
        fn(value);
      };
      const timer = setTimeout(() => finish(reject, new SolverError("timeout")), Math.max(1, timeoutMs));
      const onAbort = signal
        ? () => finish(reject, new SolverError("aborted"))
        : null;
      if (signal) {
        if (signal.aborted) {
          finish(reject, new SolverError("aborted"));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
      promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
    });
  }

  function mockSolve(request) {
    const first = (request.options || [])[0];
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          answerText: request.options.length ? first.text : "MOCK ANSWER",
          optionIds: request.options.length ? [first.id] : [],
          target: request.options.length ? "option" : "text",
          confidence: 0.9,
          reason: "mock solver",
          model: "mock",
          provider: "mock",
          source: "mock",
          elapsedMs: null
        });
      }, 350);
    });
  }

  class BridgeSolver {
    constructor(deps = {}) {
      this.messages = deps.messages;
      this.getConfig = typeof deps.getConfig === "function" ? deps.getConfig : () => ({});
      this.logger = deps.logger || { warn() {} };
    }

    async solve(request, context = {}) {
      const config = this.getConfig();
      if (config.mockSolver) return mockSolve(request);

      const timeoutMs = Number(config.solveTimeoutMs) || 20000;
      let response;
      try {
        response = await withTimeout(
          this.messages.send({ type: "kc.solve", request }),
          timeoutMs,
          context.signal
        );
      } catch (error) {
        if (error instanceof SolverError) throw error;
        throw new SolverError("network", { message: error && error.message, cause: error });
      }

      if (!response || typeof response !== "object") {
        throw new SolverError("network", { message: "后台没有返回结果" });
      }
      if (response.ok === false) {
        const info = response.error || {};
        throw new SolverError(info.code || "network", {
          message: info.message,
          retryable: info.retryable,
          provider: info.provider,
          httpStatus: info.httpStatus
        });
      }
      if (!response.result) {
        throw new SolverError("empty_answer");
      }
      return response.result;
    }
  }

  const api = { BridgeSolver, withTimeout, mockSolve };

  if (isNode) module.exports = api;
  else root.KC.content.SolverClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
