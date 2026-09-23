import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { registerMulti, disposeMulti, setMultiSettings, postToMultiWebview, setMultiSettingsSink } from './multi/multiExtension';
import { langOf, t, I18N } from './i18n';

interface Settings {
	lang: 'cn' | 'en';
	sound: boolean;
	nick: string;
}

let settings: Settings = { lang: 'cn', sound: true, nick: '' };

function randomNick(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let s = '';
	for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
	return s;
}

function loadSettings(ctx: vscode.ExtensionContext) {
	settings.lang = ctx.globalState.get('bp.lang', langOf());
	settings.sound = ctx.globalState.get('bp.sound', true);
	settings.nick = ctx.globalState.get('bp.nick', '') || '';
	if (!settings.nick) {
		settings.nick = randomNick();
		ctx.globalState.update('bp.nick', settings.nick);
	}
}

// 活动栏「开始」树：提供一键开局、联机入口，以及语言/音效/昵称设置
class BattlePlaneProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
	readonly onDidChangeTreeData = this._onDidChange.event;
	refresh() { this._onDidChange.fire(undefined); }

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}
	getChildren(_element?: vscode.TreeItem): vscode.TreeItem[] {
		const lang = settings.lang;
		const items: vscode.TreeItem[] = [];

		const open = new vscode.TreeItem(t(lang, 'tv_start'), vscode.TreeItemCollapsibleState.None);
		open.command = { command: 'battlePlane.open', title: t(lang, 'tv_start') };
		open.iconPath = new vscode.ThemeIcon('rocket');
		open.tooltip = '点击在编辑器内打开「炸飞机」单人游戏';
		items.push(open);

		const create = new vscode.TreeItem(t(lang, 'tv_create'), vscode.TreeItemCollapsibleState.None);
		create.command = { command: 'battlePlane.multiCreate', title: t(lang, 'tv_create') };
		create.iconPath = new vscode.ThemeIcon('broadcast');
		create.tooltip = '创建局域网房间，等待好友加入';
		items.push(create);

		const join = new vscode.TreeItem(t(lang, 'tv_join'), vscode.TreeItemCollapsibleState.None);
		join.command = { command: 'battlePlane.multiJoin', title: t(lang, 'tv_join') };
		join.iconPath = new vscode.ThemeIcon('sign-in');
		join.tooltip = '输入房主地址加入局域网对战';
		items.push(join);

		// 语言切换
		const langItem = new vscode.TreeItem(
			t(lang, 'tv_lang') + '：' + (lang === 'cn' ? t(lang, 'tv_lang_cn') : t(lang, 'tv_lang_en')),
			vscode.TreeItemCollapsibleState.None
		);
		langItem.command = { command: 'battlePlane.toggleLang', title: t(lang, 'tv_lang') };
		langItem.iconPath = new vscode.ThemeIcon('globe');
		items.push(langItem);

		// 音效开关
		const soundItem = new vscode.TreeItem(
			t(lang, 'tv_sound') + '：' + (settings.sound ? t(lang, 'tv_on') : t(lang, 'tv_off')),
			vscode.TreeItemCollapsibleState.None
		);
		soundItem.command = { command: 'battlePlane.toggleSound', title: t(lang, 'tv_sound') };
		soundItem.iconPath = new vscode.ThemeIcon(settings.sound ? 'volume-up' : 'volume-mute');
		items.push(soundItem);

		// 昵称
		const nickItem = new vscode.TreeItem(
			t(lang, 'tv_nick') + '：' + (settings.nick || '—'),
			vscode.TreeItemCollapsibleState.None
		);
		nickItem.command = { command: 'battlePlane.setNick', title: t(lang, 'tv_nick') };
		nickItem.iconPath = new vscode.ThemeIcon('person');
		items.push(nickItem);

		return items;
	}
}

const provider = new BattlePlaneProvider();
let panel: vscode.WebviewPanel | undefined;

// 将设置变更广播给所有相关 webview（单机 + 联机）
function broadcastSettings(msg: { type: string; [k: string]: unknown }) {
	if (panel) panel.webview.postMessage(msg);
	postToMultiWebview(msg);
}

// 读取 game.html 并注入 BOOTSTRAP（语言/字典/音效/昵称）与 restart 钩子
function getWebviewContent(): string {
	const abs = path.join(__dirname, '..', 'src', 'webview', 'game.html');
	const html = fs.readFileSync(abs, 'utf8');
	const boot = {
		lang: settings.lang,
		dictCn: I18N.cn,
		dictEn: I18N.en,
		sound: settings.sound,
		nick: settings.nick,
	};
	const json = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const inject = `<script>window.BOOTSTRAP=${json};</script>\n<script>
    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m && m.type === 'restart' && typeof init === 'function') { init(); }
    });
  </script>`;
	return html.replace('<head>', '<head>' + inject);
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
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))],
		}
	);
	panel.webview.html = getWebviewContent();
	panel.onDidDispose(() => {
		panel = undefined;
	});
}

export function activate(context: vscode.ExtensionContext) {
	loadSettings(context);
	setMultiSettings({ lang: settings.lang, sound: settings.sound, nick: settings.nick });

	vscode.window.registerTreeDataProvider('battlePlane.start', provider);

	context.subscriptions.push(
		vscode.commands.registerCommand('battlePlane.open', () => openGame(context)),
		vscode.commands.registerCommand('battlePlane.openSite', () => {
			vscode.env.openExternal(vscode.Uri.parse('https://codejson.cn/games/battle_plane/'));
		}),
		vscode.commands.registerCommand('battlePlane.restart', () => {
			panel?.webview.postMessage({ type: 'restart' });
		}),
		vscode.commands.registerCommand('battlePlane.toggleLang', () => {
			settings.lang = settings.lang === 'cn' ? 'en' : 'cn';
			context.globalState.update('bp.lang', settings.lang);
			setMultiSettings({ lang: settings.lang });
			provider.refresh();
			broadcastSettings({ type: 'lang', lang: settings.lang });
		}),
		vscode.commands.registerCommand('battlePlane.toggleSound', () => {
			settings.sound = !settings.sound;
			context.globalState.update('bp.sound', settings.sound);
			setMultiSettings({ sound: settings.sound });
			provider.refresh();
			broadcastSettings({ type: 'sound', on: settings.sound });
		}),
		vscode.commands.registerCommand('battlePlane.setNick', async () => {
			const value = await vscode.window.showInputBox({
				prompt: t(settings.lang, 'tv_nick_prompt'),
				value: settings.nick,
				validateInput: (v) => (v.length > 16 ? t(settings.lang, 'tv_nick_prompt') : undefined),
			});
			if (value === undefined) return;
			settings.nick = value.slice(0, 16);
			context.globalState.update('bp.nick', settings.nick);
			setMultiSettings({ nick: settings.nick });
			provider.refresh();
			broadcastSettings({ type: 'nick', name: settings.nick });
		})
	);

	registerMulti(context);
	setMultiSettingsSink((s) => {
		if (s.lang) { settings.lang = s.lang; context.globalState.update('bp.lang', s.lang); }
		if (typeof s.sound === 'boolean') { settings.sound = s.sound; context.globalState.update('bp.sound', s.sound); }
		if (typeof s.nick === 'string') { settings.nick = s.nick; context.globalState.update('bp.nick', s.nick); }
		provider.refresh();
	});
}

export function deactivate() {
	disposeMulti();
}
