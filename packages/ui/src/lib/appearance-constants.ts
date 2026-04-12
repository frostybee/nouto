export const APPEARANCE_COLORS: { name: string; hex: string }[] = [
  { name: 'red', hex: '#ff6b6b' },
  { name: 'orange', hex: '#fd9644' },
  { name: 'yellow', hex: '#ffd43b' },
  { name: 'lime', hex: '#a9e34b' },
  { name: 'green', hex: '#51cf66' },
  { name: 'teal', hex: '#20c997' },
  { name: 'blue', hex: '#4dabf7' },
  { name: 'violet', hex: '#cc5de8' },
];

export type IconStyle = 'filled' | 'outlined';

export interface AppearanceIcon {
  name: string;
  codicon: string;
  style: IconStyle;
}

export const APPEARANCE_ICONS: AppearanceIcon[] = [
  // Filled (20)
  { name: 'Grid', codicon: 'codicon-layout', style: 'filled' },
  { name: 'Circle', codicon: 'codicon-circle-large-filled', style: 'filled' },
  { name: 'Square', codicon: 'codicon-primitive-square', style: 'filled' },
  { name: 'Diamond', codicon: 'codicon-symbol-event', style: 'filled' },
  { name: 'Star', codicon: 'codicon-star-full', style: 'filled' },
  { name: 'Heart', codicon: 'codicon-heart-filled', style: 'filled' },
  { name: 'Person', codicon: 'codicon-person-filled', style: 'filled' },
  { name: 'Team', codicon: 'codicon-organization-filled', style: 'filled' },
  { name: 'Sparkle', codicon: 'codicon-sparkle-filled', style: 'filled' },
  { name: 'Verified', codicon: 'codicon-verified-filled', style: 'filled' },
  { name: 'Home', codicon: 'codicon-home', style: 'filled' },
  { name: 'Target', codicon: 'codicon-target', style: 'filled' },
  { name: 'Folder', codicon: 'codicon-folder', style: 'filled' },
  { name: 'Briefcase', codicon: 'codicon-briefcase', style: 'filled' },
  { name: 'Calendar', codicon: 'codicon-calendar', style: 'filled' },
  { name: 'Dashboard', codicon: 'codicon-dashboard', style: 'filled' },
  { name: 'Eye', codicon: 'codicon-eye', style: 'filled' },
  { name: 'Bell', codicon: 'codicon-bell-dot', style: 'filled' },
  { name: 'Package', codicon: 'codicon-package', style: 'filled' },
  { name: 'Warning', codicon: 'codicon-warning', style: 'filled' },

  // Outlined (20)
  { name: 'Globe', codicon: 'codicon-globe', style: 'outlined' },
  { name: 'Cloud', codicon: 'codicon-cloud', style: 'outlined' },
  { name: 'Server', codicon: 'codicon-server-process', style: 'outlined' },
  { name: 'Database', codicon: 'codicon-database', style: 'outlined' },
  { name: 'Rocket', codicon: 'codicon-rocket', style: 'outlined' },
  { name: 'Flame', codicon: 'codicon-flame', style: 'outlined' },
  { name: 'Lightbulb', codicon: 'codicon-lightbulb', style: 'outlined' },
  { name: 'Shield', codicon: 'codicon-shield', style: 'outlined' },
  { name: 'Lock', codicon: 'codicon-lock', style: 'outlined' },
  { name: 'Key', codicon: 'codicon-key', style: 'outlined' },
  { name: 'Terminal', codicon: 'codicon-terminal', style: 'outlined' },
  { name: 'Gear', codicon: 'codicon-gear', style: 'outlined' },
  { name: 'Bookmark', codicon: 'codicon-bookmark', style: 'outlined' },
  { name: 'Tag', codicon: 'codicon-tag', style: 'outlined' },
  { name: 'Code', codicon: 'codicon-code', style: 'outlined' },
  { name: 'Bug', codicon: 'codicon-bug', style: 'outlined' },
  { name: 'Beaker', codicon: 'codicon-beaker', style: 'outlined' },
  { name: 'Plug', codicon: 'codicon-plug', style: 'outlined' },
  { name: 'Pulse', codicon: 'codicon-pulse', style: 'outlined' },
  { name: 'Wand', codicon: 'codicon-wand', style: 'outlined' },
];

export const FILLED_ICONS = APPEARANCE_ICONS.filter(i => i.style === 'filled');
export const OUTLINED_ICONS = APPEARANCE_ICONS.filter(i => i.style === 'outlined');
