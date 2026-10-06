/**
 * Draws a mouse pointer for recordings, since screencast frames don't include
 * the OS cursor. The recorder positions it through window.__mediaCursor and
 * window.__mediaClick rather than mouse events: events over iframes (VS Code
 * webviews) never reach the top page.
 *
 * Self-contained so Playwright can serialize it for addInitScript, which runs
 * before <body> exists and in every frame.
 */
export function installFakeCursor(): void {
  if (window !== window.top) return;

  let cursor: HTMLDivElement | null = null;
  let pending: [number, number] | null = null;

  const place = (x: number, y: number) => {
    // The arrow tip sits at (3, 2) inside the SVG
    if (cursor) cursor.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
    else pending = [x, y];
  };

  const ring = (x: number, y: number) => {
    if (!document.body) return;
    const el = document.createElement('div');
    el.className = 'media-click-ring';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  };

  const mount = () => {
    const style = document.createElement('style');
    style.textContent = `
      #media-cursor {
        position: fixed; left: 0; top: 0; width: 22px; height: 22px;
        pointer-events: none; z-index: 2147483647; transform: translate(-100px, -100px);
      }
      #media-cursor svg { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6)); }
      .media-click-ring {
        position: fixed; width: 28px; height: 28px; margin: -14px 0 0 -14px;
        border: 2px solid rgba(255, 255, 255, 0.85); border-radius: 50%;
        pointer-events: none; z-index: 2147483646;
        animation: media-click-ring 450ms ease-out forwards;
      }
      @keyframes media-click-ring {
        from { transform: scale(0.4); opacity: 1; }
        to { transform: scale(1.4); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    cursor = document.createElement('div');
    cursor.id = 'media-cursor';
    cursor.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22">
      <path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.2 19.2 L10.1 12.7 L16.2 12.7 Z"
        fill="#ffffff" stroke="#000000" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;
    document.body.appendChild(cursor);
    if (pending) place(...pending);
  };

  (window as any).__mediaCursor = place;
  (window as any).__mediaClick = ring;
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
