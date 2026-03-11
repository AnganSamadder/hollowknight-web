/**
 * Vitest global setup — polyfill IndexedDB with fake-indexeddb
 * so IDB tests run in jsdom without a real browser.
 */
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Polyfill crypto.subtle for sha256Hex in jsdom
// jsdom has crypto.subtle via node:crypto, but we wire it explicitly
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto')
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}
