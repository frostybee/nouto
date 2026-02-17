<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  let { name, size = 16 }: Props = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  class="palette-icon-svg"
  aria-hidden="true"
>
  {#if name === 'globe'}
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
    <ellipse cx="8" cy="8" rx="3" ry="6.5" stroke="currentColor" stroke-width="1.2"/>
    <line x1="1.5" y1="8" x2="14.5" y2="8" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'symbol-structure'}
    <rect x="2" y="2" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
    <rect x="9" y="6.5" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
    <rect x="2" y="11" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M7 3.5H8.5V12.5H7" stroke="currentColor" stroke-width="1.2"/>
    <line x1="8.5" y1="8" x2="9" y2="8" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'plug'}
    <path d="M6 1v3M10 1v3M4 4h8v3a4 4 0 01-4 4 4 4 0 01-4-4V4zM8 11v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'broadcast'}
    <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2"/>
    <path d="M4.5 4.5a5 5 0 000 7M11.5 4.5a5 5 0 010 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M2.5 2.5a8 8 0 000 11M13.5 2.5a8 8 0 010 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else if name === 'folder'}
    <path d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v7a1 1 0 01-1 1h-10a1 1 0 01-1-1v-8.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  {:else if name === 'folder-library'}
    <path d="M1.5 5a1 1 0 011-1h3l1.5 1.5h6a1 1 0 011 1v5.5a1 1 0 01-1 1h-10a1 1 0 01-1-1V5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M3.5 4V2.5a1 1 0 011-1h3l1 1h4a1 1 0 011 1V4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
  {:else if name === 'add'}
    <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  {:else if name === 'file-code'}
    <path d="M3 2a1 1 0 011-1h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M9 1v4h4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M6.5 8L5 9.5 6.5 11M9.5 8L11 9.5 9.5 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'cloud-download'}
    <path d="M4 11a3 3 0 01-.5-5.96A4.5 4.5 0 0112.5 6 3 3 0 0112 11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 8v5M6 11.5L8 13.5l2-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'terminal'}
    <rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <path d="M4 6l2.5 2L4 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="8" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else if name === 'link'}
    <path d="M6.5 9.5l3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M9 7l1.5-1.5a2.12 2.12 0 00-3-3L6 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M7 9l-1.5 1.5a2.12 2.12 0 003 3L10 12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'save'}
    <path d="M3 1.5h8.5L14 4v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="5" y="1.5" width="5" height="4" stroke="currentColor" stroke-width="1.2"/>
    <rect x="4.5" y="9" width="7" height="4" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'save-all'}
    <path d="M5 3.5h7l2 2v7a1 1 0 01-1 1H5a1 1 0 01-1-1V4.5a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M2 2v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <rect x="6.5" y="9" width="5" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'copy'}
    <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <path d="M11 5V3a1 1 0 00-1-1H4a1 1 0 00-1 1v7a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'code'}
    <path d="M5 4L1 8l4 4M11 4l4 4-4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'files'}
    <rect x="4" y="4" width="9" height="10" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <path d="M11 4V3a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'trash'}
    <path d="M3 4h10M6 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 4l.7 9.1a1 1 0 001 .9h4.6a1 1 0 001-.9L12 4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="6.5" y1="7" x2="6.5" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="9.5" y1="7" x2="9.5" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else if name === 'edit'}
    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="9.5" y1="3.5" x2="12.5" y2="6.5" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'play-circle'}
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M6.5 5.5l4 2.5-4 2.5V5.5z" fill="currentColor"/>
  {:else if name === 'play'}
    <path d="M4 2.5l9 5.5-9 5.5V2.5z" fill="currentColor"/>
  {:else if name === 'server'}
    <rect x="2" y="2" width="12" height="4" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <rect x="2" y="10" width="12" height="4" rx="1" stroke="currentColor" stroke-width="1.2"/>
    <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="5" cy="4" r="0.7" fill="currentColor"/>
    <circle cx="5" cy="12" r="0.7" fill="currentColor"/>
  {:else if name === 'dashboard'}
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M8 5v3l2 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'settings-gear'}
    <circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else if name === 'database'}
    <ellipse cx="8" cy="4" rx="5.5" ry="2.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M2.5 4v8c0 1.38 2.46 2.5 5.5 2.5s5.5-1.12 5.5-2.5V4" stroke="currentColor" stroke-width="1.2"/>
    <path d="M2.5 8c0 1.38 2.46 2.5 5.5 2.5s5.5-1.12 5.5-2.5" stroke="currentColor" stroke-width="1.2"/>
  {:else if name === 'clear-all'}
    <line x1="3" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="3" y1="12" x2="9" y2="12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M11 10.5l2 2m0-2l-2 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else if name === 'clock'}
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
    <path d="M8 4v4l2.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
  {:else if name === 'search'}
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.2"/>
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  {:else}
    <!-- Fallback: simple circle dot -->
    <circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.2"/>
  {/if}
</svg>

<style>
  .palette-icon-svg {
    display: block;
    flex-shrink: 0;
  }
</style>
