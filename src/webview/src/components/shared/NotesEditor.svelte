<script lang="ts">
  interface Props {
    value: string;
    onchange: (value: string) => void;
  }
  let { value, onchange }: Props = $props();

  function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onchange(target.value);
  }
</script>

<div class="notes-editor">
  <textarea
    class="notes-textarea"
    placeholder="Add notes or description for this request..."
    value={value}
    oninput={handleInput}
  ></textarea>
</div>

<style>
  .notes-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .notes-textarea {
    flex: 1;
    width: 100%;
    min-height: 120px;
    padding: 10px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: 13px;
    line-height: 1.5;
    resize: vertical;
  }

  .notes-textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }

  .notes-textarea::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
</style>
