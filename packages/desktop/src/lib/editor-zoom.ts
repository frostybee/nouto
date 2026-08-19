// Ctrl/⌘ + mouse wheel over a code editor steps the editor font size, the
// same setting the Settings page exposes, so the change persists and every
// CodeMirror and Monaco instance follows (they all read --hf-editor-font-size
// and re-measure on `nouto-font-change`). The rest of the UI is unaffected;
// Tauri already disables the webview's own page zoom, and this handler only
// claims the event when the pointer is over an editor.

import { editorFontSize, setEditorFontSize, FONT_SIZES } from '@nouto/ui/stores/theme.svelte';

const MIN = Math.min(...FONT_SIZES);
const MAX = Math.max(...FONT_SIZES);

/** Trackpads emit many small deltas per gesture; one step per this much scroll. */
const DELTA_PER_STEP = 40;

const EDITOR_SELECTOR = '.cm-editor, .monaco-editor';

function isOverEditor(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITOR_SELECTOR) !== null;
}

/** Next size in the FONT_SIZES ladder, so wheel steps match the Settings dropdown. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  const ladder = FONT_SIZES;
  const index = ladder.findIndex((s) => s >= current);
  // Above the ladder: any step lands on the top rung.
  if (index === -1) return MAX;
  const exact = ladder[index] === current;
  // Between rungs: "up" snaps to the next rung, "down" to the previous one.
  const nextIndex = direction > 0 ? (exact ? index + 1 : index) : index - 1;
  return ladder[Math.max(0, Math.min(ladder.length - 1, nextIndex))];
}

/**
 * Install the handler on `window` (capture phase, so it runs before the
 * editor's own scroll handling). Returns a teardown.
 */
export function initEditorWheelZoom(isMac: boolean): () => void {
  let accumulated = 0;

  const onWheel = (e: WheelEvent) => {
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    if (!modifier || !isOverEditor(e.target)) return;
    // Never let the webview treat it as page zoom or scroll the editor.
    e.preventDefault();
    e.stopPropagation();

    accumulated += e.deltaY;
    if (Math.abs(accumulated) < DELTA_PER_STEP) return;
    const direction: 1 | -1 = accumulated < 0 ? 1 : -1;
    accumulated = 0;

    const next = stepFontSize(editorFontSize(), direction);
    if (next !== editorFontSize() && next >= MIN && next <= MAX) setEditorFontSize(next);
  };

  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => window.removeEventListener('wheel', onWheel, { capture: true });
}
