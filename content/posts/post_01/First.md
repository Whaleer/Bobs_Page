+++
title = 'Personal Page Build'
date = 2024-04-01T11:58:05+08:00
draft = false

+++

## 环境介绍

**建站工具：Hugo +  Github + Netlify + Aliyun + CloudFlare**

**电脑环境：MacOS Sonoma (14.3.1)**

**Hugo:** [Hugo](https://gohugo.io/)

**Netlify:** [Netlify](https://www.netlify.com/)

------

## HUGO 安装

**准备工作，安装：**

- Git
- Go
- Dart Sass

接下来开始正式安装hugo, 使用homebrew进行安装

```bash
brew install hugo
```

安装好后查看版本信息

```bash
hugo version
```

### 创建一个 site

```bash
hugo new site Bob_L # 创建了一个名为 Bob_L 的 site
cd quickstart # 进入 site
git init # 初始化 git
git submodule add https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke # 加入你的主题
echo "theme = 'ananke'" >> hugo.toml # 修改成你的主题
hugo server
```

- `hugo server` 之后，通过查看终端的 url 就可以看到你的网页了
- 注意：这里是使用 `submodule` ，因为如果使用 `clone`，可能会出错

### 加入 content

```bash
hugo new content posts/my-first-post.md
```

Hugo 会在 `content/posts` 目录下创建你的 content，最开始在 [front matter](https://gohugo.io/content-management/front-matter/) 中 `draft` 的值是 `true` . 默认状态下， Hugo 并不会在建站过程中发布 draft 内容

保存这个文件，然后在 Hugo’s development server 中查看你的 site，运行下面的**任意一个指令**来包含 draft 内容

```bash
hugo server --buildDrafts
hugo server -D
```

------

## Github 文件托管

首先你需要在 github 中创建一个 repository，然后再执行下载的操作

```
git add .
git commit -m "my blog first commit"
git remote add origin "远端github仓库地址"
git branch -M main
git push -u origin main
```

------

## Netlify 建站

1. 注册账号
2. 新建站点
3. 连接 github
4. 选择刚刚上传的博客项目

<img src="../../../assets/image-2024040131756402%E2%80%AFPM-1960585.png" alt="image-2024040131756402 PM.png" style="zoom:33%;" />
