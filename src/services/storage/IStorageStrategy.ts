import type { Collection, HistoryEntry, EnvironmentsData } from '../types';

export interface IStorageStrategy {
  loadCollections(): Promise<Collection[]>;
  saveCollections(collections: Collection[]): Promise<boolean>;
  loadHistory(): Promise<HistoryEntry[]>;
  saveHistory(history: HistoryEntry[]): Promise<boolean>;
  loadEnvironments(): Promise<EnvironmentsData>;
  saveEnvironments(data: EnvironmentsData): Promise<boolean>;
  getStorageDir(): string;
}
