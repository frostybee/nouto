import type { OutgoingMessage } from '@nouto/transport';
import type { TauriCookieJarService } from '../cookie-store';
import type { NotifyFn } from './types';

export function handleCookieMessage(
  message: OutgoingMessage,
  notify: NotifyFn,
  cookieJarService: TauriCookieJarService,
): void {
  const data = 'data' in message ? (message as any).data : undefined;

  switch (message.type) {
    case 'getCookieJar': {
      const cookies = cookieJarService.getAllByDomain();
      notify({ type: 'cookieJarData', data: cookies } as any);
      break;
    }
    case 'getCookieJars': {
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'createCookieJar': {
      cookieJarService.createJar(data.name);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'renameCookieJar': {
      cookieJarService.renameJar(data.id, data.name);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'deleteCookieJar': {
      cookieJarService.deleteJar(data.id);
      emitCookieJarsList(notify, cookieJarService);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'setActiveCookieJar': {
      cookieJarService.setActiveJar(data.id);
      emitCookieJarsList(notify, cookieJarService);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'deleteCookie': {
      cookieJarService.deleteCookie(data.name, data.domain, data.path);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'deleteCookieDomain': {
      cookieJarService.deleteDomain(data.domain);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'clearCookieJar': {
      cookieJarService.clearAll();
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'addCookie': {
      cookieJarService.addCookie({ ...data, createdAt: Date.now() });
      emitCookieJarData(notify, cookieJarService);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'updateCookie': {
      cookieJarService.updateCookie(data.oldName, data.oldDomain, data.oldPath, {
        ...data.cookie,
        createdAt: Date.now(),
      });
      emitCookieJarData(notify, cookieJarService);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
  }
}

export function emitCookieJarsList(notify: NotifyFn, cookieJarService: TauriCookieJarService): void {
  const jars = cookieJarService.listJars();
  const activeJarId = cookieJarService.getActiveJarId();
  notify({ type: 'cookieJarsList', data: { jars, activeJarId } } as any);
}

export function emitCookieJarData(notify: NotifyFn, cookieJarService: TauriCookieJarService): void {
  const cookies = cookieJarService.getAllByDomain();
  notify({ type: 'cookieJarData', data: cookies } as any);
}
