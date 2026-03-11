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
  // Filled
  { name: 'Grid', codicon: 'codicon-layout', style: 'filled' },
  { name: 'Circle', codicon: 'codicon-circle-large-filled', style: 'filled' },
  { name: 'Square', codicon: 'codicon-primitive-square', style: 'filled' },
  { name: 'Diamond', codicon: 'codicon-symbol-event', style: 'filled' },
  { name: 'Star', codicon: 'codicon-star-full', style: 'filled' },
  { name: 'Heart', codicon: 'codicon-heart-filled', style: 'filled' },
  { name: 'Person', codicon: 'codicon-person-filled', style: 'filled' },
  { name: 'Sparkle', codicon: 'codicon-sparkle-filled', style: 'filled' },
  { name: 'Verified', codicon: 'codicon-verified-filled', style: 'filled' },
  { name: 'Mic', codicon: 'codicon-mic-filled', style: 'filled' },

  // Outlined
  { name: 'Circle', codicon: 'codicon-circle-large', style: 'outlined' },
  { name: 'Triangle', codicon: 'codicon-triangle-up', style: 'outlined' },
  { name: 'Hexagon', codicon: 'codicon-symbol-misc', style: 'outlined' },
  { name: 'Heart', codicon: 'codicon-heart', style: 'outlined' },
  { name: 'Flame', codicon: 'codicon-flame', style: 'outlined' },
  { name: 'Rocket', codicon: 'codicon-rocket', style: 'outlined' },
  { name: 'Cloud', codicon: 'codicon-cloud', style: 'outlined' },
  { name: 'Lightbulb', codicon: 'codicon-lightbulb', style: 'outlined' },
  { name: 'Lock', codicon: 'codicon-lock', style: 'outlined' },
  { name: 'Key', codicon: 'codicon-key', style: 'outlined' },
  { name: 'Shield', codicon: 'codicon-shield', style: 'outlined' },
  { name: 'Wrench', codicon: 'codicon-wrench', style: 'outlined' },
  { name: 'Hammer', codicon: 'codicon-tools', style: 'outlined' },
  { name: 'Gear', codicon: 'codicon-gear', style: 'outlined' },
  { name: 'Globe', codicon: 'codicon-globe', style: 'outlined' },
  { name: 'Database', codicon: 'codicon-database', style: 'outlined' },
  { name: 'Beaker', codicon: 'codicon-beaker', style: 'outlined' },
  { name: 'Bug', codicon: 'codicon-bug', style: 'outlined' },
  { name: 'Bookmark', codicon: 'codicon-bookmark', style: 'outlined' },
  { name: 'Tag', codicon: 'codicon-tag', style: 'outlined' },
];

export const FILLED_ICONS = APPEARANCE_ICONS.filter(i => i.style === 'filled');
export const OUTLINED_ICONS = APPEARANCE_ICONS.filter(i => i.style === 'outlined');
