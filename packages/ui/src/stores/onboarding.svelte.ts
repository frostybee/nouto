const STORAGE_KEY = 'nouto_onboarding';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  dismissedHints: string[];
  sampleCollectionLoaded: boolean;
  requestCount: number;
}

const defaultState: OnboardingState = {
  hasCompletedOnboarding: false,
  dismissedHints: [],
  sampleCollectionLoaded: false,
  requestCount: 0,
};

function loadFromStorage(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      return {
        hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? false,
        dismissedHints: parsed.dismissedHints ?? [],
        sampleCollectionLoaded: parsed.sampleCollectionLoaded ?? false,
        requestCount: parsed.requestCount ?? 0,
      };
    }
  } catch {
    // Use defaults on parse failure
  }
  return { ...defaultState };
}

// Auto-load from localStorage on module init so every webview gets correct state
let _state = $state<OnboardingState>(loadFromStorage());

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

/** Reload onboarding state from localStorage. */
export function loadOnboardingState(): void {
  const loaded = loadFromStorage();
  _state.hasCompletedOnboarding = loaded.hasCompletedOnboarding;
  _state.dismissedHints = loaded.dismissedHints;
  _state.sampleCollectionLoaded = loaded.sampleCollectionLoaded;
  _state.requestCount = loaded.requestCount;
}

/** Returns true if the user has never completed onboarding. */
export function isFirstRun(): boolean {
  return !_state.hasCompletedOnboarding;
}

/** Returns true if a specific hint should be shown. */
export function isHintVisible(hintId: string): boolean {
  return !_state.hasCompletedOnboarding && !_state.dismissedHints.includes(hintId);
}

/** Dismiss a specific hint. */
export function dismissHint(hintId: string): void {
  if (!_state.dismissedHints.includes(hintId)) {
    _state.dismissedHints = [..._state.dismissedHints, hintId];
    persist();
  }
}

/** Mark onboarding as complete. All hints stop showing. */
export function completeOnboarding(): void {
  _state.hasCompletedOnboarding = true;
  persist();
}

/** Reset onboarding state (re-enable welcome screen + hints). */
export function resetOnboarding(): void {
  _state.hasCompletedOnboarding = false;
  _state.dismissedHints = [];
  _state.sampleCollectionLoaded = false;
  _state.requestCount = 0;
  persist();
}

/** Mark that the sample collection has been loaded. */
export function markSampleLoaded(): void {
  _state.sampleCollectionLoaded = true;
  persist();
}

/** Returns true if the sample collection has been loaded. */
export function isSampleLoaded(): boolean {
  return _state.sampleCollectionLoaded;
}

/**
 * Track a completed request. After 3 successful requests,
 * onboarding completes automatically.
 */
export function trackRequest(): void {
  if (_state.hasCompletedOnboarding) return;
  _state.requestCount++;
  persist();
  if (_state.requestCount >= 3) {
    completeOnboarding();
  }
}
