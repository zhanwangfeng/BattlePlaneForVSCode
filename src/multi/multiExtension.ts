import * as vscode from 'vscode';
import { LanMultiplayer, MultiMessage, MultiI18n } from '../common/lan-multiplayer';
import { makeMultiBootstrap, MULTI_PORT_DEFAULT } from './multiConfig';
import { langOf, I18N, t } from '../i18n';

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

let multiCtx: vscode.ExtensionContext | null = null;
let lm: LanMultiplayer | undefined;

/** 向当前联机面板推送消息（语言/音效/昵称变更等）；面板未开时为 no-op。 */
export function postToMultiWebview(msg: unknown): void {
  if (lm) {
    lm.postToWebview(msg as MultiMessage);
  }
}

function genRoomCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

let hostRoomCode = '';

const i18n: MultiI18n = {
  roomCreated: (ip, port) => t(langOf(), 'mp_hostStarted', { addr: ip, code: hostRoomCode, port }),
  portInUse: (port) => t(langOf(), 'mp_portBusy', { port }),
  connectFailed: () => t(langOf(), 'mp_connFailed'),
  connectTimeout: () => t(langOf(), 'mp_connFailed'),
  joinPrompt: () => t(langOf(), 'mp_joinPrompt'),
  invalidAddress: () => t(langOf(), 'mp_addrNoSpace'),
};

export function registerMulti(context: vscode.ExtensionContext): void {
  multiCtx = context;
  lm = new LanMultiplayer({
    context,
    commandPrefix: 'battlePlane',
    viewTypeHost: 'battlePlaneMulti',
    viewTypeClient: 'battlePlaneMultiClient',
    port: () => Number(vscode.workspace.getConfiguration('battlePlane').get('multiPort')) || MULTI_PORT_DEFAULT,
    webviewHtmlPath: (ctx) =>
      vscode.Uri.joinPath(ctx.extensionUri, 'src', 'multi', 'webview', 'multi.html'),
    i18n,
    buildBootstrap: (p) => {
      let roomCode: string | undefined;
      if (p.role === 'host') {
        roomCode = genRoomCode();
        hostRoomCode = roomCode;
      }
      return makeMultiBootstrap({
        role: p.role,
        hostId: HOST_ID,
        nickname: multiSettings.nick,
        lang: multiSettings.lang,
        dictCn: I18N.cn,
        dictEn: I18N.en,
        sound: multiSettings.sound,
        roomAddr: p.host + ':' + p.port,
        roomCode,
        roomPort: p.port,
      });
    },
    onWebviewMessage: (msg: MultiMessage) => {
      // rename 在 host / client 两侧都先本地持久化并通知设置 sink，再交模块默认转发
      // （host 侧广播给各 peer，client 侧上行给房主），让对端 webview 更新昵称。
      if (msg.type === 'rename' && typeof msg.name === 'string') {
        const name = msg.name.slice(0, 16);
        multiCtx?.globalState.update('bp.nick', name);
        multiSettings = { ...multiSettings, nick: name };
        settingsSink?.({ nick: name });
      }
      return false;
    }
  });
  context.subscriptions.push(lm.registerCommands());
}

/** 关闭所有 socket 与面板、释放命令。宿主卸载时调用。 */
export function disposeMulti(): void {
  lm?.dispose();
  lm = undefined;
}
