import { I18N, type Lang } from '../i18n';

export const MULTI_PROTOCOL = 'battleplane-multi/1';
export const MULTI_PORT_DEFAULT = 19101;

export interface MultiBootstrap {
	version: string;
	role: 'host' | 'client';
	hostId: string;
	nickname: string;
	lang: Lang;
	difficulties: unknown[];
	dict: Record<string, string>;
	dictCn: Record<string, string>;
	dictEn: Record<string, string>;
	sound: boolean;
	roomAddr?: string;
	roomCode?: string;
	roomPort?: number;
}

export interface MultiBootstrapOpts {
	role: 'host' | 'client';
	hostId?: string;
	nickname?: string;
	lang?: Lang;
	dictCn?: Record<string, string>;
	dictEn?: Record<string, string>;
	sound?: boolean;
	roomAddr?: string;
	roomCode?: string;
	roomPort?: number;
}

export function makeMultiBootstrap(opts: MultiBootstrapOpts): MultiBootstrap {
	const lang = opts.lang || 'cn';
	return {
		version: MULTI_PROTOCOL,
		role: opts.role,
		hostId: opts.hostId || 'HOST',
		nickname: opts.nickname || '',
		lang,
		difficulties: [],
		dict: I18N[lang] || I18N.cn,
		dictCn: opts.dictCn || I18N.cn,
		dictEn: opts.dictEn || I18N.en,
		sound: opts.sound ?? true,
		roomAddr: opts.roomAddr,
		roomCode: opts.roomCode,
		roomPort: opts.roomPort,
	};
}
