import { apiSend, ApiError } from '../api';

// A small, honest offline-write queue for the handful of forms a barn tablet actually
// needs offline (milk, feed, daily activities, attendance): if the network is down when
// one of these is submitted, the entry is kept on-device in localStorage instead of being
// lost, and is replayed automatically the moment connectivity returns. Deliberately NOT
// wired into every write in the app — things like login, farm creation, or payments need
// a real round trip and should fail loudly, not be silently queued.

export interface QueuedWrite {
  id: string;
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body: any;
  label: string;
  createdAt: number;
}

const STORAGE_KEY = 'dairyos_offline_queue';

function readQueue(): QueuedWrite[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function writeQueue(items: QueuedWrite[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn(items));
}

type Listener = (items: QueuedWrite[]) => void;
const listeners = new Set<Listener>();

// Lets UI (the offline banner) react to queue changes without polling.
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  fn(readQueue());
  return () => { listeners.delete(fn); };
}

export function getQueue(): QueuedWrite[] {
  return readQueue();
}

function enqueue(entry: Omit<QueuedWrite, 'id' | 'createdAt'>): QueuedWrite {
  const item: QueuedWrite = { ...entry, id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() };
  writeQueue([...readQueue(), item]);
  return item;
}

// Sends a write immediately if possible; if the network is down (or the browser thinks
// it's online but the request can't actually complete), the write is queued instead of
// thrown away. A real server error (validation, auth, conflict — anything that got a
// response) is NOT queued, since retrying it later wouldn't succeed either; it's thrown
// so the form can show the actual problem.
export async function sendOrQueue(
  path: string, method: 'POST' | 'PATCH' | 'DELETE', body: any, label: string
): Promise<{ queued: boolean; data?: any }> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueue({ path, method, body, label });
    return { queued: true };
  }
  try {
    const data = await apiSend(path, method, body);
    return { queued: false, data };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // fetch() itself threw — a real connectivity failure, not a completed HTTP response.
    enqueue({ path, method, body, label });
    return { queued: true };
  }
}

let syncing = false;

export async function trySync(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const pending = readQueue();
  if (pending.length === 0) return;
  syncing = true;
  let syncedAny = false;
  try {
    for (const item of pending) {
      try {
        await apiSend(item.path, item.method, item.body);
        writeQueue(readQueue().filter((i) => i.id !== item.id));
        syncedAny = true;
      } catch (e) {
        if (e instanceof ApiError) {
          // The server rejected it outright (now-invalid data, farm deleted, etc.) —
          // retrying forever won't help, so drop it rather than jam the queue.
          writeQueue(readQueue().filter((i) => i.id !== item.id));
          console.warn(`[offline-queue] dropped "${item.label}": ${e.message}`);
        } else {
          // Still offline / connection dropped mid-sync — stop here, keep the rest
          // queued, and let the next trigger (reconnect, interval, app open) retry.
          break;
        }
      }
    }
  } finally {
    syncing = false;
    // Tells every open useAsync-backed view to quietly refetch — the data just synced
    // is otherwise invisible until something happens to reload it.
    if (syncedAny && typeof window !== 'undefined') window.dispatchEvent(new Event('dairyos:refresh'));
  }
}

let initialized = false;
export function initOfflineSync() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('online', () => { trySync(); });
  // Some tablet browsers/WebViews fire online/offline unreliably, so a periodic
  // safety-net retry keeps the queue from getting stuck silently.
  setInterval(() => { trySync(); }, 20_000);
  trySync();
}
