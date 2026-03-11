/**
 * tests/convex-fetch.test.ts
 *
 * Network tests — verify CDN runtime assets are reachable and that
 * save file URLs (when provided) return bytes matching declared size + sha256.
 *
 * These tests do real HTTP requests. They are tagged as "network" and will
 * pass without any Convex credentials — they only need internet access.
 *
 * To also test authenticated Convex endpoints, set:
 *   CONVEX_TEST_AUTH_TOKEN=<clerk jwt>   in environment.
 */
import { describe, it, expect } from 'vitest'
import { RUNTIME_CONFIG } from '~/lib/constants'
import { sha256Hex } from '~/lib/save-files'

const CONVEX_URL =
  (typeof process !== 'undefined' && process.env.VITE_CONVEX_URL) ||
  'https://reliable-gecko-264.convex.cloud'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// CDN loader — must be fetchable before Unity can boot
// ---------------------------------------------------------------------------
describe('CDN: loader.js', () => {
  it('is reachable (HTTP 200)', async () => {
    const resp = await fetchWithTimeout(RUNTIME_CONFIG.loaderUrl)
    expect(resp.status).toBe(200)
  }, 20_000)

  it('is non-empty (>1 KB)', async () => {
    const resp = await fetchWithTimeout(RUNTIME_CONFIG.loaderUrl)
    const buf = await resp.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(1_000)
  }, 20_000)
})

// ---------------------------------------------------------------------------
// CDN framework.js — large file, HEAD-only to keep test fast
// ---------------------------------------------------------------------------
describe('CDN: framework.js', () => {
  it('responds to HEAD with 200', async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)
    const resp = await fetch(RUNTIME_CONFIG.frameworkUrl, {
      method: 'HEAD',
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    expect(resp.status).toBe(200)
  }, 20_000)
})

// ---------------------------------------------------------------------------
// CDN code parts (only first of 2)
// ---------------------------------------------------------------------------
describe('CDN: code part 1', () => {
  it('is reachable (HEAD 200)', async () => {
    const url = RUNTIME_CONFIG.codeParts[0]
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 15_000)
    const resp = await fetch(url, { method: 'HEAD' })
    expect(resp.status).toBe(200)
  }, 20_000)
})

// ---------------------------------------------------------------------------
// CDN data part 1 of 45 — HEAD only
// ---------------------------------------------------------------------------
describe('CDN: data part 1', () => {
  it('is reachable (HEAD 200)', async () => {
    const url = RUNTIME_CONFIG.dataParts[0]
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 15_000)
    const resp = await fetch(url, { method: 'HEAD' })
    expect(resp.status).toBe(200)
  }, 20_000)
})

// ---------------------------------------------------------------------------
// Convex HTTP API — basic connectivity (no auth needed)
// ---------------------------------------------------------------------------
describe('Convex HTTP API', () => {
  it('is reachable and returns a JSON response for any query', async () => {
    const resp = await fetchWithTimeout(`${CONVEX_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'saves:getLaunchBundle', args: { runtimeSlug: 'default' } }),
    } as any)
    // Without auth, Convex returns 200 with the query result (null profile → null)
    // or 400/401 — either way, it proves the endpoint is reachable
    expect([200, 400, 401]).toContain(resp.status)
  }, 15_000)
})

// ---------------------------------------------------------------------------
// Authenticated save URL tests — skipped when no token provided
// ---------------------------------------------------------------------------
const authToken =
  typeof process !== 'undefined' ? process.env.CONVEX_TEST_AUTH_TOKEN : undefined

async function getLaunchBundle(token: string) {
  const resp = await fetchWithTimeout(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path: 'saves:getLaunchBundle', args: { runtimeSlug: 'default' } }),
  } as any)
  if (!resp.ok) throw new Error(`Convex error ${resp.status}: ${await resp.text()}`)
  const json = (await resp.json()) as { status: string; value: unknown; errorMessage?: string }
  if (json.status !== 'success') throw new Error(json.errorMessage ?? 'query failed')
  return json.value as null | {
    activeRevision: null | {
      bundleHash: string
      fileCount: number
      byteSize: number
      files: Array<{ path: string; size: number; sha256: string; url: string | null }>
    }
  }
}

describe('Convex: getLaunchBundle (authenticated)', () => {
  it.skipIf(!authToken)('returns a valid bundle structure', async () => {
    const bundle = await getLaunchBundle(authToken!)
    // May be null if user has no saves, but the API call itself must succeed
    console.log('[getLaunchBundle]', JSON.stringify(bundle, null, 2))
    if (bundle?.activeRevision) {
      expect(bundle.activeRevision.fileCount).toBeGreaterThan(0)
      expect(bundle.activeRevision.files).toHaveLength(bundle.activeRevision.fileCount)
      expect(bundle.activeRevision.bundleHash).toMatch(/^[0-9a-f]{64}$/)
    }
  }, 30_000)

  it.skipIf(!authToken)('each save file URL returns the declared bytes with matching sha256', async () => {
    const bundle = await getLaunchBundle(authToken!)
    if (!bundle?.activeRevision) {
      console.warn('No active revision — upload saves first to test URLs')
      return
    }

    for (const file of bundle.activeRevision.files) {
      if (!file.url) {
        console.warn(`No URL for ${file.path}`)
        continue
      }

      const resp = await fetchWithTimeout(file.url, undefined, 30_000)
      expect(resp.status, `${file.path} fetch status`).toBe(200)

      const bytes = new Uint8Array(await resp.arrayBuffer())
      expect(bytes.length, `${file.path} size`).toBe(file.size)

      const hash = await sha256Hex(bytes)
      expect(hash, `${file.path} sha256`).toBe(file.sha256)

      console.log(`  ✓ ${file.path}: ${bytes.length} bytes sha256 ok`)
    }
  }, 120_000)
})
