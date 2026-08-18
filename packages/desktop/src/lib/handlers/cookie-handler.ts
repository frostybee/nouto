import type { OutgoingMessage } from '@nouto/transport';
import type { TauriCookieJarService } from '../cookie-store';
import type { NotifyFn } from './types';

export function handleCookieMessage(
  message: OutgoingMessage,
  notify: NotifyFn,
  cookieJarService: TauriCookieJarService,
): void {
  switch (message.type) {
    case 'getCookieJar': {
      const cookies = cookieJarService.getAllByDomain();
      notify({ type: 'cookieJarData', data: cookies });
      break;
    }
    case 'getCookieJars': {
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'createCookieJar': {
      cookieJarService.createJar(message.data.name);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'renameCookieJar': {
      cookieJarService.renameJar(message.data.id, message.data.name);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
    case 'deleteCookieJar': {
      cookieJarService.deleteJar(message.data.id);
      emitCookieJarsList(notify, cookieJarService);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'setActiveCookieJar': {
      cookieJarService.setActiveJar(message.data.id);
      emitCookieJarsList(notify, cookieJarService);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'deleteCookie': {
      cookieJarService.deleteCookie(message.data.name, message.data.domain, message.data.path);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'deleteCookieDomain': {
      cookieJarService.deleteDomain(message.data.domain);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'clearCookieJar': {
      cookieJarService.clearAll();
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'addCookie': {
      cookieJarService.addCookie({ ...message.data, createdAt: Date.now() });
      emitCookieJarsList(notify, cookieJarService);
      emitCookieJarData(notify, cookieJarService);
      break;
    }
    case 'updateCookie': {
      const { oldName, oldDomain, oldPath, cookie } = message.data;
      cookieJarService.updateCookie(oldName, oldDomain, oldPath, {
        ...cookie,
        createdAt: Date.now(),
      });
      emitCookieJarData(notify, cookieJarService);
      emitCookieJarsList(notify, cookieJarService);
      break;
    }
  }
}

export function emitCookieJarsList(
  notify: NotifyFn,
  cookieJarService: TauriCookieJarService,
): void {
  const jars = cookieJarService.listJars();
  const activeJarId = cookieJarService.getActiveJarId();
  notify({ type: 'cookieJarsList', data: { jars, activeJarId } });
}

export function emitCookieJarData(notify: NotifyFn, cookieJarService: TauriCookieJarService): void {
  const cookies = cookieJarService.getAllByDomain();
  notify({ type: 'cookieJarData', data: cookies });
}
