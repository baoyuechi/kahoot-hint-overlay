/*
 * 适配器描述符：注册到 registry，供内容脚本按站点解析。
 */
(function (root) {
  "use strict";

  const isNode = typeof module === "object" && !!module.exports;
  const extractorModule = isNode
    ? require("./extractor.js")
    : (root.KC.adapters.kahootExtractor || {});
  const frameSourceModule = isNode
    ? require("./frame-source.js")
    : (root.KC.adapters.BridgeFrameSource || {});
  const Profile = isNode ? require("./dom-profile.js") : root.KC.adapters.kahootProfile;

  const descriptor = {
    id: "kahoot",
    label: "Kahoot",
    matches: ["kahoot.it", "*.kahoot.it"],
    domProfile: Profile,

    createFrameSource(deps = {}) {
      return new frameSourceModule.BridgeFrameSource({ bridge: deps.bridge });
    },

    createExtractor() {
      return new extractorModule.KahootQuestionExtractor({ profile: Profile });
    }
  };

  if (isNode) {
    module.exports = descriptor;
  } else {
    root.KC.adapters.kahoot = descriptor;
    if (root.KC.adapters.registry) root.KC.adapters.registry.register(descriptor);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
