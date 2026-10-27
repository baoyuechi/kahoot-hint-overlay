/*
 * 适配器注册表：核心只认这个接口，不认识任何具体平台。
 */
(function (root) {
  "use strict";

  function hostMatches(pattern, host) {
    const value = String(host || "").toLowerCase();
    const rule = String(pattern || "").toLowerCase();
    if (!rule || !value) return false;
    if (rule.startsWith("*.")) {
      const base = rule.slice(2);
      return value === base || value.endsWith(`.${base}`);
    }
    return value === rule;
  }

  const registry = {
    items: [],

    register(descriptor) {
      if (!descriptor || !descriptor.id) throw new Error("[KC] adapter 缺少 id");
      if (typeof descriptor.createExtractor !== "function") {
        throw new Error(`[KC] adapter ${descriptor.id} 缺少 createExtractor`);
      }
      registry.items.push(descriptor);
      return descriptor;
    },

    all() {
      return registry.items.slice();
    },

    resolve(location, overrideId) {
      if (overrideId && overrideId !== "auto") {
        return registry.items.find((item) => item.id === overrideId) || null;
      }
      const host = location && (location.hostname || "");
      return registry.items.find((item) => (item.matches || []).some((pattern) => hostMatches(pattern, host))) || null;
    },

    hostMatches
  };

  if (typeof module === "object" && module.exports) module.exports = registry;
  else root.KC.adapters.registry = registry;
})(typeof globalThis !== "undefined" ? globalThis : this);
