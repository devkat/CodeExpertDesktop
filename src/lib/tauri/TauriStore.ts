import { Store } from 'tauri-plugin-store-api';
import { option, task, taskOption } from '@code-expert/prelude';

export interface TauriStore {
  get(key: string): taskOption.TaskOption<unknown>;
  set(key: string, value: unknown): task.Task<void>;
  setMany(values: Record<string, unknown>): task.Task<void>;
  delete(key: string): task.Task<void>;
  values: task.Task<Array<unknown>>;
}

export const tauriStore = (path: string): TauriStore => {
  const store = new Store(path);
  return {
    get: (key) => async () => option.fromNullable(await store.get(key)),

    set: (key, value) => async () => {
      await store.set(key, value);
      await store.save();
    },

    setMany: (values) => async () => {
      for (const [key, value] of Object.entries(values)) {
        await store.set(key, value);
      }
      await store.save();
    },

    delete: (key) => async () => {
      await store.delete(key);
      await store.save();
    },

    values: () => store.values(),
  };
};
