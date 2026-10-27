# 消息协议

两套通道：页内 `postMessage`（内容脚本 ↔ 页面世界）与 `runtime.sendMessage`（内容脚本/设置页 ↔ 后台）。
两者都带版本号，版本不匹配时静默丢弃——这样旧内容脚本不会误读新格式。

## 一、页内通道

- 页面世界 → 内容脚本：`source: "quiz-hint"`
- 内容脚本 → 页面世界：`source: "quiz-hint-content"`
- 双向 `v: 1`，`targetOrigin = location.origin`（不是 `"*"`）
- 内容脚本侧三重校验：`event.source === window`、`event.origin === location.origin`、`data.source` + `data.v`

| kind | 方向 | 其他字段 | 说明 |
|---|---|---|---|
| `ws-hook-ready` | page → content | `href` | 钩子安装完成 |
| `pong` | page → content | `hookVersion` | 对 `ping` 的应答 |
| `ws-open` | page → content | `socketId`, `url` | 有新 socket 建立 |
| `ws-frame` | page → content | `socketId`, `url`, `direction`, `payload`, `at` | 帧内容，`direction` 恒为 `"received"` |
| `ping` | content → page | — | 握手探测，最多 8 次 |

页面钩子只转发 `typeof event.data === "string"` 且长度 ≤ 256 KiB 的帧；二进制帧直接丢弃。

内容脚本在第一个订阅者出现之前最多缓冲 32 帧，超出丢弃最旧的。

## 二、runtime 消息

所有类型带 `kc.` 前缀。发送方校验规则：

| 类型 | 允许的 sender | 返回 |
|---|---|---|
| `kc.config.get` | 游戏标签页（`sender.tab` 且 URL 匹配 kahoot.it 或 localhost） | public 区配置 |
| `kc.solve` | 同上 | `{ ok, result }` 或 `{ ok:false, error }` |
| `kc.ui.getConfig` | 扩展页面（`!sender.tab`） | `{ ok, public, secret(已脱敏), flags }` |
| `kc.ui.savePublic` | 扩展页面 | `{ ok, public, flags }` |
| `kc.ui.saveSecret` | 扩展页面 | `{ ok, secret(已脱敏), flags }` |
| `kc.ui.listModels` | 扩展页面 | `{ ok, models, url }` |
| `kc.config.changed` | 后台 → 内容脚本（`tabs.sendMessage`） | — |

### 求解请求

```json
{
  "type": "kc.solve",
  "request": {
    "question": "Which planet has the most moons?",
    "options": [
      { "id": 0, "text": "Saturn", "placeholder": false },
      { "id": 1, "text": "Jupiter", "placeholder": false }
    ],
    "kind": "single",
    "optionsArePlaceholders": false,
    "imageUrl": null
  }
}
```

`kind` 取值：`single` / `multi` / `order` / `slider` / `short`。

### 求解结果

```json
{
  "ok": true,
  "result": {
    "answerText": "Saturn",
    "optionIds": [0],
    "target": "option",
    "confidence": 0.92,
    "reason": "Saturn has 146 confirmed moons",
    "model": "gpt-4o-mini",
    "provider": "OpenAI compatible",
    "source": "ai",
    "elapsedMs": 1180,
    "diagnostics": { "idAdjusted": false, "salvaged": false, "raw": "" }
  }
}
```

`target` 语义：

| 值 | 含义 | 浮层表现 |
|---|---|---|
| `option` | 已定位到具体选项 | 高亮该行 |
| `text` | 只有答案文本，没有可用选项 | 只显示文本 |
| `unmapped` | 选项是占位符且无法定位 | 显示文本 + 琥珀色提示，不高亮任何行 |

### 错误

```json
{ "ok": false, "error": { "code": "timeout", "message": "...", "retryable": true, "provider": "OpenAI compatible" } }
```

错误码：`no_api_key` / `invalid_endpoint` / `model_not_found` / `http_4xx` / `http_5xx` / `rate_limited` / `network` / `timeout` / `parse_failed` / `empty_answer` / `aborted` / `queue_full` / `no_adapter`。

可重试：`http_5xx`、`rate_limited`、`network`、`timeout`、`parse_failed`、`empty_answer`。其余一律不重试。

## 三、模型输出契约

模型必须返回单个 JSON 对象：

```json
{ "answer_text": "Saturn", "answer_options": [0], "confidence": 0.92, "reason": "brief" }
```

- `answer_text` 是**主答案**，必须是给定选项的逐字拷贝（有选项时）
- `answer_options` 可选，只在索引对应的文本确实等于答案时才给
- 解析器以文本为准：文本非空时用 `fuzzyScore`（阈值 0.72）校正索引，冲突时覆盖并置 `diagnostics.idAdjusted = true`

这条"文本优先"规则是本项目与参考实现最重要的差异——参考实现只要有 options 就用索引覆盖文本，会答错。
