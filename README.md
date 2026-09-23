# 炸飞机 BattlePlane for VS Code

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/zhanwangfeng.battle-plane-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=zhanwangfeng.battle-plane-vscode)
[![Installs](https://vsmarketplacebadges.dev/installs/zhanwangfeng.battle-plane-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=zhanwangfeng.battle-plane-vscode)

在 VS Code 中直接游玩经典「炸飞机」小游戏的扩展插件，支持单机（打电脑）与局域网联机（双人对战）。

- GitHub: https://github.com/zhanwangfeng/BattlePlaneForVSCode
- VSCode: https://marketplace.visualstudio.com/items?itemName=zhanwangfeng.battle-plane-vscode

## 游戏截图

![游戏截图](resources/shortcut_001.png)

## 1. 插件说明

- **功能**：通过内置 Webview 在编辑器内运行「炸飞机」，不离开 VS Code 即可休闲对战。
- **入口**：活动栏「炸飞机」开始树，或命令面板执行 `炸飞机：打开游戏`。
- **主要特性**：
  - 10×10 棋盘，双盘对战（我方 / 敌方）。
  - 布局阶段摆放 **3 架飞机**，可旋转（`R` 或按钮）、可相邻、不可重叠，支持随机排列。
  - 战斗阶段回合制：点击敌方棋盘投弹，电脑自动反击（单机）；或实时同步对手（联机）。
  - 轰炸反馈：灰色=未击中、绿色+叉叉=击中机身、红色+叉叉=击中机头。
  - 命中机头播放多音符爆炸音效；命中机身播放爆炸音效；未击中低沉音；胜负各有旋律。
  - 音效开关位于活动栏「炸飞机」开始树（📢 图标），单机与联机共用；棋盘内「重开一局」随时重来。
  - 中文 / English 双语界面，跟随 VS Code 显示语言自动切换。
  - 联机对战（局域网）：创建 / 加入房间，与好友实时双人对战（详见第 2 节）。
- **规则简介**：
  - 每方 3 架飞机隐藏在棋盘上，飞机由机头、机身、机翼、尾翼组成（共 10 格）。
  - 轮到你时轰炸敌方任意格子，系统反馈「未击中 / 击中机身 / 击中机头」。
  - 率先击落敌方 **全部 3 个机头** 即获胜；我方全部机头被击落则失败。
- **操作按键**：
  - 鼠标：布局阶段点击放置机头、悬停预览；战斗阶段点击敌方格子投弹。
  - `R`：布局阶段旋转待放置的飞机。
  - 按钮：随机排列、清空、确认开战、重开一局。

## 2. 联机对战说明（局域网）

通过内置 WebSocket 服务，与同一局域网内的好友实时双人对战。

- **前提**：双方运行本扩展并处于可互通的网络（同一局域网或端口可达）。
- **创建房间（房主）**：执行命令 `炸飞机：创建联机房`（或活动栏开始树对应入口），本机将启动 WebSocket 服务，默认端口 `19101`。
- **加入房间（加入方）**：执行命令 `炸飞机：加入联机房`，在弹窗中输入房主地址 `IP:端口`（如 `192.168.1.10:19101`，默认端口 `19101`），回车即可加入；地址会自动记忆，下次可直接复用。
- **端口设置**：在设置中修改 `battlePlane.multiPort`（房主与加入方需保持一致），默认 `19101`。
- **对战规则**：房主端为权威逻辑（host-authoritative），左右两个战场（我方 / 敌方）实时同步；率先击落对方全部 3 个机头即获胜。
- **结束界面**：两个战场标题显示「胜利 / 失败」；房主可点击「重新开始」再来一局（加入方按钮置灰）。
- **观战**：房间内可容纳额外旁观者，仅查看战况不参战。

> 提示：联机模式同样支持音效开关与中英文切换（与单机一致，由开始树控制）。

## 3. 插件启动说明

### 方式一：VS Code 插件市场安装（推荐）

1. 打开 VS Code，进入扩展市场（快捷键 `Cmd/Ctrl + Shift + X`）。
2. 搜索 **`炸飞机`**（或本插件发布名 `battle-plane-vscode`），点击 **安装**。
3. 安装完成后，点击活动栏的 **炸飞机** 图标打开开始树，点击「开始游戏」即可；或按 `Cmd/Ctrl + Shift + P` 执行命令 **`炸飞机：打开游戏`**。
4. 对局中可随时点击棋盘内的「重开一局」重新开始。

> 安装后若命令/视图未出现，可重启 VS Code 重新加载扩展。

### 方式二：本地源码调试运行（F5）

适用于从源码二次开发或本地预览：

1. 安装依赖：

   ```bash
   npm install
   ```

2. 使用 VS Code 打开本项目根目录，按 **F5** 启动调试。
   - 调试前会自动编译 TypeScript（`src` → `out`）并后台监听改动。
   - VS Code 会打开一个新的「扩展开发宿主」窗口。
3. 在扩展开发窗口中，点击活动栏 **炸飞机** 图标打开开始树并点击「开始游戏」，或执行命令 **`炸飞机：打开游戏`** 即可游玩。

### 其他编译方式

- 单次编译：`npm run compile`
- 监听编译：`npm run watch`（调试时修改代码自动重新编译，重跑命令即生效）
- 打包发布：`npm run package`（自动先执行 `vscode:prepublish` 编译，生成带版本号的 .vsix）
