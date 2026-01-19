+++
title = '在远程服务器上配置Codex'
date = 2026-01-16T21:26:58+08:00
draft = false
Tags = ["AI 相关"]
+++

说明：
- 这里的服务器是腾讯云服务器，有公网IP的服务器

思路如下：
远程服务器上使用codex如果没有代理是无法运行的，所以这里的思路是在远程服务器上搭建一个代理，然后再运行codex
## Phase 1：远程服务器上配置 clash
---
### 1. 首先下载 **Clash for Linux**
首先，从官方 GitHub 发布页面 [https://github.com/doreamon-design/clash/releases](https://github.com/doreamon-design/clash/releases) 下载适合你系统的 Clash 二进制文件。对于大多数 64 位系统，请选择 `clash_2.0.24_linux_amd64.tar.gz`

下载之后，将压缩包上传到云服务器上，可以放在 `~` 目录下，然后解压
```bash
tar -xvf clash_2.0.24_linux_amd64.tar.gz
```
此命令将生成三个文件：clash（可执行文件）、[README.md](http://README.md) 和 LICENSE。只需要 clash 二进制文件。然后授予执行权限：
```bash
chmod +x clash
```
### 2. 创建  **Configuration Directory**
Clash 将其配置文件存储在 `~/.config/clash/` 中。如果此目录不存在，请手动创建它：
```bash
mkdir ~/.config/clash
```
然后，将两个必需的文件添加到此文件夹：`config.yaml`（你的订阅配置文件，定义节点、规则和端口） 和 `Country.mmdb`（来自 MaxMind 的 GeoIP 数据库，用于识别目标 IP 的国家或地区）。

⚠️ 注意：`config.yaml` 文件来自你的付费订阅。你需要先在本地获取它，然后将其上传到你的远程服务器。`Country.mmdb` 文件通常随订阅自动下载。

购买订阅后，你可以按如下方式找到配置文件（这些操作在你的本地机器上执行，而不是在远程服务器上）：




![360](https://s2.loli.net/2026/01/17/MGX9jNsKfbkJ5nv.png)
![360](https://s2.loli.net/2026/01/17/eqXC8nOyBi2pbNE.png)
![360](https://s2.loli.net/2026/01/17/BEz4QPaUtZORsyu.png)
![](https://s2.loli.net/2026/01/17/m4IVDbutJL8156v.png)
1. 打开您想要上传到远程服务器的订阅。右键单击并选择“打开文件”，这里可以用VScode打开，然后再在VScode中打开这个文件夹，这将自动导航到相应的`.yaml`配置文件。
2. 在上传到远程服务器之前，将其重命名为`config.yaml`。
3. 对于`Country.mmdb`文件，你可以尝试在父目录中查找。如果它没有随您的订阅自动下载，您可以选择下面列出的一种方法：
    - 自动下载它：
        
        ```bash
        cd ~/.config/clash/
        wget -O Country.mmdb "<https://cdn.jsdelivr.net/gh/Loyalsoldier/geoip@release/Country.mmdb>"
        ```
        
    - Manually download it from [MaxMind GeoIP Releases](https://github.com/Dreamacro/maxmind-geoip/releases) and then upload it to `~/.config/clash/`.
        

### 3. 编辑 **`config.yaml`  File**

我的修改过后的 config.yaml 文件的基础配置如下

```yaml
port: 7892
socks-port: 7893
allow-lan: false
unified-delay: true
bind-address: '*'
dns:
    default-nameserver:
        - 223.5.5.5
        - 119.29.29.29
    enable: true
    ipv6: false
    nameserver:
        - 223.5.5.5
        - 223.6.6.6
external-controller: 127.0.0.1:9090
log-level: info
mode: rule
...
```

这里，**port 指定 HTTP 代理端口（默认为 7890），socks-port 指定 SOCKS5 代理端口（默认为 7891）**，external-controller 定义外部程序（如 Clash Dashboard）的管理 API 端口。默认端口可能与其他正在运行的代理程序冲突，因此您可以根据需要更改它们。例如，将 HTTP 端口设置为 7892，SOCKS5 端口设置为 7893（或您想要的任何其他数字）。

### 4. 开始执行 Clash

完成之前的步骤后，就可以启动 Clash 以启用代理。

⚠️ 注意：这里最好将 clash 文件夹和 .config 文件夹放在同一目录下，这样clash 启动之后才可以读取到配置文件

你应该看到类似下面的输出，其中的端口 7892 和 7893 对应于你配置的端口：
![](https://s2.loli.net/2026/01/17/oG2LQBYci9FvdKT.png)
一旦 Clash 运行，测试代理是否工作。打开一个新的终端并设置系统代理：

```bash
export https_proxy=http://127.0.0.1:7892  # https
export http_proxy=http://127.0.0.1:7892   # http
export all_proxy=socks5://127.0.0.1:7893  # socks
```

同时，你的云服务器上的安全区应该将 7892,7893端口号添加进来，否则是无法成功开启服务的。
![](https://s2.loli.net/2026/01/17/9AiXOxeEvbrudtP.png)

然后进行测试：

```bash
curl -v <https://www.google.com>
```

没有 Clash 代理，访问 [](https://www.google.com/)[https://www.google.com](https://www.google.com) 将会失败，并出现“连接被拒绝”的错误。如果代理工作正常，该命令应该会成功，如下所示：
![](https://s2.loli.net/2026/01/17/5asHW1Xyj6xL7ed.png)
### 5. (Optional) 将代理快捷键添加到 `.bashrc`

为了避免每次打开新终端时手动设置系统代理，您可以将以下函数添加到您的 `~/.bashrc` 文件中：

```bash
# Proxy Setting
function proxy_on() {
  export http_proxy="<http://127.0.0.1:7892>"  # http
  export https_proxy=$http_proxy  # https
  export all_proxy="socks5://127.0.0.1:7893"  # socks
  export no_proxy="localhost,127.0.0.1,localaddress,.localdomain.com"
  echo -e "Proxy On"
}

function proxy_off() {
  unset http_proxy
  unset https_proxy
  unset all_proxy
  unset no_proxy
  echo -e "Proxy Off"
}
```

Then reload the `.bashrc` file:

```bash
source ~/.bashrc
```

现在您可以轻松切换代理了：

```bash
proxy_on   # Enable proxy
proxy_off  # Disable proxy
```
## Phase 2：远程服务器上配置 codex
---
前置条件：

1. GPT plus/pro账户, 以确保能够使用codex功能
2. 在远程服务器上配置成功的代理, 也就是上一 Phase 的流程

### 具体操作流程

Step 1. 查看clash配置中指定的端口号, 此处示例的port设置为7892。
![](https://s2.loli.net/2026/01/17/6aTBGSIl3YDepuZ.png)

Step 2. 在VSCode中按`Ctrl + Shift + P`，选择 Preferences: Open User Settings (JSON)，打开`settings.json`，设置如下三行变量（注意这里变量的port要与Step 1中查看的port一致，比如这里都为7897）。

```bash
"http.proxy": "<http://127.0.0.1>:YOURPORT",
"https.proxy": "<http://127.0.0.1>:YOURPORT",
"http.proxyStrictSSL": false,
```
![](https://s2.loli.net/2026/01/17/1guyZBElJmfTjXi.png)

Step 3. 在vscode中按`Ctrl+shfit+P`，选择 Developer:Reload Window，重新加载一遍窗口。

Step 4. 使用时首先在终端中**打开clash**，如果是第一次使用的话首先需要Sign in with ChatGPT，登录成功之后的界面如下图所示，然后就可以打开新聊天进行交流啦，注意整个登录和交流的过程中都需要**保持clash代理处于打开的状态**。

---

### **Reference**

- [https://ababababasmart.github.io//posts/2025/10/How-to-Use-Clash-on-a-Remote-Linux-Server/](https://ababababasmart.github.io//posts/2025/10/How-to-Use-Clash-on-a-Remote-Linux-Server/)
- [https://ababababasmart.github.io/posts/2025/12/2025-12-24-How-to-Use-Codex-on-the-Remote-Server/](https://ababababasmart.github.io/posts/2025/12/2025-12-24-How-to-Use-Codex-on-the-Remote-Server/)