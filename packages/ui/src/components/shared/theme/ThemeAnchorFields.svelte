<script lang="ts">
  // The four anchors of an engine theme: three colours and a contrast slider,
  // with live WCAG readouts. Edits are validated (validateAnchorEdit) before
  // they reach the store; a failing edit shows why and is not committed.
  import { contrastRatio } from '../../../lib/theme/color';
  import { validateAnchorEdit } from '../../../lib/theme/anchor-validation';
  import { isHexColor } from '../../../lib/theme/schema';

  interface Props {
    accent: string;
    background: string;
    foreground: string;
    contrast: number;
    onchange: (patch: {
      accent?: string;
      background?: string;
      foreground?: string;
      contrast?: number;
    }) => void;
  }

  let { accent, background, foreground, contrast, onchange }: Props = $props();

  type Field = 'accent' | 'background' | 'foreground';
  const FIELDS: { key: Field; label: string; hint: string }[] = [
    { key: 'background', label: 'Background', hint: 'Editor and window base' },
    { key: 'foreground', label: 'Text', hint: 'Primary text colour' },
    { key: 'accent', label: 'Accent', hint: 'Buttons, links, focus' },
  ];

  // Text inputs hold what the user typed; only valid hex is committed.
  // svelte-ignore state_referenced_locally
  let drafts = $state<Record<Field, string>>({ accent, background, foreground });
  $effect(() => {
    drafts = { accent, background, foreground };
  });

  let error = $state<{ field: Field; message: string } | null>(null);

  const fgRatio = $derived(contrastRatio(foreground, background));
  const accentRatio = $derived(contrastRatio(accent, background));

  function grade(ratio: number, floor: number): { label: string; ok: boolean } {
    if (ratio >= 7) return { label: 'AAA', ok: true };
    if (ratio >= floor) return { label: floor === 4.5 ? 'AA' : 'OK', ok: true };
    return { label: 'Low', ok: false };
  }

  function commit(field: Field, value: string) {
    const next = { accent, background, foreground, [field]: value };
    const gate = validateAnchorEdit(next);
    if (!gate.valid) {
      error = { field: gate.field, message: gate.message };
      return;
    }
    error = null;
    onchange({ [field]: value });
  }

  function onColorInput(field: Field, value: string) {
    drafts[field] = value;
    commit(field, value);
  }

  function onHexInput(field: Field, raw: string) {
    const value = raw.trim();
    drafts[field] = value;
    if (!isHexColor(value)) return;
    commit(field, value.toLowerCase());
  }

  function onHexBlur(field: Field) {
    // Snap a rejected/partial draft back to the committed value.
    const committed = { accent, background, foreground }[field];
    if (drafts[field] !== committed) drafts[field] = committed;
    if (error?.field === field && isHexColor(drafts[field])) error = null;
  }
</script>

<div class="anchor-fields">
  {#each FIELDS as f (f.key)}
    <div class="anchor-row" class:invalid={error?.field === f.key}>
      <label class="anchor-label" for="anchor-{f.key}">
        {f.label}
        <span class="anchor-hint">{f.hint}</span>
      </label>
      <div class="anchor-controls">
        <input
          type="color"
          class="anchor-color"
          value={isHexColor(drafts[f.key]) ? drafts[f.key] : { accent, background, foreground }[f.key]}
          oninput={(e) => onColorInput(f.key, e.currentTarget.value)}
          aria-label="{f.label} colour picker"
        />
        <input
          id="anchor-{f.key}"
          type="text"
          class="anchor-hex"
          value={drafts[f.key]}
          spellcheck="false"
          maxlength="7"
          oninput={(e) => onHexInput(f.key, e.currentTarget.value)}
          onblur={() => onHexBlur(f.key)}
        />
        {#if f.key === 'foreground'}
          {@const g = grade(fgRatio, 4.5)}
          <span class="ratio" class:ok={g.ok} class:low={!g.ok} title="Text on background">
            {fgRatio.toFixed(1)}:1 <b>{g.label}</b>
          </span>
        {:else if f.key === 'accent'}
          {@const g = grade(accentRatio, 3)}
          <span class="ratio" class:ok={g.ok} class:low={!g.ok} title="Accent on background">
            {accentRatio.toFixed(1)}:1 <b>{g.label}</b>
          </span>
        {/if}
      </div>
    </div>
  {/each}

  <div class="anchor-row">
    <label class="anchor-label" for="anchor-contrast">
      Contrast
      <span class="anchor-hint">Surface separation and border strength</span>
    </label>
    <div class="anchor-controls">
      <input
        id="anchor-contrast"
        type="range"
        min="0"
        max="100"
        step="1"
        value={contrast}
        oninput={(e) => onchange({ contrast: Number(e.currentTarget.value) })}
      />
      <span class="contrast-value">{contrast}</span>
    </div>
  </div>

  {#if error}
    <p class="anchor-error" role="alert">{error.message}</p>
  {/if}
</div>

<style>
  .anchor-fields {
    display: flex;
    flex-direction: column;
    gap: 0.769rem;
  }

  .anchor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .anchor-label {
    display: flex;
    flex-direction: column;
    gap: 0.154rem;
    font-size: 1rem;
    color: var(--hf-foreground);
  }

  .anchor-hint {
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
  }

  .anchor-controls {
    display: flex;
    align-items: center;
    gap: 0.615rem;
  }

  .anchor-color {
    width: 2.154rem;
    height: 1.846rem;
    padding: 0;
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
    background: transparent;
    cursor: pointer;
  }

  .anchor-hex {
    width: 6rem;
    padding: 0.308rem 0.462rem;
    font-family: var(--hf-editor-font-family);
    font-size: 0.923rem;
    background: var(--hf-input-background);
    color: var(--hf-input-foreground);
    border: 1px solid var(--hf-input-border);
    border-radius: 0.308rem;
  }

  .anchor-hex:focus {
    outline: 1px solid var(--hf-focusBorder);
    outline-offset: -1px;
  }

  .anchor-row.invalid .anchor-hex {
    border-color: var(--hf-inputValidation-errorBorder);
  }

  .ratio {
    min-width: 5.5rem;
    font-size: 0.846rem;
    color: var(--hf-descriptionForeground);
    white-space: nowrap;
  }

  .ratio b {
    font-weight: 600;
    padding: 0.077rem 0.385rem;
    border-radius: 0.231rem;
    background: var(--hf-badge-background);
    color: var(--hf-badge-foreground);
  }

  .ratio.ok b {
    background: var(--hf-testing-iconPassed);
    color: var(--hf-editor-background);
  }

  .ratio.low b {
    background: var(--hf-errorForeground);
    color: var(--hf-editor-background);
  }

  input[type='range'] {
    width: 9rem;
    accent-color: var(--hf-button-background);
  }

  .contrast-value {
    min-width: 2.2rem;
    text-align: right;
    font-size: 0.923rem;
    font-variant-numeric: tabular-nums;
    color: var(--hf-foreground);
  }

  .anchor-error {
    margin: 0;
    font-size: 0.846rem;
    color: var(--hf-errorForeground);
  }
</style>
