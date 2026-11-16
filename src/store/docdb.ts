import { LeraDoc } from '../ingest/types';

/**
 * Notes live in IndexedDB, not in localStorage: a 400-page book is several
 * megabytes once it has been turned into lessons, and localStorage stops at
 * about five. Everything else (progress, highlights, settings) is small and
 * stays where it was.
 */

const DB = 'lera';
const STORE = 'docs';

export const idbAvailable = (): boolean => typeof indexedDB !== 'undefined';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export const idbAll = (): Promise<LeraDoc[]> => run<LeraDoc[]>('readonly', (s) => s.getAll() as IDBRequest<LeraDoc[]>);
export const idbPut = (doc: LeraDoc): Promise<unknown> => run('readwrite', (s) => s.put(doc));
export const idbDelete = (id: string): Promise<unknown> => run('readwrite', (s) => s.delete(id));
export const idbClear = (): Promise<unknown> => run('readwrite', (s) => s.clear());
