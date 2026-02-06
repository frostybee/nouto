import { writable } from 'svelte/store';

export interface UserSettings {
  autoCorrectUrls: boolean;
}

export const settings = writable<UserSettings>({
  autoCorrectUrls: false,
});

export function loadSettings(data: UserSettings) {
  settings.set(data);
}
