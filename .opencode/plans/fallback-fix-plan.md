# Fallback 修复方案 — 实施计划

## 方式 A：可选参数传 fallbackClient

---

## 步骤 1：DeepSeekClient 加 generatePlan 方法

**文件**：`server/lib/model-clients/deepseek-client.js`

新增方法 `generatePlan(prompt, context = '')`：
- 构造与 KimiClient 类似的 system/user prompt
- 使用 `json_mode: true`
- 返回 `JSON.parse(response)`
- 不需要 `suggested_skills`（纯 fallback，不做推荐）

```js
async generatePlan(prompt, context = '') {
  const messages = [{
    role: 'system',
    content: 'You are an expert planning agent. Generate a structured plan in JSON format with title and items array.',
  }, {
    role: 'user',
    content: `Task: ${prompt}\nContext: ${context}\n\nGenerate a structured plan.`
  }];

  const response = await this.chat(messages, { json_mode: true, max_tokens: 8000 });
  return JSON.parse(response);
}
```

---

## 步骤 2：KimiClient 的 generatePlan 支持可选的 fallbackClient

**文件**：`server/lib/model-clients/kimi-client.js`

```js
async generatePlan(prompt, context = '', fallbackClient = null) {
  const messages = [...];  // 不变

  const response = await this.chatWithFallback(messages, { json_mode: true, max_tokens: 8000 }, fallbackClient);
  const content = response._fallback ? response.content : response;
  return this.parsePlan(content);
}
```

对 `analyzeTaskMode` 同理（但 fallbackClient 一般传 null 即可，已有默认 build mode）：

```js
async analyzeTaskMode(task, context = '', fallbackClient = null) {
  const messages = [...];  // 不变

  const response = await this.chatWithFallback(messages, { json_mode: true, max_tokens: 500 }, fallbackClient);
  const content = response._fallback ? response.content : response;
  return JSON.parse(content);
}
```

注意：`chatWithFallback` 返回 `{ content, _fallback, _fallback_from, _fallback_to }`，所以需要统一处理返回格式。

---

## 步骤 3：更新 index.js 传入 deepseekClient

**文件**：`index.js`

`executePlanTask` 函数签名已包含 `deepseekClient`，直接传入：

```js
planDoc = await kimiClient.generatePlan(task, context, deepseekClient);
// 原来：planDoc = await kimiClient.generatePlan(task, context);
// 同时移除 `generatePlan` 上原有的包装 try-catch（chatWithFallback 内部会处理）
```

---

## 步骤 4：更新 plan.js 传入 deepseekClient

**文件**：`server/api/plan.js`

`createPlan` 方法中同：

```js
planDoc = await this.kimiClient.generatePlan(prompt, context, this.deepseekClient);
// 原来：planDoc = await this.kimiClient.generatePlan(prompt, context);
```

---

## 步骤 5：更新测试文件

### tests/fallback.test.js — 追加真实 fallback 测试

新增三方测试：
1. DeepSeekClient.generatePlan 正常调用 → 返回 title + items
2. KimiClient 失败时 fallback 到 DeepSeek → _fallback=true
3. KimiClient + DeepSeek 都失败 → 抛 "Both failed"

---

## 实施顺序

```
Step 1: DeepSeekClient + generatePlan
    ↓
Step 2: KimiClient + fallbackClient 参数
    ↓
Step 3: index.js 传参
    ↓
Step 4: plan.js 传参
    ↓
Step 5: 测试验证
```

## 验证方式

```bash
# 单元测试
bun test tests/fallback.test.js

# 真实 API fallback 测试（设 kimi base_url 为错误地址）
FORCE_REAL_API=true bun test tests/fallback.test.js

# 全量
bun test
```
