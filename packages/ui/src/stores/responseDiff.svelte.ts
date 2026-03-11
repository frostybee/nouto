import { formatData } from '@hivefetch/core';

const _previousResponseBody = $state<{ value: string | null }>({ value: null });
const _previousResponseLabel = $state<{ value: string }>({ value: '' });

export function previousResponseBody() { return _previousResponseBody.value; }
export function previousResponseLabel() { return _previousResponseLabel.value; }

/**
 * Capture the current response as "previous" before a new response overwrites it.
 */
export function capturePreviousResponse(data: any, label?: string) {
  const formatted = formatData(data);
  if (formatted) {
    _previousResponseBody.value = formatted;
    _previousResponseLabel.value = label || 'Previous';
  }
}
