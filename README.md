# Newledge (Xinzhi)

[新枝](https://www.xinzhi.zone) 提供的 Obsidian 插件，支持同步新枝数据到 Obsidian 中。

## 安装

1. 打开 Obsidian。
2. 进入「设置 > 第三方插件」。
3. 搜索「Newledge (Xinzhi)」并安装。
4. 启用插件。

## 使用

1. 打开插件设置页。
2. 使用新枝 App 扫描插件中的二维码，首次扫码会绑定新枝账户。扫码入口：个人页 > 数据联动 > 同步到 Obsidian 桌面端。
3. 绑定完成后，就可以将新枝数据同步到 Obsidian 中。插件提供定时同步功能和手动同步功能，可根据情况使用。
4. 推荐和 Obsidian 核心插件「日记」一起使用。从新枝同步来的数据中会带有「关联日记」属性，方便与时间建立关系。如果使用了 Obsidian 核心插件「日记」，则可以在每日日记中通过反向链接看到从新枝同步过来的数据。

## 账号和网络使用

本插件需要新枝账号。插件会访问新枝云服务（`xinzhi.zone`），用于：

- 创建二维码登录会话；
- 校验已绑定的新枝账号；
- 获取同步任务和同步内容；
- 上报同步成功或失败；
- 按用户操作解除账号绑定。

插件会通过 Obsidian 的插件数据 API 存储设置，包括已绑定账号信息和新枝返回的 token。插件不包含客户端埋点、广告或自动更新机制。

## English

Newledge (Xinzhi) imports your Newledge notes, links, highlights, and annotations into an Obsidian vault as Markdown files.

### Installation

1. Open Obsidian.
2. Go to **Settings > Community plugins**.
3. Search for **Newledge (Xinzhi)**.
4. Install and enable the plugin.

### Usage

1. Open the Newledge (Xinzhi) plugin settings in Obsidian.
2. Scan the QR code with the Newledge app. In the app, go to **Profile > Data integration > Sync to Obsidian desktop**.
3. After the account is linked, use **Sync now** to import data immediately, or configure scheduled sync.
4. Imported files are written to the configured vault folder. The default folder is `新枝`.

Newledge (Xinzhi) works well with Obsidian's Daily notes core plugin. Imported notes include a daily note link so you can browse synced content from your daily notes through backlinks.

### Account and network use

This plugin requires a Newledge account. It connects to the Newledge cloud service (`xinzhi.zone`) to:

- create the QR code login session;
- verify the linked Newledge account;
- fetch sync tasks and content;
- report sync success or failure;
- unlink the account when requested.

The plugin stores its settings with Obsidian's plugin data API, including the linked account information and token returned by Newledge. It does not include client-side telemetry, ads, or an auto-update mechanism.
