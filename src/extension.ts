import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// 活动栏「开始」树：提供一键开局入口
class BattlePlaneProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(_element?: vscode.TreeItem): vscode.TreeItem[] {
    const item = new vscode.TreeItem('开始游戏', vscode.TreeItemCollapsibleState.None);
    item.command = { command: 'battlePlane.open', title: '开始游戏' };
    item.iconPath = new vscode.ThemeIcon('rocket');
    item.tooltip = '点击在编辑器内打开「炸飞机」游戏';
    return [item];
  }
}

let panel: vscode.WebviewPanel | undefined;

// 读取 game.html 并注入消息钩子（接收 restart 指令重置棋局）
function getWebviewContent(context: vscode.ExtensionContext): string {
  const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'game.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const hook = `<script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m && m.type === 'restart' && typeof init === 'function') {
        init();
      }
    });
  </script>`;
  return html.replace('</body>', hook + '</body>');
}

function openGame(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'battlePlane',
    '炸飞机 BattlePlane',
    vscode.ViewColumn.One,
    {
      enableScripts: true, // 允许内联脚本（音效、交互）
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))],
    }
  );
  panel.webview.html = getWebviewContent(context);
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function activate(context: vscode.ExtensionContext) {
  const provider = new BattlePlaneProvider();
  vscode.window.registerTreeDataProvider('battlePlane.start', provider);

  context.subscriptions.push(
    vscode.commands.registerCommand('battlePlane.open', () => openGame(context)),
    vscode.commands.registerCommand('battlePlane.openSite', () => {
      vscode.env.openExternal(vscode.Uri.parse('https://codejson.cn/games/battle_plane/'));
    }),
    vscode.commands.registerCommand('battlePlane.restart', () => {
      panel?.webview.postMessage({ type: 'restart' });
    })
  );
}

export function deactivate() {}
