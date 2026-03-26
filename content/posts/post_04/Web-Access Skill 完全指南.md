+++
title = 'Web-Access Skill 完全指南'

date = 2026-03-26T00:00:00+08:00

draft = false

Tags = ["AI", "opencode", "CDP", "Browser"]

+++

> 本文档记录了 web-access skill 在 opencode 环境下的安装、配置过程，以及遇到的问题和解决方案。

## 目录

- [什么是 web-access skill](#什么是-web-access-skill)
- [核心原理](#核心原理)
- [安装步骤](#安装步骤)
- [CDP 模式配置](#cdp-模式配置)
- [遇到的问题与解决方案](#遇到的问题与解决方案)
- [针对 Dia/opencode 的修改清单](#针对-diaopencode-的修改清单)
- [API 参考](#api-参考)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)

---

## 什么是 web-access skill

web-access 是一个为 AI Agent 提供完整联网能力的 skill，它补足了 Agent 在以下方面的能力：

| 能力 | 说明 |
|------|------|
| 联网工具自动选择 | WebSearch / WebFetch / curl / Jina / CDP，按场景自主判断 |
| CDP Proxy 浏览器操作 | 直连用户日常浏览器，天然携带登录态，支持动态页面、交互操作 |
| 并行分治 | 多目标时分发子 Agent 并行执行，共享一个 Proxy，tab 级隔离 |
| 站点经验积累 | 按域名存储操作经验，跨 session 复用 |

**GitHub**: https://github.com/eze-is/web-access

---

## 核心原理

### 架构图

```text
┌─────────────────────────────────────────────────────────────┐
│                        opencode Agent                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    web-access skill                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 浏览哲学    │  │ 工具选择    │  │ 站点经验            │  │
│  │ (SKILL.md)  │  │ 策略        │  │ (references/)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CDP Proxy (HTTP API)                      │
│                    localhost:3456                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Chrome DevTools Protocol (CDP)                  │
│              WebSocket 连接到浏览器                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    用户浏览器 (Dia/Chrome/Arc)               │
│                    天然携带登录态                            │
└─────────────────────────────────────────────────────────────┘
```text

### 关键组件

1. **SKILL.md**: 核心 skill 文件，包含浏览哲学、工具选择策略、操作指南
2. **cdp-proxy.mjs**: Node.js 服务，提供 HTTP API 来操控浏览器
3. **check-deps.sh**: 环境检查脚本，验证依赖并启动 proxy
4. **references/**: 参考文档和站点经验存储

### 工具选择策略

| 场景 | 推荐工具 |
|------|---------|
| 搜索摘要或关键词结果 | WebSearch |
| URL 已知，需要从页面提取特定信息 | WebFetch |
| URL 已知，需要原始 HTML 源码 | curl |
| 需要登录态、交互操作、动态页面 | 浏览器 CDP |

---

## 安装步骤

### 1. 克隆仓库到 opencode skills 目录

```bash
# 创建 skills 目录（如果不存在）
mkdir -p ~/.config/opencode/skills

# 克隆 web-access 仓库
git clone https://github.com/eze-is/web-access.git ~/.config/opencode/skills/web-access
```text

### 2. 验证目录结构

```bash
ls -la ~/.config/opencode/skills/web-access/

# 预期输出：
# SKILL.md
# scripts/
#   ├── cdp-proxy.mjs
#   └── check-deps.sh
# references/
#   ├── cdp-api.md
#   └── site-patterns/
```text

### 3. 设置执行权限

```bash
chmod +x ~/.config/opencode/skills/web-access/scripts/*.sh
chmod +x ~/.config/opencode/skills/web-access/scripts/*.mjs
```text

### 4. 验证 skill 已被识别

opencode 会在启动时自动扫描 `~/.config/opencode/skills/*/SKILL.md`，skill 的 frontmatter 格式如下：

```yaml
---
name: web-access
license: MIT
description:
  所有联网操作必须通过此 skill 处理，包括：搜索、网页抓取、登录后操作等。
metadata:
  author: 一泽Eze
  version: "2.4.0"
---
```text

---

## CDP 模式配置

### 前置要求

- **Node.js 22+**: CDP Proxy 使用原生 WebSocket
- **浏览器**: Chrome / Dia / Arc / Brave 等 Chromium 系浏览器

### 必须使用命令行启动浏览器

**重要**: Dia 浏览器基于 Arc 架构，有额外的安全限制。必须使用命令行参数启动：

```bash
# macOS - Dia（推荐）
/Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222

# macOS - Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# macOS - Arc
/Applications/Arc.app/Contents/MacOS/Arc --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```text

### 为什么不能用 chrome://inspect 方式？

Dia/Arc 等基于 Arc 架构的浏览器在使用 `chrome://inspect/#remote-debugging` 勾选方式开启调试时，有以下限制：

1. **Origin 验证**: 只允许来自 `chrome://inspect` 的 WebSocket 连接
2. **外部连接被拒绝**: 其他来源的连接返回 `403 Forbidden`
3. **错误信息示例**:
   ```
   Rejected an incoming WebSocket connection from the chrome://inspect origin.
   Use --remote-allow-origins=* to allow all origins.
   ```

使用 `--remote-debugging-port=9222` 参数启动可以绑过这个限制。

### 验证配置

```bash
# 1. 先用命令行启动浏览器（在另一个终端）
/Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222

# 2. 运行环境检查
bash ~/.config/opencode/skills/web-access/scripts/check-deps.sh

# 预期输出：
# node: ok (v25.x.x)
# dia/chrome: ok (port 9222)
# proxy: ready
```text

### 验证 HTTP 调试端点

```bash
# 检查浏览器调试端口是否正常
curl -s http://127.0.0.1:9222/json/version

# 预期输出包含 webSocketDebuggerUrl：
# {
#   "Browser": "Chrome/146.0.7680.154",
#   "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/browser/xxx"
# }
```text

---

## 遇到的问题与解决方案

### 问题 1：Dia 浏览器 WebSocket 连接被拒绝（403 Forbidden）

**现象**：
```text
[CDP Proxy] 连接错误: 连接失败
```text

**调试过程**：
```bash
# 使用 TCP 测试发现返回 403
$ node -e "..." # 发送 WebSocket 握手请求

# 收到响应：
HTTP/1.1 403 Forbidden
Rejected an incoming WebSocket connection from the chrome://inspect origin.
Use the command line flag --remote-allow-origins=chrome://inspect to allow...
```text

**根本原因**：
- Dia 浏览器基于 Arc 架构，有额外的安全限制
- 使用 `chrome://inspect` 方式开启调试时，只允许来自 `chrome://inspect` 的连接
- 外部 WebSocket 连接被拒绝

**解决方案**：
使用 `--remote-debugging-port=9222` 参数启动浏览器：
```bash
/Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222
```text

### 问题 2：DevToolsActivePort 文件中的 WebSocket URL 失效

**现象**：
```text
# DevToolsActivePort 文件内容
9222
/devtools/browser/a4ab0f01-99b1-4908-9faa-988ab9576db1

# 但 /json/version 返回的 URL 不同
"webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/browser/fa4d376d-5745-4911-87ea-809a07fc90ef"
```text

**根本原因**：
- `DevToolsActivePort` 文件中的 WebSocket URL 可能已过期
- 或者该 URL 有额外的访问限制
- `/json/version` 返回的 URL 是当前有效的

**解决方案**：修改 `cdp-proxy.mjs`，优先使用 `/json/version` 获取 WebSocket URL：

```javascript
// 修改后的 discoverChromePort 函数
async function discoverChromePort() {
  const commonPorts = [9222, 9229, 9333];
  
  for (const port of commonPorts) {
    const ok = await checkPort(port);
    if (ok) {
      // 优先从 /json/version 获取 WebSocket URL
      try {
        const http = await import('node:http');
        const wsUrl = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/json/version`, { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                if (json.webSocketDebuggerUrl) {
                  resolve(json.webSocketDebuggerUrl);
                } else {
                  reject(new Error('无 webSocketDebuggerUrl'));
                }
              } catch (e) {
                reject(e);
              }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        return { port, wsUrl };
      } catch {
        // /json/version 不可用，回退到 DevToolsActivePort
      }
    }
  }
  // ... 回退逻辑
}
```text

### 问题 3：Dia 浏览器配置路径未识别

**现象**：
```text
chrome: not connected — 请打开 chrome://inspect/#remote-debugging
```text

**原因**：原 skill 只支持标准 Chrome 路径，不支持 Dia 浏览器。

**解决方案**：修改 `check-deps.sh` 和 `cdp-proxy.mjs`，添加 Dia 的配置路径：

```javascript
// macOS 路径列表（Dia 优先）
case 'darwin':
  return [
    path.join(home, 'Library/Application Support/Dia/User Data/DevToolsActivePort'),
    path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
    // ...
  ];
```text

### 问题 4：opencode 与 Claude Code 路径差异

**现象**：skill 中的路径指向 `~/.claude/skills/`，在 opencode 中不存在。

**解决方案**：修改所有路径引用：

| Claude Code 原路径 | opencode 适配路径 |
|-------------------|------------------|
| `~/.claude/skills/web-access/` | `~/.config/opencode/skills/web-access/` |
| `${CLAUDE_SKILL_DIR}` | `${OPENCODE_SKILL_DIR}` 或直接使用绝对路径 |

---

## 针对 Dia/opencode 的修改清单

### 1. SKILL.md 修改

```diff
- bash ~/.claude/skills/web-access/scripts/check-deps.sh
+ bash ~/.config/opencode/skills/web-access/scripts/check-deps.sh

- Chrome remote-debugging：在 Chrome 地址栏打开 chrome://inspect/#remote-debugging...
+ Dia/Chrome remote-debugging：需要以调试模式启动浏览器：
+   - Dia: /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222
+   - Chrome: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

- 用户日常 Chrome 天然携带登录态
+ 用户日常 Dia 浏览器天然携带登录态

- 请在你的 Chrome 中登录 [网站名]
+ 请在你的 Dia 浏览器中登录 [网站名]

- ${CLAUDE_SKILL_DIR}/references/site-patterns/
+ ${OPENCODE_SKILL_DIR}/references/site-patterns/ 或 ~/.config/opencode/skills/web-access/references/site-patterns/
```text

### 2. cdp-proxy.mjs 修改

**修改 1**: 添加 Dia 浏览器路径支持
```javascript
// discoverChromePort 函数中的 possiblePaths
if (platform === 'darwin') {
  possiblePaths.push(
    path.join(home, 'Library/Application Support/Dia/User Data/DevToolsActivePort'),  // 新增
    path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
    // ...
  );
}
```text

**修改 2**: 优先使用 `/json/version` 获取 WebSocket URL（核心修改）
```javascript
// 新增逻辑：先扫描端口，尝试通过 HTTP API 获取有效的 WebSocket URL
for (const port of commonPorts) {
  const ok = await checkPort(port);
  if (ok) {
    try {
      const wsUrl = await fetchWebSocketUrlFromHttp(port);
      if (wsUrl) {
        console.log(`[CDP Proxy] 从 /json/version 获取 WebSocket URL (端口 ${port})`);
        return { port, wsUrl };
      }
    } catch {}
  }
}
```text

**修改 3**: 更新错误提示信息
```javascript
throw new Error(
  'Dia/Chrome 未开启远程调试端口。请在浏览器地址栏打开 chrome://inspect/#remote-debugging 并勾选 Allow remote debugging。\n' +
  '  或用以下方式启动浏览器：\n' +
  '  macOS: /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222\n' +
  '  或: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222\n' +
  '  Linux: google-chrome --remote-debugging-port=9222'
);
```text

### 3. check-deps.sh 修改

**修改 1**: 添加 Dia 浏览器路径
```javascript
case 'darwin':
  return [
    path.join(home, 'Library/Application Support/Dia/User Data/DevToolsActivePort'),  // 新增
    path.join(home, 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
    // ...
  ];
```text

**修改 2**: 更新提示信息
```bash
- echo "chrome: not connected — 请打开 chrome://inspect/#remote-debugging 并勾选 Allow remote debugging"
+ echo "dia/chrome: not connected — 请使用 --remote-debugging-port=9222 参数启动浏览器"
+ echo "  Dia: /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222"
+ echo "  Chrome: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222"
```text

### 4. references/cdp-api.md 修改

```diff
- 启动：node ~/.claude/skills/web-access/scripts/cdp-proxy.mjs &
+ 启动：node ~/.config/opencode/skills/web-access/scripts/cdp-proxy.mjs &

- 重启需 Chrome 重新授权
+ 重启需浏览器重新授权

- `Chrome 未开启远程调试端口` | 提示用户打开 chrome://inspect/#remote-debugging 并勾选 Allow
+ `Dia/Chrome 未开启远程调试端口` | 使用 --remote-debugging-port=9222 参数启动浏览器
```text

---

## API 参考

### 基础信息

- **地址**: `http://localhost:3456`
- **启动**: `node ~/.config/opencode/skills/web-access/scripts/cdp-proxy.mjs &`
- **停止**: `pkill -f cdp-proxy.mjs`

### API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/targets` | GET | 列出所有页面 tab |
| `/new?url=URL` | GET | 创建新后台 tab |
| `/close?target=ID` | GET | 关闭 tab |
| `/navigate?target=ID&url=URL` | GET | 导航到新 URL |
| `/back?target=ID` | GET | 后退一页 |
| `/info?target=ID` | GET | 页面信息 |
| `/eval?target=ID` | POST | 执行 JS |
| `/click?target=ID` | POST | JS 点击 |
| `/clickAt?target=ID` | POST | 真实鼠标点击 |
| `/setFiles?target=ID` | POST | 文件上传 |
| `/scroll?target=ID` | GET | 滚动页面 |
| `/screenshot?target=ID` | GET | 截图 |

### 使用示例

```bash
# 列出所有 tab
curl -s http://localhost:3456/targets

# 创建新 tab
curl -s "http://localhost:3456/new?url=https://example.com"
# 返回: {"targetId":"xxx"}

# 执行 JS
curl -s -X POST "http://localhost:3456/eval?target=xxx" -d 'document.title'
# 返回: {"value":"Example Domain"}

# 获取页面内容
curl -s -X POST "http://localhost:3456/eval?target=xxx" -d 'document.body.innerText'

# 点击元素
curl -s -X POST "http://localhost:3456/click?target=xxx" -d 'button.submit'

# 滚动到底部
curl -s "http://localhost:3456/scroll?target=xxx&direction=bottom"

# 截图
curl -s "http://localhost:3456/screenshot?target=xxx&file=/tmp/shot.png"

# 关闭 tab
curl -s "http://localhost:3456/close?target=xxx"
```text

---

## 使用示例

### 示例 1：搜索信息

```text
用户: 帮我搜索 TypeScript 5.0 的新特性
```text

Agent 会：
1. 使用 WebSearch 搜索相关信息
2. 如果需要更详细内容，使用 CDP 打开官方文档页面
3. 提取并总结关键信息

### 示例 2：访问需要登录的网站

```text
用户: 帮我在小红书搜索 xxx 的账号
```text

Agent 会：
1. 检测到小红书是反爬平台
2. 使用 CDP 模式连接用户浏览器（天然携带登录态）
3. 在后台 tab 中打开小红书并搜索
4. 提取搜索结果

### 示例 3：并行调研

```text
用户: 同时调研这 5 个产品的官网，给我对比摘要
```text

Agent 会：
1. 创建 5 个子 Agent 并行执行
2. 每个子 Agent 独立访问一个官网
3. 主 Agent 汇总结果并生成对比报告

---

## 最佳实践

### 1. 浏览哲学

**像人一样思考**：带着目标进入，边看边判断，遇到阻碍就解决。

- **拿到请求**：明确用户要做什么，定义成功标准
- **选择起点**：根据任务性质选择最可能直达的方式
- **过程校验**：每一步的结果都是证据，方向错了立即调整
- **完成判断**：对照成功标准确认完成，不过度操作

### 2. 工具选择

- 一手信息优于二手信息
- 搜索引擎是定位工具，不是证明工具
- 不确定时先查官方文档

### 3. CDP 操作

- 不主动操作用户已有 tab
- 所有操作在后台 tab 中进行
- 完成后关闭自己创建的 tab
- 先 eval 了解页面结构，再决定下一步动作

### 4. 错误处理

- 平台返回的"内容不存在"可能是访问方式问题
- 程序化方式受阻时，GUI 交互是可靠的兜底
- 站点自己生成的链接比手动构造的 URL 更可靠

---

## 文件结构

```text
~/.config/opencode/skills/web-access/
├── SKILL.md                    # 核心 skill 文件（约 15KB）
│   ├── 前置检查
│   ├── 浏览哲学
│   ├── 联网工具选择
│   ├── 浏览器 CDP 模式
│   ├── 并行调研策略
│   ├── 信息核实
│   └── 站点经验
│
├── scripts/
│   ├── cdp-proxy.mjs          # CDP 代理服务器（约 20KB）
│   │   ├── WebSocket 连接管理
│   │   ├── HTTP API 服务
│   │   └── 浏览器自动发现（已适配 Dia）
│   │
│   └── check-deps.sh          # 环境检查脚本（已适配 Dia）
│       ├── Node.js 版本检查
│       ├── 浏览器端口检测
│       └── Proxy 启动与连接
│
└── references/
    ├── cdp-api.md             # CDP API 详细参考
    │
    └── site-patterns/         # 站点经验存储
        ├── xiaohongshu.md     # 小红书
        ├── weibo.md           # 微博
        └── ...                # 其他站点
```text

---

## 常见问题

### Q: CDP Proxy 无法连接浏览器？

1. **确认浏览器启动方式**：必须使用 `--remote-debugging-port=9222`
   ```bash
   /Applications/Dia.app/Contents/MacOS/Dia --remote-debugging-port=9222
   ```
2. 检查端口是否被占用：`lsof -i :9222`
3. 查看 proxy 日志：`cat /tmp/cdp-proxy.log`
4. 验证 HTTP 端点：`curl http://127.0.0.1:9222/json/version`

### Q: 为什么 chrome://inspect 方式不工作？

Dia/Arc 等基于 Arc 架构的浏览器有安全限制，只允许来自 `chrome://inspect` 的 WebSocket 连接。必须使用命令行参数启动。

### Q: 执行 JS 返回空值？

1. 确认 targetId 正确
2. 检查页面是否加载完成
3. 尝试用 `JSON.stringify()` 包裹返回值

### Q: 截图失败？

1. 确认有写入目标文件的权限
2. 检查磁盘空间
3. 尝试不指定 file 参数，直接返回二进制

### Q: 如何添加新的浏览器支持？

在 `check-deps.sh` 和 `cdp-proxy.mjs` 中的 `activePortFiles()` / `possiblePaths` 添加新浏览器的配置路径。

---

## 参考资料

- [Web-Access GitHub](https://github.com/eze-is/web-access)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [opencode Skills 文档](https://opencode.ai/docs/skills/)
- [Web Access：一个 Skill，拉满 Agent 联网和浏览器能力](https://mp.weixin.qq.com/s/rps5YVB6TchT9npAaIWKCw)

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-03-26 | 2.4.0-opencode-dia | 适配 opencode + Dia 浏览器，解决 WebSocket 403 问题 |

---

*文档生成时间: 2026-03-26*
