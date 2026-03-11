const state = $state<{ value: Set<string> }>({ value: new Set() });

export function dirtyRequestIds() { return state.value; }

export function setDirtyRequestIds(ids: string[]) {
  state.value = new Set(ids);
}
