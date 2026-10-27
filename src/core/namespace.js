/*
 * 命名空间与模块注册器。
 * 浏览器：所有模块挂到 globalThis.KC 下，靠 manifest 的 js 数组顺序加载。
 * Node：每个 core 模块通过 module.exports 暴露，可直接被 node --test 引用。
 */
(function (root) {
  "use strict";

  const KC = root.KC || (root.KC = {});
  KC.version = 1;
  KC.core = KC.core || {};
  KC.adapters = KC.adapters || {};
  KC.content = KC.content || {};
  KC.bg = KC.bg || {};

  function lookup(path) {
    return path.split(".").reduce((node, key) => (node == null ? node : node[key]), KC);
  }

  KC.assertReady = function assertReady(paths) {
    const missing = paths.filter((path) => lookup(path) === undefined);
    if (missing.length) {
      throw new Error(
        `[KC] 模块未加载或加载顺序错误：${missing.join(", ")}。请检查 manifest 中的 js 数组顺序。`
      );
    }
  };

  if (typeof module === "object" && module.exports) module.exports = KC;
})(typeof globalThis !== "undefined" ? globalThis : this);
