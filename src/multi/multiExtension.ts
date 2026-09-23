import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import * as fs from 'fs';
import WebSocket, { WebSocketServer } from 'ws';
import { MULTI_PORT_DEFAULT, makeMultiBootstrap } from './multiConfig';
import { langOf, I18N, t } from '../i18n';

let multiCtx: vscode.ExtensionContext | null = null;
let multiPanel: vscode.WebviewPanel | null = null;
let hostWss: WebSocketServer | null = null;
let clientWs: WebSocket | null = null;
let multiRole: 'host' | 'client' | null = null;
let peerSeq = 0;
let shuttingDown = false;
const HOST_ID = 'HOST';

interface MultiSettings {
	lang: 'cn' | 'en';
	sound: boolean;
	nick: string;
}
let multiSettings: MultiSettings = { lang: 'cn', sound: true, nick: '' };

export function setMultiSettings(s: Partial<MultiSettings>): void {
	multiSettings = { ...multiSettings, ...s };
}

let settingsSink: ((s: Partial<MultiSettings>) => void) | undefined;
export function setMultiSettingsSink(fn: (s: Partial<MultiSettings>) => void): void {
	settingsSink = fn;
}
export function postToMultiWebview(msg: unknown): void {
	if (multiPanel) multiPanel.webview.postMessage(msg);
}

export function registerMulti(ctx: vscode.ExtensionContext): void {
	multiCtx = ctx;
	ctx.subscriptions.push(
		vscode.commands.registerCommand('battlePlane.multiCreate', () => startHost()),
		vscode.commands.registerCommand('battlePlane.multiJoin', () => startClient())
	);
}

export function disposeMulti(): void {
	try {
		shutdownMulti();
	} catch (e) {
		/* ignore */
	}
}

function readWebviewHtml(): string {
	const fp = path.join(__dirname, '..', 'src', 'multi', 'webview', 'multi.html');
	return fs.readFileSync(fp, 'utf8');
}

function genRoomCode(): string {
	return Math.floor(1000 + Math.random() * 9000).toString();
}

async function isPortBusy(port: number): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const srv = net.createServer();
		srv.once('error', () => resolve(true));
		srv.once('listening', () => {
			srv.close(() => resolve(false));
		});
		srv.listen(port, '0.0.0.0');
	});
}

function getLanIp(): string {
	try {
		const ifaces = os.networkInterfaces();
		for (const name of Object.keys(ifaces)) {
			for (const ni of ifaces[name] || []) {
				if (ni.family === 'IPv4' && !ni.internal) {
					return ni.address;
				}
			}
		}
	} catch (e) {
		/* ignore */
	}
	return '127.0.0.1';
}

function postMessageToPanel(msg: unknown): void {
	if (multiPanel) {
		multiPanel.webview.postMessage(msg);
	}
}

function hostBroadcast(msg: unknown): void {
	if (!hostWss) {
		return;
	}
	const data = JSON.stringify(msg);
	for (const c of hostWss.clients) {
		const ws = c as WebSocket;
		if (ws.readyState === ws.OPEN) {
			ws.send(data);
		}
	}
}

function hostSendTo(to: string, msg: unknown): void {
	if (!hostWss) {
		return;
	}
	const data = JSON.stringify(msg);
	for (const c of hostWss.clients) {
		const ws = c as WebSocket & { meta?: { from?: string } };
		if (ws.meta && ws.meta.from === to && ws.readyState === ws.OPEN) {
			ws.send(data);
			break;
		}
	}
}

function closePeerByFrom(from: string): void {
	if (!hostWss) {
		return;
	}
	for (const c of hostWss.clients) {
		const ws = c as WebSocket & { meta?: { from?: string } };
		if (ws.meta && ws.meta.from === from) {
			try {
				ws.close();
			} catch (e) {
				/* ignore */
			}
			break;
		}
	}
}

function handlePeerMessage(ws: WebSocket & { meta?: { from?: string; name?: string } }, raw: WebSocket.RawData): void {
	let m: any;
	try {
		m = JSON.parse(raw.toString());
	} catch (e) {
		return;
	}
	if (typeof m !== 'object' || m === null) {
		return;
	}
	ws.meta = ws.meta || {};
	m.from = m.from || ws.meta.from;
	ws.meta.from = ws.meta.from || m.from;
	if (typeof m.name === 'string') {
		ws.meta.name = m.name;
	}
	// Relay every peer message to the host webview, which owns the authoritative game state.
	postMessageToPanel(m);
}

function handlePeerClose(ws: WebSocket & { meta?: { from?: string; name?: string } }): void {
	const from = ws.meta && ws.meta.from;
	const name = (ws.meta && ws.meta.name) || '???';
	if (from && hostWss) {
		postMessageToPanel({ type: 'leave', from, name });
	}
}

async function startHost(): Promise<void> {
	if (hostWss || multiPanel) {
		if (multiPanel) {
			multiPanel.reveal(vscode.ViewColumn.One);
		}
		return;
	}
	const cfg = vscode.workspace.getConfiguration('battlePlane');
	const port = Number(cfg.get('multiPort')) || MULTI_PORT_DEFAULT;
	if (!Number.isFinite(port) || port < 1 || port > 65535) {
		vscode.window.showErrorMessage(t(langOf(), 'mp_badPort'));
		return;
	}
	const busy = await isPortBusy(port);
	if (busy) {
		vscode.window.showErrorMessage(t(langOf(), 'mp_portBusy'));
		return;
	}
	try {
		hostWss = new WebSocketServer({ port, host: '0.0.0.0' });
	} catch (e) {
		vscode.window.showErrorMessage(t(langOf(), 'mp_hostError') + ' ' + (e instanceof Error ? e.message : String(e)));
		hostWss = null;
		return;
	}

	const addr = getLanIp();
	const code = genRoomCode();
	peerSeq = 0;

	const panel = vscode.window.createWebviewPanel(
		'battlePlaneMulti',
		'炸飞机 · 联机',
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
	);
	multiPanel = panel;
	multiRole = 'host';
	const bootstrap = makeMultiBootstrap({
		role: 'host',
		hostId: HOST_ID,
		nickname: multiSettings.nick,
		lang: multiSettings.lang,
		dictCn: I18N.cn,
		dictEn: I18N.en,
		sound: multiSettings.sound,
		roomAddr: addr + ':' + port,
		roomCode: code,
		roomPort: port,
	});
	const html = readWebviewHtml().replace('__MULTI_BOOTSTRAP_VALUE__', JSON.stringify(bootstrap));
	panel.webview.html = html;

	hostWss.on('connection', (ws: WebSocket & { meta?: { from?: string } }) => {
		ws.meta = { from: 'p' + ++peerSeq };
		ws.on('message', (raw) => handlePeerMessage(ws, raw));
		ws.on('close', () => handlePeerClose(ws));
		ws.on('error', () => {
			/* ignore */
		});
	});
	hostWss.on('error', (e) => {
		vscode.window.showErrorMessage(t(langOf(), 'mp_hostError') + ' ' + (e instanceof Error ? e.message : String(e)));
		shutdownMulti();
	});

	panel.onDidDispose(() => {
		shutdownMulti();
	});
	panel.webview.onDidReceiveMessage((msg: any) => {
		if (!msg || typeof msg !== 'object') {
			return;
		}
		if (msg.type === 'rename' && typeof msg.name === 'string') {
			const name = msg.name.slice(0, 16);
			multiCtx?.globalState.update('bp.nick', name);
			multiSettings = { ...multiSettings, nick: name };
			settingsSink?.({ nick: name });
		}
		if (hostWss) {
			if (typeof msg.to === 'string' && msg.to) {
				hostSendTo(msg.to, msg);
				if (msg.type === 'full') {
					// Reject the extra peer: deliver the message then close its socket.
					closePeerByFrom(msg.to);
				}
			} else {
				hostBroadcast(msg);
			}
		}
	});

	vscode.window.showInformationMessage(t(langOf(), 'mp_hostStarted', { addr, code, port }));
}

async function startClient(): Promise<void> {
	if (clientWs || multiPanel) {
		if (multiPanel) {
			multiPanel.reveal(vscode.ViewColumn.One);
		}
		return;
	}
	const savedAddr = (multiCtx?.globalState.get('battlePlane.multiAddr', '') as string) || '';
	const input = await vscode.window.showInputBox({
		prompt: t(langOf(), 'mp_joinPrompt'),
		placeHolder: '192.168.1.10:19101',
		value: savedAddr,
		validateInput: (v) => {
			const s = (v || '').trim();
			if (!s) {
				return t(langOf(), 'mp_addrEmpty');
			}
			if (s.includes(' ')) {
				return t(langOf(), 'mp_addrNoSpace');
			}
			return null;
		},
	});
	if (input === undefined) {
		return;
	}
	const trimmed = input.trim();
	if (!trimmed) {
		return;
	}
	let host = trimmed;
	let port = MULTI_PORT_DEFAULT;
	if (trimmed.includes(':')) {
		const parts = trimmed.split(':');
		host = parts[0].trim();
		const p = parseInt(parts[1].trim(), 10);
		if (Number.isFinite(p) && p > 0 && p <= 65535) {
			port = p;
		}
	}
	if (!host) {
		return;
	}
	multiCtx?.globalState.update('battlePlane.multiAddr', trimmed);

	const panel = vscode.window.createWebviewPanel(
		'battlePlaneMultiClient',
		'炸飞机 · 联机',
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
	);
	multiPanel = panel;
	multiRole = 'client';
	const bootstrap = makeMultiBootstrap({
		role: 'client',
		hostId: HOST_ID,
		nickname: multiSettings.nick,
		lang: multiSettings.lang,
		dictCn: I18N.cn,
		dictEn: I18N.en,
		sound: multiSettings.sound,
		roomAddr: trimmed,
		roomPort: port,
	});
	const html = readWebviewHtml().replace('__MULTI_BOOTSTRAP_VALUE__', JSON.stringify(bootstrap));
	panel.webview.html = html;

	let ws: WebSocket | null = null;
	try {
		ws = new WebSocket('ws://' + host + ':' + port);
	} catch (e) {
		vscode.window.showErrorMessage(t(langOf(), 'mp_connFailed'));
		shutdownMulti();
		return;
	}
	clientWs = ws;
	ws.on('open', () => {
		postMessageToPanel({ type: 'connected' });
	});
	ws.on('message', (raw) => {
		let m: any;
		try {
			m = JSON.parse(raw.toString());
		} catch (e) {
			return;
		}
		if (!m || typeof m !== 'object') {
			return;
		}
		postMessageToPanel(m);
	});
	ws.on('close', () => {
		postMessageToPanel({ type: 'disconnected' });
	});
	ws.on('error', () => {
		vscode.window.showErrorMessage(t(langOf(), 'mp_connFailed'));
		postMessageToPanel({ type: 'disconnected' });
	});

	panel.onDidDispose(() => {
		shutdownMulti();
	});
	panel.webview.onDidReceiveMessage((msg: any) => {
		if (!msg || typeof msg !== 'object') {
			return;
		}
		if (msg.type === 'rename' && typeof msg.name === 'string') {
			const name = msg.name.slice(0, 16);
			multiCtx?.globalState.update('bp.nick', name);
			multiSettings = { ...multiSettings, nick: name };
			settingsSink?.({ nick: name });
		}
		if (clientWs && clientWs.readyState === clientWs.OPEN) {
			clientWs.send(JSON.stringify(msg));
		}
	});
}

function shutdownMulti(): void {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	try {
		postMessageToPanel({ type: 'shutdown' });
	} catch (e) {
		/* ignore */
	}
	if (hostWss) {
		try {
			for (const c of hostWss.clients) {
				try {
					(c as WebSocket).close();
				} catch (e) {
					/* ignore */
				}
			}
			hostWss.close();
		} catch (e) {
			/* ignore */
		}
		hostWss = null;
	}
	if (clientWs) {
		try {
			clientWs.close();
		} catch (e) {
			/* ignore */
		}
		clientWs = null;
	}
	if (multiPanel) {
		try {
			multiPanel.dispose();
		} catch (e) {
			/* ignore */
		}
		multiPanel = null;
	}
	multiRole = null;
	shuttingDown = false;
}
