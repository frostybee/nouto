/**
 * Editor and textarea utilities
 */

/**
 * Handle tab key in textarea to insert spaces instead of changing focus
 * @param event - The keyboard event
 * @param updateFn - Callback to update the textarea content
 * @param indentSize - Number of spaces to insert (default: 2)
 */
export function handleTextareaTab(
  event: KeyboardEvent,
  updateFn: (newValue: string) => void,
  indentSize: number = 2
): void {
  if (event.key === 'Tab') {
    event.preventDefault();
    const target = event.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const value = target.value;
    const indent = ' '.repeat(indentSize);
    const newValue = value.substring(0, start) + indent + value.substring(end);
    updateFn(newValue);
    // Set cursor position after the inserted indent
    setTimeout(() => {
      target.selectionStart = target.selectionEnd = start + indentSize;
    }, 0);
  }
}
