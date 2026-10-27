# Bob Liu · pond

[bobliu.cc](https://bobliu.cc/) 的 Hugo 个人网站。四个主要页面是 `pond / projects / gallery / blog`：彩色 ASCII 树冠首页、项目展示、画廊和博客。布局方向参考 [Dao Ho](https://www.daoho.dev/)，首页使用自己的图片生成字符画。

## 本地运行

使用 **Hugo Extended 0.161.1**。不需要初始化 PaperMod 子模块，也不需要 Node.js 才能浏览或构建网站。

```sh
hugo server --disableFastRender
```

打开终端显示的本地地址，通常是 `http://localhost:1313/`。要预览草稿，加上 `-D`。

```sh
hugo --gc --minify --cleanDestinationDir
```

产物生成到 `public/`，该目录不提交到 Git。原 PaperMod 子模块暂留作历史参考，当前主题完全由仓库自己的 `layouts/` 和 `assets/` 提供。

## 修改首页

编辑 `data/profile.yaml`：姓名、问候语、短句、简介和社交链接。简介支持 Markdown。配色、字体和响应式样式位于 `assets/css/site.css`。

字体自托管：Geist Mono 和 Playfair Display，字体授权文件随资源存放在 `static/fonts/`。中文正文使用设备自带的中文无衬线字体。

### 更换 ASCII 背景

编辑 `data/background.yaml`，`image` 是相对于 `assets/` 的图片路径。`focus.desktop` 和 `focus.mobile` 是原图中的裁切焦点，`x`、`y` 的范围为 0–1；手机默认围绕树干裁切。图像等比铺满画布，不会被拉伸。

当前素材为 `assets/images/tree-canopy.webp`，由提供的树冠图压缩生成，原始 7708 × 4320 图片留在本地。以后换图时建议先导出压缩的 WebP，避免发布原始大文件。

浏览器只在图片加载、主题切换或尺寸变化时重建字符缓存。宽度达到 1024px 时，绿色叶片字符单独随连续的二维风场起伏，树干、主要枝条和天空字符保持静止。叶片水平约 5–8px、垂直约 1–2px，并伴随 0.94–1 的缓慢透明度变化，主要周期约 5–8 秒；小屏保留原有轻微摆动。字符本身保持稳定，最高 30fps。导航和简介背后会柔和淡化；打开菜单或切到其他标签时暂停，系统开启“减少动态效果”时呈现静态画面。没有 Canvas 或图片加载失败时，页面文字与导航仍可使用。

`stationary_regions` 使用原图中 0–1 的坐标圈定树干与主要枝条，随图片裁切同步投影，避免木质部分误入风场。更换背景图片时应同时调整这些区域；系统还会根据原图颜色保守筛选绿色叶片。

## 写博客

继续在 `content/posts/` 中写 Markdown，原有文章文件和 URL 保持原样。例如：

```sh
hugo new content posts/my-new-note/index.md
```

文章支持 TOML 或 YAML front matter，常用字段：

```yaml
---
title: 一篇新文章
date: 2026-10-27T09:00:00+08:00
draft: false
tags: [AI, Notes]
description: 用于搜索引擎和分享的简短说明。
---
```

将图片放在文章目录，使用 `![说明](image.webp)` 引用；也可继续使用原有外链图片。公开内容中的 HTML 图片标签会按原样渲染。

`/blog/` 是文章列表，`/posts/` 在 Netlify 上跳转至 `/blog/`；文章地址、`/about/`、`/archives/`、`/tags/`、`/search/` 和 RSS 地址保留。搜索索引由 Hugo 自动生成，搜索过程在浏览器本地完成。

## 添加项目

Projects 已展示 Swell 和 neiro，项目内容与压缩封面分别保存在 `content/projects/swell/` 和 `content/projects/neiro/`。Gallery 仍为空，显示 `coming soon.`。

```sh
hugo new content projects/my-project/index.md
```

编辑生成的文件，将 `draft` 改为 `false`，填写：

```yaml
---
title: My project
date: 2026-10-27T09:00:00+08:00
draft: false
year: "2026"
summary: A short, factual introduction.
cover: cover.webp
link: https://example.com/
weight: 10
---

## About the project

Write the project story here.
```

把封面放在同一目录。`cover` 支持页面内图片或 `/` 开头的静态资源路径；建议使用不超过 1400px 宽、300 KiB 的 WebP。`weight` 越小排序越靠前。项目在桌面横向滚动，在手机纵向排列。填写 `link` 后卡片直接打开该地址，HTTPS 外链在新标签页打开；GitHub 链接显示 `view on GitHub ↗`。留空 `link` 时，卡片进入 Markdown 详情页。

Swell 封面取自其公开仓库中的 `assets/blue-fullscreen.jpg`；neiro 封面截取自本地运行的默认训练界面（英文）。两张封面随网站发布，不依赖外站图片加载。

## 添加画廊作品

把图片放在 `static/gallery/`，修改 `data/gallery.yaml`：

```yaml
works:
  - title: Mountain light
    image: /gallery/mountain.webp
    year: "2026"
    description: A short caption.
    width: 1600
    height: 1200
    order: 1
```

`width`、`height` 使用实际图片尺寸，避免页面加载时跳动。优先使用压缩后的 WebP 或 JPEG。点击作品可放大，支持左右方向键、Esc 关闭与键盘焦点恢复。

## 检查

开发检查使用 Node.js **22.18+**（CI 使用 Node 24）：

```sh
npm ci --ignore-scripts
npm run check
```

包含 TypeScript 类型检查、图片裁切/采样/字符明暗映射与风场连续性测试、生产构建、旧链接与站内资源检查、搜索/RSS 检查，以及使用临时内容验证项目和画廊模板。测试素材仅存在于系统临时目录，不会出现在正式网站。

## Netlify

`netlify.toml` 固定 Hugo 版本并配置构建命令和 `public/` 发布目录。PR 和分支预览使用 Netlify 提供的预览 URL 构建，生产域名为 `https://bobliu.cc/`。

合并到 main 会沿用现有 GitHub → Netlify 发布链路。重构分支用于预览和评审，不需要修改域名、DNS 或 Cloudflare 配置。
