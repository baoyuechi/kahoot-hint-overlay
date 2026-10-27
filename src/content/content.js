/*
 * 内容脚本入口：解析适配器 → 装配四个实现 → 启动流水线。
 * 这里没有任何点击、提交、写 DOM 输入框的代码。
 */
(function (root) {
  "use strict";

  const KC = root.KC;
  if (!KC || !KC.content || !KC.core) return;

  try {
    KC.assertReady([
      "core.Pipeline",
      "core.Dedupe",
      "core.Queue",
      "core.QuestionEvent",
      "core.SolveRequest",
      "core.ViewModel",
      "core.DomReader",
      "adapters.registry",
      "content.messages",
      "content.Logger",
      "content.PageBridge",
      "content.ConfigClient",
      "content.SolverClient",
      "content.Presenter"
    ]);
  } catch (error) {
    console.error(error);
    return;
  }

  const { QuestionEvent } = KC.core.QuestionEvent;
  const { parseFrame } = KC.core.QuestionEvent;
  const { SolvePipeline } = KC.core.Pipeline;
  const { DedupeGuard } = KC.core.Dedupe;
  const { BoundedQueue } = KC.core.Queue;
  const { toSolveRequest } = KC.core.SolveRequest;
  const { buildAnswerView } = KC.core.ViewModel;
  const { snapshot, readQuestion } = KC.core.DomReader;

  const HOOK_WAIT_MS = 1600;
  const INJECT_DELAY_MS = 500;
  const DOM_POLL_MS = 600;

  async function main() {
    const messages = KC.content.messages;
    const { Logger } = KC.content.Logger;
    const { PageBridge } = KC.content.PageBridge;
    const { ConfigClient } = KC.content.ConfigClient;
    const { BridgeSolver } = KC.content.SolverClient;
    const { Presenter } = KC.content.Presenter;

    const configClient = new ConfigClient({ messages });
    await configClient.init();

    const logger = new Logger(() => configClient.get());
    const presenter = new Presenter({ getConfig: () => configClient.get(), logger });
    presenter.mount();

    let adapter = KC.adapters.registry.resolve(location, configClient.get().adapterId);
    if (!adapter && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      // 本地 mock 页没有站点匹配规则，开发时回退到第一个已注册适配器
      adapter = KC.adapters.registry.all()[0] || null;
    }
    if (!adapter) {
      presenter.setStatus({ phase: "error", text: "当前站点没有匹配的适配器" });
      return;
    }

    const extractor = adapter.createExtractor();
    const profile = adapter.domProfile || {};
    const bridge = new PageBridge({ logger });
    const frameSource = adapter.createFrameSource({ bridge });
    const solver = new BridgeSolver({ messages, getConfig: () => configClient.get(), logger });

    let current = null;
    let pendingKey = null;
    let degraded = false;

    const pipeline = new SolvePipeline({
      solver,
      config: () => configClient.get(),
      guard: new DedupeGuard({
        cooldownMs: configClient.get().cooldownMs
      }),
      queue: new BoundedQueue(configClient.get().queueCapacity),
      onAnswer(event, result) {
        const view = buildAnswerView(event, result, configClient.get());
        presenter.showAnswer(view);
        logger.log("answer", { q: view.question, a: view.answerText, target: view.target });
      },
      onError(event, error) {
        presenter.setStatus({ phase: "error", text: String(error.message || error) });
        logger.warn("solve failed", error);
      },
      onStatus(status) {
        if (status.phase === "solving") {
          presenter.setStatus({ phase: "solving", text: "正在求解…" });
        } else if (status.phase === "retrying") {
          presenter.setStatus({ phase: "solving", text: "重试中…" });
        } else if (status.phase === "cooldown") {
          presenter.setStatus({ phase: "cooldown", text: "同一题的冷却中，已跳过" });
        } else if (status.phase === "queue_full") {
          presenter.setStatus({ phase: "cooldown", text: "队列已满，丢弃了最旧的一题" });
        }
      }
    });

    function stableKey(event) {
      if (event.questionIndex !== null && event.questionIndex !== undefined) {
        return `idx:${event.questionIndex}|type:${event.questionType}`;
      }
      return event.dedupeKey;
    }

    function remember(event) {
      const sameIndex =
        !current ||
        current.questionIndex === null ||
        event.questionIndex === null ||
        current.questionIndex === event.questionIndex;
      current = sameIndex ? QuestionEvent.merge(current, event) : event;
      return current;
    }

    async function handle(event, priority) {
      const config = configClient.get();
      if (!config.enabled) {
        presenter.setStatus({ phase: "idle", text: "已暂停" });
        return;
      }
      if (!config.autoSolve) {
        presenter.setStatus({ phase: "idle", text: "自动求解已关闭" });
        return;
      }

      const merged = remember(event);
      presenter.setStatus({
        phase: "idle",
        text: merged.hasUsableText() ? "已拿到题干，准备求解…" : "已收到题目，但题干为空",
        questionIndex: merged.questionIndex
      });
      if (!merged.hasUsableText()) return;

      const key = stableKey(merged);
      const needsEnrich =
        merged.options.length > 0 &&
        KC.core.QuestionEvent.optionsArePlaceholders(merged.options) &&
        typeof extractor.enrich === "function" &&
        pendingKey !== key;

      let finalEvent = merged;
      if (needsEnrich && config.domWaitMs > 0) {
        pendingKey = key;
        try {
          finalEvent = await extractor.enrich(merged, {
            document,
            deadlineMs: config.domWaitMs,
            view: window
          });
        } catch (error) {
          logger.warn("enrich 失败，使用帧内信息继续", error);
        } finally {
          pendingKey = null;
        }
      }

      pipeline.submit(finalEvent, { priority, key: stableKey(finalEvent) });
    }

    frameSource.start((frame) => {
      let extractions = [];
      try {
        extractions = extractor.extract(frame);
      } catch (error) {
        logger.error("extract 抛错", error);
        return;
      }
      for (const item of extractions) {
        if (item.phase === "ignore") continue;
        handle(item.event, item.phase === "reveal" ? 0 : 1).catch((error) => logger.error("handle 异常", error));
      }
    });

    bridge.start();
    bridge.onReady = () => logger.log("帧通道已就绪");

    // Firefox 没有 world:"MAIN"，需要在 document_start 立刻注入页面钩子；
    // Chrome 已由 manifest 声明式注入，此处重复注入会被 __KC_HOOK_V1__ 幂等挡住。
    bridge.injectScript(messages.getURL("src/page/page-hook.js"));

    function startDomFallback() {
      if (degraded) return;
      degraded = true;
      presenter.setStatus({
        phase: "idle",
        text: "未捕获到实时数据，已降级为读取页面题干"
      });
      let lastQuestion = "";
      setInterval(() => {
        const info = snapshot(document, profile, window);
        if (!info.question || info.question === lastQuestion) return;
        lastQuestion = info.question;
        const event = new QuestionEvent({
          question: info.question,
          options: info.options,
          optionCount: info.optionCount,
          questionType: "quiz",
          source: "dom"
        });
        handle(event, 1).catch((error) => logger.error("dom fallback 异常", error));
      }, DOM_POLL_MS);
    }

    setTimeout(() => {
      if (bridge.isReady()) return;
      logger.warn("hook 尚未就绪，重试注入 page-hook");
      bridge.injectScript(messages.getURL("src/page/page-hook.js"));
    }, INJECT_DELAY_MS);

    setTimeout(() => {
      if (bridge.isReady()) return;
      const question = readQuestion(document, profile);
      if (question) startDomFallback();
      else {
        presenter.setStatus({
          phase: "error",
          text: "未能捕获题目数据（hook 未生效且页面暂无题干）"
        });
      }
    }, HOOK_WAIT_MS);

    configClient.onChange(() => {
      presenter.applyConfig();
      presenter.setEnabled(configClient.get().enabled !== false);
    });

    presenter.setEnabled(configClient.get().enabled !== false);
    presenter.setStatus({ phase: "idle", text: "监听中，等待题目" });
    logger.log("content 启动完成", { adapter: adapter.id, degraded: false });
  }

  main().catch((error) => {
    console.error("[KC] 启动失败", error);
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
