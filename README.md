# jin10-to-qywx

# Jin10 RSS to QY WeChat / 金十 RSS 推送到企业微信

A lightweight script that fetches Jin10 RSS feeds and pushes new items to a WeCom (QY WeChat) group bot webhook. It includes MD5-based deduplication, empty message filtering, and auto-cleanup. Designed to run on a schedule via GitHub Actions.

一个轻量级脚本，通过 RSS 拉取金十快讯/分类数据，并自动推送到企业微信机器人（群聊 Webhook）。内置 MD5 哈希去重、空消息过滤和自动清理机制，适合用 GitHub Actions 定时运行。

---

## Features / 功能特性

* **Multi-feed support**: Read multiple RSS URLs from one env var. / **多源支持**：环境变量一行一个 URL。
* **Smart Deduplication**: STRICT hash (ID+Time) + LOOSE hash (Title+Content) to prevent cross-feed duplicates. / **智能去重**：严格哈希（ID+时间）+ 宽松哈希（标题+内容），防止通过不同源推送重复新闻。
* **Timezone Fixed**: Messages displayed in Beijing Time (UTC+8). / **时区修正**：消息时间强制显示为北京时间 (UTC+8)。
* **Empty message filtering**: Dual-layer filter to block blank cards. / **空消息过滤**：双重过滤拦截空白卡片。
* **Privacy protection**: RSS URLs are stored as MD5 hashes, not plaintext. / **隐私保护**：RSS 链接以 MD5 哈希存储，不暴露原始地址。
* **Auto-cleanup**: 40,000 record limit with automatic cleanup notification. / **自动清理**：40,000 条记录上限，超限自动清理并通知。
* **Dry Run**: Support `--dry-run` to test without sending. / **模拟运行**：支持 `--dry-run` 模式进行测试（不发送消息）。
* **Resume support**: Per-feed last item tracking. / **断点续推**：每个 RSS 源独立记录最后推送位置。
* **Markdown messages**: Push to WeCom bot with category tags. / **Markdown 消息**：推送到企业微信，带分类标签。

## Requirements / 运行要求

* **Node.js 18+** (Actions uses Node 20). / **Node.js 18+**（Actions 中为 Node 20）。
* Dependencies / 依赖：`rss-parser`, `axios`

## Quick Start (Local) / 本地快速开始

1. **Install dependencies / 安装依赖**

```bash
npm install
```

2. **Set environment variables / 配置环境变量**

```bash
export RSS_URL="YOUR_KEY"

export QYWX_WEBHOOK="YOUR_KEY"
```

3. **Run / 运行**

```bash
# Normal run / 正常运行
node rss_to_qywx.js

# Dry run (simulate only) / 模拟运行（仅打印不发送）
node rss_to_qywx.js --dry-run
```

## Deploy with GitHub Actions / 使用 GitHub Actions 部署

### Workflow Files / 工作流文件

| File / 文件                          | Schedule / 频率           | Purpose / 用途                                                                                                  |
| ------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/rss.yml`          | Every 10 min / 每 10 分钟 | Fetch RSS, push messages, update `last.json` on bot branch. / 抓取 RSS、推送消息、更新 bot 分支的 `last.json`。 |
| `.github/workflows/sync-to-main.yml` | Daily / 每天一次          | Create PR to sync `last.json` to main branch. / 创建 PR 将 `last.json` 同步到 main 分支。                       |

### Branch Model / 分支模型

This project uses a two-branch model to separate runtime state from stable code:

本项目采用双分支模型，将运行时状态与稳定代码分离：

| Branch / 分支     | Purpose / 用途                                                                    | Updated By / 更新者           |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| `main`            | Stable code, periodic state sync. / 稳定代码，定期状态同步。                      | Manual PR merge / 手动合并 PR |
| `bot/update-last` | Runtime state (`last.json`), updated every 10 min. / 运行时状态，每 10 分钟更新。 | GitHub Actions Bot            |

**Workflow:**
1. `rss.yml` runs on `bot/update-last` branch, pulls latest code from `main`, keeps `last.json`.
2. After running, commits updated `last.json` to `bot/update-last`.
3. `sync-to-main.yml` runs daily, creates PR to merge `last.json` to `main`.

**工作流程：**
1. `rss.yml` 在 `bot/update-last` 分支运行，从 `main` 拉取最新代码，保留 `last.json`。
2. 运行后将更新的 `last.json` 提交到 `bot/update-last`。
3. `sync-to-main.yml` 每天运行，创建 PR 将 `last.json` 合并到 `main`。

### Setup Steps / 设置步骤

#### 1) Fork or clone this repo / Fork 或克隆本仓库

#### 2) Set repository secrets / 设置仓库密钥

Go to **Settings → Secrets and variables → Actions**, add:

进入 **Settings → Secrets and variables → Actions**，添加：

* `RSS_URL`: Multiple RSS URLs separated by newlines. / 多个 RSS 地址，换行分隔。
* `QYWX_WEBHOOK`: WeCom group bot webhook URL. / 企业微信机器人 Webhook URL。

#### 3) Push changes / 推送更改

**For collaborators / 协作者推送方式：**

**Using Pull Requests (Recommended) / 使用 Pull Request（推荐）：**
Do not push directly to `main` branch. Please create a new branch and submit a Pull Request.
请勿直接推送到 `main` 分支。请创建新分支并提交 Pull Request。

```bash
# Create feature branch / 创建特性分支
git checkout -b feature/my-feature

# Commit changes / 提交更改
git commit -m "feat: add new feature"

# Push to fork/remote / 推送到远程
git push origin feature/my-feature

# Then open a PR on GitHub / 然后在 GitHub 上创建 PR
```

> **Note**: Only change **code files**. Never manually modify `last.json` in your PRs.
> **注意**：只修改**代码文件**。不要在 PR 中手动修改 `last.json`。

#### 4) Wait for schedule / 等待定时触发

Actions will auto-run and manage both branches.

Actions 会自动运行并管理两个分支。

## Configuration Details / 配置说明

### Environment Variables / 环境变量

| Variable / 变量 | Required / 必填 | Description / 描述                                      |
| --------------- | --------------- | ------------------------------------------------------- |
| `RSS_URL`       | Yes / 是        | Newline-separated RSS URLs. / 换行分隔的 RSS 地址列表。 |
| `QYWX_WEBHOOK`  | Yes / 是        | WeCom webhook URL. / 企业微信机器人 Webhook。           |

### State File / 状态文件

`last.json` uses version 3 format (upgraded from v2):

`last.json` 使用 v3 格式（从 v2 升级）：

```json
{
  "version": 3,
  "feeds": {
    "<md5(rss_url)>": "<md5(last_item_id)>"
  },
  "hashes": ["<composite_hash>"],
  "contentHashes": ["<content_hash>"],
  "count": 1000,
  "updatedAt": "2025-12-13T03:00:00Z"
}
```

* `feeds`: Per-feed last item hash (RSS URL as MD5 key). / 每个源的最后条目哈希（RSS URL 用 MD5 作为键）。
* `hashes`: Global strict deduplication hashes (ID+Time). / 全局严格去重哈希（ID+时间）。
* `contentHashes`: Global loose deduplication hashes (Title+Content). / 全局宽松去重哈希（标题+内容）。
* `count`: Current hash count. / 当前哈希数量。
* `updatedAt`: Last update timestamp. / 最后更新时间戳。

## How It Works / 工作原理

1. **Fetch RSS**: Read feeds, reverse items to send old → new. / **获取 RSS**：拉取后反转条目，按旧到新发送。
2. **Generate fingerprint**: Priority: `link` → `guid` → normalized `title + pubDate`. / **生成指纹**：优先级：`link` → `guid` → 归一化 `title + pubDate`。
3. **Composite hash**:
    - **Strict**: `id|title|content|time` (Strict dedupe / 严格去重).
    - **Loose**: `title|content` (Cross-source dedupe / 跨源去重).
4. **Deduplication**: Skip if either hash exists. / **去重**：任一哈希存在即跳过。
5. **Empty filter**: Block messages with empty title AND content. / **空消息过滤**：拦截标题和内容都为空的消息。
6. **Keyword filter**: Must hit whitelist, must not hit blacklist. / **关键词过滤**：必须命中白名单，不能命中黑名单。
7. **Push**: Send as WeCom markdown with category tag. / **推送**：以企业微信 Markdown 发送，带分类标签。
8. **Auto-cleanup**: When reaching 40,000 records, remove oldest 20,000 and notify. / **自动清理**：达到 40,000 条时，清除最旧的 20,000 条并通知。

## Notes / 注意事项

* Category tagging uses a built-in map; unmatched feeds fall back to `金十`. / 分类标签基于内置映射；无法匹配时默认 `金十`。
* Whitelist/blacklist keywords are defined in the script. / 白名单/黑名单关键词定义在脚本中。
* WeCom markdown has length limits; very long items may be truncated. / 企业微信 Markdown 有长度限制，过长内容可能被截断。
* If your RSS provider rate-limits, increase the cron interval. / 若 RSS 源有频率限制，可适当调大定时周期。

## Troubleshooting / 常见问题

| Issue / 问题                  | Solution / 解决方案                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing sent / 没有推送       | Check `RSS_URL` format (newline-separated), keyword filters, or if already in history. / 检查 `RSS_URL` 格式、关键词过滤、或已在历史记录中。 |
| Empty messages / 空消息       | Script has dual-layer filters; if still occurs, report an issue. / 脚本有双重过滤；如仍出现请提交 issue。                                    |
| Duplicate messages / 重复消息 | Ensure `last.json` is being committed properly. / 确保 `last.json` 正确提交。                                                                |

## License / 许可

**MIT**
