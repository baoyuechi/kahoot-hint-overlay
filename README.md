# Quiz Hint Overlay

一个**只读展示**的浏览器扩展：从页面 WebSocket 帧里截获题干，发给你自己的大模型接口，然后把答案显示在页面右下角的浮层里——**由你自己决定点不点**。

## 边界（写进代码里的三条硬约束）

| 不做 | 怎么保证 |
|---|---|
| 不自动点击、不伪造答题帧 | `Presenter` 接口里没有 `click()` / `submit()`；页面钩子不 patch `socket.send` |
| 不查题库、不碰任何 Kahoot REST 接口 | 后台没有任何题库客户端；manifest 不申请 `create.kahoot.it` 权限 |
| 不拍照、不截屏 | 没有相机模块；不申请 camera 权限 |

`page-click` 这类"内容脚本 → 页面"的反向通道在参考实现里是自动点击的基础，本项目中**整体删除**，从架构上不留发送能力。

> 仅用于个人学习、无障碍辅助与自测。在任何评分场景使用都可能违反平台条款与所在机构的学术规范，请自行判断。

## 工作方式

```
页面 WebSocket ──► page-hook（页面世界）
                        │ postMessage(origin 校验)
                        ▼
                  content（隔离世界）──► background ──► 你的 AI 接口
                        │                                    │
                        └────── 浮层显示答案 ◄───────────────┘
                                       │
                                  人来点按钮
```

## 安装

### Chrome / Edge

1. `./build.sh` 生成 `dist/chrome.zip`，解压
2. `chrome://extensions` → 打开开发者模式 → 加载已解压的扩展程序 → 选择解压目录

### Firefox

1. `./build.sh` 生成 `dist/firefox.zip`，解压
2. `about:debugging#/runtime/this-firefox` → 临时载入附加组件 → 选择 `manifest.json`

## 配置

点击工具栏图标，按需填任意一家：

- **OpenAI 兼容**：接口地址 + Key + 模型（可点「加载模型目录」自动发现）
- **Gemini 兼容**：接口地址 + Key + 模型
- **Anthropic Messages 兼容**：接口地址 + Key + 模型

API Key 只存在后台上下文，**内容脚本永远拿不到**（`kc.config.get` 只返回 public 区）。设置页里的 Key 输入框只写不读，已保存时显示"已保存（留空表示不修改）"。

关键开关：

| 开关 | 作用 |
|---|---|
| 启用 | 总开关 |
| 拿到题干后自动求解 | 关掉后只监听不请求，省钱 |
| 同题冷却 (ms) | 同一道题在窗口内不重复请求，默认 8000 |
| 队列容量 | 连发多题时的缓冲，默认 4，满时丢最旧 |
| 选项无法定位时显示提示 | 选项是彩色占位符时给出明确警告 |
| Mock 求解 | 不联网返回假答案，用于验证链路 |

## 开发

```bash
npm test        # 55 条单测，零依赖
./build.sh      # 产出 dist/{chrome,firefox}/*.zip
./build.sh dev  # 额外产出一份把 localhost:8000 加进 matches 的清单
```

本地端到端验证：

```bash
cd test/mock && python3 -m http.server 8000
```

用 `dist/dev`（或把 `manifest.json` 的 `matches` 临时加上 `http://localhost:8000/*`）加载扩展，打开 `http://localhost:8000/mock-kahoot.html`，配合"Mock 求解"开关即可断网验证整条链路。

### 目录

```
src/core/        平台无关：题目模型、去重、队列、提示词、解析、视图模型、流水线
src/adapters/    唯一知道具体平台的地方（目前只有 kahoot）
src/page/        页面世界钩子（自包含，不依赖 KC 命名空间）
src/content/     内容脚本：桥、配置、求解客户端、浮层
src/background/  三家 Provider、路由、配置存储
src/ui/          设置页
test/unit/       零依赖单测（node:test）
test/mock/       可主动推帧的本地页面
```

### 换一个平台

核心不认识任何站点。要接新平台，只需要实现一个适配器：

```js
KC.adapters.registry.register({
  id: "yourplatform",
  label: "Your Platform",
  matches: ["example.com", "*.example.com"],
  domProfile: { questionSelectors: [...], optionSelector: "...", optionTextSelectors: [...] },
  createFrameSource: ({ bridge }) => new YourFrameSource({ bridge }),
  createExtractor: () => new YourExtractor()
});
```

`createExtractor()` 返回的对象需要实现：

```js
{
  accepts(frame): boolean,
  extract(frame): Array<{ phase: "question"|"reveal"|"ignore", event, reason }>,
  enrich?(event, { document, deadlineMs }): Promise<QuestionEvent>,
  domProfile?
}
```

`extract` 必须是纯函数且**绝不抛错**（坏数据返回 `ignore`），`enrich` 用于从 DOM 补全缺失的选项文本。

## 已知限制

- 页面把"题干和选项都不下发"时（host 关掉了"在玩家设备显示题目"），客户端没有任何信息可用，浮层会提示需要人工处理。
- 选项是纯颜色占位符时，模型只能给出答案文本、无法确定是第几个按钮，浮层会显示明确提示而不是猜一个索引。
- 题目带图片时不会发送图片，只按文字作答，并在提示词里降低了置信度预期。

## 致谢

结构上受益于 [MintOcha/KahootExt](https://github.com/MintOcha/KahootExt) 的分层思路，但去掉了它的自动点击、相机与题库缓存三块，并修掉了若干缺陷（双重 patch、丢帧、Key 下发、文本被索引覆盖等）。
