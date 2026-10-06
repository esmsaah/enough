// Enough — local persistence. Section 8 & 11 of ENOUGH_BRIEF.md.
// Only redacted Items and flow state are stored, in IndexedDB, on the device.
// Raw files are never stored. A "Delete everything" action clears it.

import { del, get, set } from 'idb-keyval';
import type { State } from './state';

const KEY = 'enough-audit-v1';

export async function saveState(state: State): Promise<void> {
  try {
    await set(KEY, state);
  } catch {
    /* storage unavailable (private mode) — the app still works in-memory */
  }
}

export async function loadState(): Promise<State | undefined> {
  try {
    return (await get(KEY)) as State | undefined;
  } catch {
    return undefined;
  }
}

export async function clearEverything(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    /* ignore */
  }
}
