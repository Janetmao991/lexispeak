import { SessionRecord } from '../types';

const KEY = 'lexispeak_history_v1';
const MAX = 50;

export const historyService = {
  getAll: (): SessionRecord[] => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch {
      return [];
    }
  },
  add: (record: SessionRecord) => {
    const all = [record, ...historyService.getAll()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(all));
  },
  remove: (id: string) => {
    localStorage.setItem(KEY, JSON.stringify(historyService.getAll().filter(r => r.id !== id)));
  },
};
