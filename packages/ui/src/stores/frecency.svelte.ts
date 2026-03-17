// ─── Types ───

export interface FrecencyData {
  requestId: string;
  openCount: number;
  lastOpened: number; // timestamp in milliseconds
  score: number;
}

export interface FrecencyMap {
  [requestId: string]: FrecencyData;
}

// ─── Constants ───

const STORAGE_KEY = 'nouto.frecency';
const MAX_ENTRIES = 1000; // Limit storage to prevent unbounded growth
const DECAY_FACTOR = 0.75; // How much older items decay (0 = full decay, 1 = no decay)
const FREQUENCY_WEIGHT = 0.4; // Weight of frequency in final score
const RECENCY_WEIGHT = 0.6; // Weight of recency in final score

// ─── Store Initialization ───

/**
 * Load frecency data from localStorage
 */
function loadFrecencyData(): FrecencyMap {
  if (typeof window === 'undefined') return {};

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const parsed = JSON.parse(stored);
    return parsed || {};
  } catch (error) {
    console.error('Failed to load frecency data:', error);
    return {};
  }
}

/**
 * Save frecency data to localStorage
 */
function saveFrecencyData(data: FrecencyMap): void {
  if (typeof window === 'undefined') return;

  try {
    // Limit the number of entries to prevent unbounded growth
    const entries = Object.entries(data);
    if (entries.length > MAX_ENTRIES) {
      // Sort by score and keep only top MAX_ENTRIES
      const sorted = entries.sort((a, b) => b[1].score - a[1].score);
      const limited = Object.fromEntries(sorted.slice(0, MAX_ENTRIES));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limited));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    console.error('Failed to save frecency data:', error);
  }
}

// ─── Frecency Calculation ───

/**
 * Calculate frecency score based on frequency and recency
 *
 * Algorithm:
 * - Frequency score: normalized by max open count
 * - Recency score: exponential decay based on time elapsed
 * - Final score: weighted combination (40% frequency + 60% recency)
 */
function calculateFrecencyScore(openCount: number, lastOpened: number, maxOpenCount: number): number {
  const now = Date.now();
  const hoursSinceLastOpen = (now - lastOpened) / (1000 * 60 * 60);

  // Frequency score (0-1, normalized by max)
  const frequencyScore = maxOpenCount > 0 ? openCount / maxOpenCount : 0;

  // Recency score (0-1, exponential decay)
  // Items opened within 1 hour = 1.0
  // Items opened 24 hours ago = ~0.5
  // Items opened 1 week ago = ~0.1
  const recencyScore = Math.pow(DECAY_FACTOR, hoursSinceLastOpen / 24);

  // Combined score
  const score = (frequencyScore * FREQUENCY_WEIGHT) + (recencyScore * RECENCY_WEIGHT);

  return score;
}

/**
 * Recalculate all frecency scores
 */
function recalculateScores(data: FrecencyMap): FrecencyMap {
  const entries = Object.values(data);
  const maxOpenCount = Math.max(...entries.map(e => e.openCount), 1);

  const updated: FrecencyMap = {};
  for (const [requestId, entry] of Object.entries(data)) {
    updated[requestId] = {
      ...entry,
      score: calculateFrecencyScore(entry.openCount, entry.lastOpened, maxOpenCount),
    };
  }

  return updated;
}

// ─── Store ───

const _frecencyData = $state<{ value: FrecencyMap }>({ value: loadFrecencyData() });
export function frecencyData(): FrecencyMap { return _frecencyData.value; }

/**
 * Record that a request was opened
 */
export function recordOpen(requestId: string): void {
  const existing = _frecencyData.value[requestId];
  const now = Date.now();

  const updated = {
    ..._frecencyData.value,
    [requestId]: {
      requestId,
      openCount: (existing?.openCount || 0) + 1,
      lastOpened: now,
      score: 0, // Will be recalculated below
    },
  };

  // Recalculate all scores with new data
  const recalculated = recalculateScores(updated);

  // Persist to localStorage
  saveFrecencyData(recalculated);

  _frecencyData.value = recalculated;
}

/**
 * Get frecency score for a specific request (0-1, higher = more relevant)
 */
export function getScore(requestId: string): number {
  return _frecencyData.value[requestId]?.score || 0;
}

/**
 * Get all frecency entries sorted by score (highest first)
 */
export function getSortedEntries(): FrecencyData[] {
  return Object.values(_frecencyData.value).sort((a, b) => b.score - a.score);
}

/**
 * Remove a request from frecency data (when deleted)
 */
export function removeFrecency(requestId: string): void {
  const { [requestId]: removed, ...remaining } = _frecencyData.value;
  saveFrecencyData(remaining);
  _frecencyData.value = remaining;
}

/**
 * Clear all frecency data
 */
export function clearFrecency(): void {
  _frecencyData.value = {};
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Recalculate all scores (call periodically or on app startup)
 */
export function recalculate(): void {
  const recalculated = recalculateScores(_frecencyData.value);
  saveFrecencyData(recalculated);
  _frecencyData.value = recalculated;
}

// ─── Derived Values ───

/**
 * Recent requests (sorted by last opened time)
 */
export function recentRequests(): string[] {
  return Object.values(_frecencyData.value)
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .map(entry => entry.requestId);
}

/**
 * Frequently used requests (sorted by open count)
 */
export function frequentRequests(): string[] {
  return Object.values(_frecencyData.value)
    .sort((a, b) => b.openCount - a.openCount)
    .map(entry => entry.requestId);
}

/**
 * Top requests by frecency score
 */
export function topRequests(): string[] {
  return Object.values(_frecencyData.value)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(entry => entry.requestId);
}

// ─── Initialization ───

// Recalculate scores on app startup
if (typeof window !== 'undefined') {
  recalculate();

  // Recalculate scores every 5 minutes to keep decay accurate
  setInterval(() => {
    recalculate();
  }, 5 * 60 * 1000);
}
