/**
 * tests/runtime-cache.test.ts
 *
 * Tests for src/lib/runtime-cache.ts — getCachedOrFetch, isRuntimeCached,
 * getAllPartUrls count, and the cache round-trip.
 *
 * Uses vitest's mocking to avoid real network calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RUNTIME_CONFIG } from '~/lib/constants'

// ---------------------------------------------------------------------------
// getAllPartUrls count test — no mocking needed, pure logic
// ---------------------------------------------------------------------------
describe('RUNTIME_CONFIG URL counts', () => {
  it('has exactly 2 code parts', () => {
    expect(RUNTIME_CONFIG.codeParts).toHaveLength(2)
  })

  it('has exactly 45 data parts', () => {
    expect(RUNTIME_CONFIG.dataParts).toHaveLength(45)
  })

  it('all URLs are non-empty strings starting with https', () => {
    const allUrls = [
      RUNTIME_CONFIG.loaderUrl,
      RUNTIME_CONFIG.frameworkUrl,
      ...RUNTIME_CONFIG.codeParts,
      ...RUNTIME_CONFIG.dataParts,
    ]
    for (const url of allUrls) {
      expect(url, `URL should be a string: ${url}`).toBeTypeOf('string')
      expect(url.startsWith('https'), `URL should start with https: ${url}`).toBe(true)
    }
  })

  it('all URLs are unique (no duplicates)', () => {
    const allUrls = [
      RUNTIME_CONFIG.loaderUrl,
      RUNTIME_CONFIG.frameworkUrl,
      ...RUNTIME_CONFIG.codeParts,
      ...RUNTIME_CONFIG.dataParts,
    ]
    const unique = new Set(allUrls)
    expect(unique.size).toBe(allUrls.length)
  })

  it('loaderUrl and frameworkUrl are different', () => {
    expect(RUNTIME_CONFIG.loaderUrl).not.toBe(RUNTIME_CONFIG.frameworkUrl)
  })
})

// ---------------------------------------------------------------------------
// getCachedOrFetch — with a mocked Cache API
// ---------------------------------------------------------------------------
describe('getCachedOrFetch', () => {
  type CacheEntry = { buffer: ArrayBuffer }
  const fakeStore = new Map<string, CacheEntry>()

  const fakeCache = {
    match: vi.fn(async (url: string) => {
      const entry = fakeStore.get(url)
      if (!entry) return undefined
      return {
        arrayBuffer: async () => entry.buffer,
        ok: true,
      } as unknown as Response
    }),
    put: vi.fn(async (url: string, response: Response) => {
      const buf = await response.arrayBuffer()
      fakeStore.set(url, { buffer: buf })
    }),
  }

  const fakeCaches = {
    open: vi.fn(async () => fakeCache),
  }

  beforeEach(() => {
    fakeStore.clear()
    fakeCache.match.mockClear()
    fakeCache.put.mockClear()
    fakeCaches.open.mockClear()
    vi.stubGlobal('caches', fakeCaches)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from network on cache miss and returns buffer', async () => {
    const testBuffer = new TextEncoder().encode('hello world').buffer as ArrayBuffer

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => testBuffer,
    })))

    const { getCachedOrFetch } = await import('~/lib/runtime-cache')
    const result = await getCachedOrFetch('https://example.com/test.js')

    expect(result.byteLength).toBe(testBuffer.byteLength)
    expect(fakeCache.put).toHaveBeenCalledOnce()
  })

  it('returns cached buffer on cache hit without fetching', async () => {
    const cachedBuffer = new TextEncoder().encode('cached content').buffer as ArrayBuffer
    fakeStore.set('https://example.com/cached.js', { buffer: cachedBuffer })

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { getCachedOrFetch } = await import('~/lib/runtime-cache')
    const result = await getCachedOrFetch('https://example.com/cached.js')

    expect(result.byteLength).toBe(cachedBuffer.byteLength)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// isRuntimeCached
// ---------------------------------------------------------------------------
describe('isRuntimeCached', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('returns false when cache is empty', async () => {
    const fakeCache = {
      match: vi.fn(async () => undefined),
    }
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache) })

    const { isRuntimeCached } = await import('~/lib/runtime-cache')
    const result = await isRuntimeCached()
    expect(result).toBe(false)
  })

  it('returns true when all part URLs are in cache', async () => {
    const allParts = new Set([
      RUNTIME_CONFIG.frameworkUrl,
      ...RUNTIME_CONFIG.codeParts,
      ...RUNTIME_CONFIG.dataParts,
    ])

    const fakeCache = {
      match: vi.fn(async (url: string) => {
        if (allParts.has(url)) return { ok: true } as Response
        return undefined
      }),
    }
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache) })

    const { isRuntimeCached } = await import('~/lib/runtime-cache')
    const result = await isRuntimeCached()
    expect(result).toBe(true)
  })
})
