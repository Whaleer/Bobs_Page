+++
title = 'Hugo_learning'

date = 2025-04-21T14:09:03+08:00

draft = true

Tags = ["Hugo"]

+++

## 个人主题配置

### 概述

这里选用的是 [hugo-PaperMod](https://github.com/adityatelange/hugo-PaperMod)

PaperMod 有三种不同的模式（3 Modes）:

- [Regular Mode.](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#regular-mode-default-mode)
- [Home-Info Mode.](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#home-info-mode)
- [Profile Mode.](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#profile-mode)

### 主题安装

安装详细内容可以参考 [hugo-PaperMod/wiki/Installation](https://github.com/adityatelange/hugo-PaperMod/wiki/Installation)

> [!WARNING]	
>
> Make sure you install **Hugo >= v0.112.4**

- 主题的安装路径：`/Users/bingxil/Bob_L_Hugo/themes`
- PaperMode 的安装后的路径：`/Users/bingxil/Bob_L_Hugo/themes/PaperMod`

如果之前安装了，要重新删除的话，执行如下命令

```
git submodule deinit -f themes/PaperMod 
git rm -f themes/PaperMod
rm -rf git/modules/themes/PaperMod
```

安装命令:

```bash
git submodule add --depth=1 https://github.com/adityatelange/hugo-PaperMod.git themes/PaperMod
git submodule update --init --recursive # needed when you reclone your repo (submodules may not get cloned automatically)
```

最后，还需要在 `hugo.yml` add: 

```yaml
theme: ["PaperMod"]
```

#### 接下来 - 自定义 PaperMod 以符合自己的偏好

- 在第一次设置后，网站将是空白的

- 可以查看此网站的源代码 - https://github.com/adityatelange/hugo-PaperMod/tree/exampleSite

##### Archives Layout：

**把你所有文章按年份‑月份归档展示，生成 /archives/（或你自定义的路径）这一整页年表式清单**

在 content 中创建一个 `archive.md`

```
.
├── config.yml
├── content/
│   ├── archives.md   <--- Create archive.md here
│   └── posts/
├── static/
└── themes/
    └── PaperMod/
```

在 `archive.md` 加入如下内容就行

```
---
title: "Archive"
layout: "archives"
url: "/archives/"
summary: archives
---
```

请注意：归档布局不支持多语言月份翻译

##### 设置为 [Profile Mode.](https://github.com/adityatelange/hugo-PaperMod/wiki/Features#profile-mode)

只需要在 `hugo.yml` 中加入如下内容：

```yaml
profileMode:
  enabled: true
  title: "Bob L" # optional default will be site title
  subtitle: "diving.."
  imageUrl: "https://s2.loli.net/2025/04/21/Bd2qcSlTQUYfDRa.png" # optional
  imageTitle: "Bob_L" # optional
  imageWidth: 100 # custom size
  imageHeight: 100 # custom size
  buttons:
    - name: Archive
      url: "/archives"
    - name: Categories
      url: "/Categories"
    - name: Github
      url: "https://github.com/Whaleer/"
```

这里的内容是我的主题中的内容



## 01: CLI

### hugo new





## 02: Content management

### Archetypes(原型)

> **An archetype is a template for new content.**

archetype 相当于是一个内容的模板

`hugo new content` 命令会在 content 目录中创建一个新文件，并使用 archetype 作为模板
