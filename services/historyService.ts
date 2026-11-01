import { SessionRecord } from '../types';
import { IS_DEMO, demoStore, demoFixture } from './demo';

const KEY = 'lexispeak_history_v1';
const MAX = 50;

// Demo mode keeps its own copy in this tab's sessionStorage, seeded from the fixture.
const store = IS_DEMO ? demoStore : localStorage;
const read = (): string => store.getItem(KEY) ?? (IS_DEMO ? JSON.stringify(demoFixture().history) : '[]');

export const historyService = {
  getAll: (): SessionRecord[] => {
    try {
      return JSON.parse(read());
    } catch {
      return [];
    }
  },
  add: (record: SessionRecord) => {
    const all = [record, ...historyService.getAll()].slice(0, MAX);
    store.setItem(KEY, JSON.stringify(all));
  },
  remove: (id: string) => {
    store.setItem(KEY, JSON.stringify(historyService.getAll().filter(r => r.id !== id)));
  },
};
