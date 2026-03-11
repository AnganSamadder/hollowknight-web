import * as React from 'react'
import { RUNTIME_CONFIG } from './constants'

const CACHE_NAME = 'hk-runtime-v1'

// All binary parts worth caching. loaderUrl is excluded — it's injected as a
// <script> tag via appendRuntimeScript, not fetched as a binary blob.
function getAllPartUrls(): string[] {
  return [
    RUNTIME_CONFIG.frameworkUrl,
    ...RUNTIME_CONFIG.codeParts,
    ...RUNTIME_CONFIG.dataParts,
  ]
}

// Check the Cache API first; fetch from network + store on miss.
export async function getCachedOrFetch(url: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(url)
  if (cached) return cached.arrayBuffer()

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (HTTP ${response.status})`)
  }
  // Read the body once into an ArrayBuffer, then cache a fresh Response from
  // that buffer. Using response.clone() risks double-consuming the stream.
  const buffer = await response.arrayBuffer()
  await cache.put(url, new Response(buffer, {
    status: response.status,
    headers: response.headers,
  }))
  return buffer
}

// Returns true only if every part URL is already present in the cache.
export async function isRuntimeCached(): Promise<boolean> {
  const cache = await caches.open(CACHE_NAME)
  const urls = getAllPartUrls()
  const checks = await Promise.all(urls.map((url) => cache.match(url)))
  return checks.every(Boolean)
}

// Download all parts to cache sequentially (mirrors resolveRuntimePayload),
// firing onProgress(loaded, total) after each part completes.
export async function preloadRuntimeToCache(
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  const urls = getAllPartUrls()
  let loaded = 0
  for (const url of urls) {
    await getCachedOrFetch(url)
    loaded++
    onProgress(loaded, urls.length)
  }
}

// Module-level flag prevents concurrent preload runs, including React
// StrictMode's intentional double-invocation of effects in development.
let preloadStarted = false

// Starts a background cache warm-up on first mount for signed-in users.
// Returns { cacheReady, cacheProgress } — cacheProgress is 0–1.
export function useRuntimePreload(): { cacheReady: boolean; cacheProgress: number } {
  const [cacheReady, setCacheReady] = React.useState(false)
  const [cacheProgress, setCacheProgress] = React.useState(0)

  React.useEffect(() => {
    // Cache API is not available server-side.
    if (typeof caches === 'undefined') return
    if (preloadStarted) return
    preloadStarted = true

    void (async () => {
      const alreadyCached = await isRuntimeCached()
      if (alreadyCached) {
        setCacheReady(true)
        setCacheProgress(1)
        return
      }

      await preloadRuntimeToCache((loaded, total) => {
        setCacheProgress(loaded / total)
      })
      setCacheReady(true)
    })()
  }, [])

  return { cacheReady, cacheProgress }
}
