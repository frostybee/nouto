import type { Collection, EnvironmentsData } from '../types';

export interface IStorageStrategy {
  loadCollections(): Promise<Collection[]>;
  saveCollections(collections: Collection[]): Promise<boolean>;
  loadEnvironments(): Promise<EnvironmentsData>;
  saveEnvironments(data: EnvironmentsData): Promise<boolean>;
  getStorageDir(): string;
}
