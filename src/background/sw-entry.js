/*
 * Chrome MV3 Service Worker 入口：按依赖顺序 importScripts。
 * Firefox MV2 由 manifest 的 background.scripts 数组承担同样的顺序。
 */
importScripts(
  "../core/namespace.js",
  "../core/text.js",
  "../core/config.js",
  "../core/errors.js",
  "../core/prompt.js",
  "../core/answer-parser.js",
  "http.js",
  "config-store.js",
  "providers/openai.js",
  "providers/gemini.js",
  "providers/anthropic.js",
  "ai-router.js",
  "model-catalog.js",
  "main.js"
);
