import { RUNTIME_CONFIG, SAVE_SYNC_INTERVAL_MS } from './constants'
import { getCachedOrFetch, isRuntimeCached } from './runtime-cache'
import {
  buildBundleHash,
  type RuntimePreflightResult,
  sha256Hex,
} from './save-files'

declare global {
  interface Window {
    createUnityInstance?: (
      canvas: HTMLCanvasElement,
      config: Record<string, unknown>,
      onProgress?: (progress: number) => void,
    ) => Promise<UnityInstance>
  }
}

export type RuntimeManifest = typeof RUNTIME_CONFIG

export type RemoteSaveFile = {
  path: string
  sha256: string
  size: number
  url: string | null
}

export type RuntimeSyncPayload = {
  bundleHash: string
  files: Array<{
    path: string
    sha256: string
    size: number
    bytes: Uint8Array
  }>
}

export type UnityInstance = {
  SetFullscreen?: (enabled: 0 | 1) => void
  Quit?: () => Promise<void>
  [key: string]: unknown
}

// Unity mounts IDBFS at /idbfs. All save files live directly at /idbfs/<name>.
// The IDB database is named after the mount path: "/idbfs" (confirmed from DevTools).
// Version 21 must match exactly — opening at a lower version triggers onupgradeneeded
// which would wipe the store before Unity reads it.
export const IDBFS_MOUNT = '/idbfs'
const IDBFS_DB_VERSION = 21

// A real shared.dat extracted from a clean vanilla HK install (88 bytes).
// Contains only a session GUID — no user-specific settings or save data.
// Written directly into the IDB store so Unity's syncfs(true) picks it up
// on every first boot — no IDB async round-trip needed at runtime.
const DEFAULT_SHARED_DAT_B64 =
  'AAEAAAD/////AQAAAAAAAAAGAQAAAEBSUFlaWkMxSnhRQmZwVTM1QUZIdUxWMTBEZC9WRHRzcnRuSjArRWNuR2JsZUVlcFd1eHlXSTRBMytPN3BMa1doCw=='

function b64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// Pre-decoded once at module load — zero cost at boot time.
const DEFAULT_SHARED_DAT: Uint8Array = b64ToUint8Array(DEFAULT_SHARED_DAT_B64)

export function runPreflight(): RuntimePreflightResult {
  const warnings: string[] = []
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isSupportedBrowser =
    /Chrome|Edg|Firefox|Safari/i.test(navigator.userAgent) && !isMobile

  if (!isSupportedBrowser) {
    warnings.push('This experience is optimized for desktop Chrome, Edge, and Firefox.')
  }
  if (!('indexedDB' in window)) {
    warnings.push('IndexedDB is unavailable, so browser saves cannot persist.')
  }

  return {
    browserSupported: isSupportedBrowser,
    indexedDbAvailable: 'indexedDB' in window,
    persistentRoot: IDBFS_MOUNT,
    warnings,
  }
}

export function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Open directly at IDBFS_DB_VERSION (21).
    // If the DB doesn't exist yet, onupgradeneeded creates the schema at v21.
    // If it already exists at v21 (Unity or a previous call created it), no upgrade runs.
    // We never open at a version lower than 21 to avoid triggering Unity's own upgrade.
    const request = indexedDB.open(IDBFS_MOUNT, IDBFS_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('FILE_DATA')) {
        const store = db.createObjectStore('FILE_DATA')
        store.createIndex('timestamp', 'timestamp')
      }
    }
    request.onblocked = () => console.warn('[hk] openIdb: blocked by another tab')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Scan IDB for keys matching /idbfs/<32-hex-chars> — these are Unity's
// Application.persistentDataPath directories created by previous sessions.
// Returns an array of hash strings, e.g. ["64201a46b8a978c5d2a6300529e9df05"].
async function readPersistentDataHashes(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve) => {
    const tx = db.transaction('FILE_DATA', 'readonly')
    const hashRe = /^\/idbfs\/([0-9a-f]{32})$/
    tx.objectStore('FILE_DATA').getAllKeys().onsuccess = (e: Event) => {
      const keys = (e.target as IDBRequest<IDBValidKey[]>).result as string[]
      const hashes = keys
        .map((k) => hashRe.exec(k)?.[1])
        .filter((h): h is string => !!h)
      resolve(hashes)
    }
    tx.onerror = () => resolve([])
  })
}

// Write cloud save bytes into the Emscripten IDBFS database BEFORE Unity boots.
// Unity's internal _JS_FileSystem_Initialize calls syncfs(true) which populates
// the virtual FS from IDB — so our files must already be there.
// Always injects DEFAULT_SHARED_DAT for shared.dat if not present in cloud saves.
// Writes saves to BOTH /idbfs/<name> AND /idbfs/<hash>/<name> for any known hashes
// (Unity reads from the hash path — the root path is a fallback for first boots).
async function writeCloudSavesToIdb(
  files: Array<{ path: string; bytes: Uint8Array }>,
): Promise<void> {
  const hasShared = files.some((f) => f.path === 'shared.dat')
  const allFiles = hasShared ? files : [...files, { path: 'shared.dat', bytes: DEFAULT_SHARED_DAT }]

  let db: IDBDatabase
  try {
    db = await openIdb()
  } catch (err) {
    console.error('[hk] writeCloudSavesToIdb: openIdb failed', err)
    throw err
  }

  // Discover any existing hash directories from previous Unity sessions.
  const hashes = await readPersistentDataHashes(db)

  return new Promise((resolve, reject) => {
    const tx = db.transaction('FILE_DATA', 'readwrite')
    const store = tx.objectStore('FILE_DATA')
    // Do NOT write a directory entry for IDBFS_MOUNT ('/idbfs') — Unity's preRun hook
    // calls FS.mkdir("/idbfs") then FS.mount(IDBFS, {}, "/idbfs") before syncfs(true).
    // If we write the directory key, storeLocalEntry tries FS.mkdirTree("/idbfs") which
    // throws EEXIST (already exists + mounted), potentially aborting the reconcile loop.
    for (const file of allFiles) {
      // Root path — kept for compatibility / first-boot case.
      store.put(
        { timestamp: new Date(), mode: 33206, contents: file.bytes },
        `${IDBFS_MOUNT}/${file.path}`,
      )
      // Hash paths — Unity's actual Application.persistentDataPath.
      // mode 16877 = 0o40755 = directory; mode 33206 = 0o100666 = regular file.
      for (const hash of hashes) {
        const hashDir = `${IDBFS_MOUNT}/${hash}`
        // Ensure directory entry exists (Unity may have deleted it across sessions).
        store.put({ timestamp: new Date(), mode: 16877 }, hashDir)
        store.put(
          { timestamp: new Date(), mode: 33206, contents: file.bytes },
          `${hashDir}/${file.path}`,
        )
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error ?? new Error('IDB transaction aborted'))
    }
  })
}

// Read save files directly from IDB.
// Unity's internal FS object is a closure variable inside hktruffled.framework.js
// and is never exposed on any public object — IDB is the only reliable way to
// read back what Unity has written.
// Checks hash paths (Application.persistentDataPath) FIRST — these are what Unity
// actually writes to. Falls back to root /idbfs/<name> if no hash copy exists.
export async function extractRuntimeSyncPayload(
  candidateFiles: string[],
): Promise<RuntimeSyncPayload> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('FILE_DATA', 'readonly')
    const store = tx.objectStore('FILE_DATA')
    const hashRe = /^\/idbfs\/([0-9a-f]{32})$/

    // First, gather all hash directories so we know where to look.
    const hashesReq = store.getAllKeys()
    hashesReq.onsuccess = () => {
      const allKeys = hashesReq.result as string[]
      const hashes = allKeys
        .map((k) => hashRe.exec(k)?.[1])
        .filter((h): h is string => !!h)

      // For each candidate file, try hash paths first, then root path.
      const reads = candidateFiles.map(
        (fileName) =>
          new Promise<{ path: string; bytes: Uint8Array } | null>((res) => {
            // Build candidate IDB keys: hash paths first, then root.
            const candidates = [
              ...hashes.map((h) => `${IDBFS_MOUNT}/${h}/${fileName}`),
              `${IDBFS_MOUNT}/${fileName}`,
            ]

            function tryNext(i: number) {
              if (i >= candidates.length) { res(null); return }
              const req = store.get(candidates[i])
              req.onsuccess = () => {
                const record = req.result as { contents?: Uint8Array } | undefined
                if (record?.contents?.byteLength) {
                  res({ path: fileName, bytes: record.contents })
                } else {
                  tryNext(i + 1)
                }
              }
              req.onerror = () => tryNext(i + 1)
            }
            tryNext(0)
          }),
      )

      tx.oncomplete = () => db.close()

      Promise.all(reads)
        .then(async (results) => {
          const found = results.filter((r): r is { path: string; bytes: Uint8Array } => r !== null)
          const extracted = await Promise.all(
            found.map(async (f) => ({
              path: f.path,
              bytes: f.bytes,
              size: f.bytes.byteLength,
              sha256: await sha256Hex(f.bytes),
            })),
          )
          resolve({ bundleHash: await buildBundleHash(extracted), files: extracted })
        })
        .catch(reject)
    }
    hashesReq.onerror = () => reject(hashesReq.error)
  })
}

function appendRuntimeScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-runtime-loader="${url}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.runtimeLoader = url
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load the runtime loader.'))
    document.body.appendChild(script)
  })
}

async function fetchRemoteSaveBytes(files: RemoteSaveFile[]) {
  return Promise.all(
    files
      .filter((f) => f.url !== null)
      .map(async (f) => {
        const res = await fetch(f.url!)
        if (!res.ok) throw new Error(`Failed to download save file ${f.path}`)
        return { ...f, bytes: new Uint8Array(await res.arrayBuffer()) }
      }),
  )
}

// Phase 0–80 %: preload all binary parts into Cache API (or confirm already cached).
// Phase 80–100 %: Unity's own init progress.
// This means createUnityInstance gets instant cache hits — no mid-boot network I/O.
export async function loadUnityRuntime(options: {
  canvas: HTMLCanvasElement
  remoteFiles: RemoteSaveFile[]
  mode: 'cloud' | 'local'
  onProgress: (progress: number) => void
  onStatus: (status: string) => void
}): Promise<{ unity: UnityInstance }> {
  const { canvas, remoteFiles, mode, onProgress, onStatus } = options
  const manifest = RUNTIME_CONFIG

  // ── Phase 1: ensure everything is in Cache API ─────────────────────────────
  const alreadyCached = await isRuntimeCached()
  if (!alreadyCached) {
    // loaderUrl is a <script> tag — exclude from binary preload list.
    const binaryParts = [manifest.frameworkUrl, ...manifest.codeParts, ...manifest.dataParts]
    const total = binaryParts.length
    let loaded = 0
    onStatus(`Downloading runtime… 0/${total} parts`)
    for (const url of binaryParts) {
      await getCachedOrFetch(url)
      loaded++
      onProgress((loaded / total) * 0.8)
      onStatus(`Downloading runtime… ${loaded}/${total} parts`)
    }
  } else {
    // Already cached — jump straight to 80 % instantly.
    onProgress(0.8)
    onStatus('Runtime cached — loading…')
  }

  // ── Phase 2: assemble blobs from cache ────────────────────────────────────
  // All cache hits now — fast memory copies. frameworkUrl becomes a blob so
  // Unity never re-fetches it from the CDN.
  const [frameworkBuffer, codeBuffer, dataBuffer] = await Promise.all([
    (async () => {
      const buf = await getCachedOrFetch(manifest.frameworkUrl)
      return URL.createObjectURL(new Blob([buf], { type: 'application/javascript' }))
    })(),
    (async () => {
      const bufs: ArrayBuffer[] = []
      for (const url of manifest.codeParts) bufs.push(await getCachedOrFetch(url))
      return URL.createObjectURL(new Blob(bufs))
    })(),
    (async () => {
      const bufs: ArrayBuffer[] = []
      for (const url of manifest.dataParts) bufs.push(await getCachedOrFetch(url))
      return URL.createObjectURL(new Blob(bufs))
    })(),
  ])

  // ── Phase 3: fetch cloud saves (URLs fetched AFTER download, never expire) ─
  onStatus('Loading saves…')
  const fetchedRemoteFiles =
    mode === 'cloud' && remoteFiles.length > 0
      ? await fetchRemoteSaveBytes(remoteFiles)
      : []
  // Write saves (+ DEFAULT_SHARED_DAT if missing) into IDB before Unity boots.
  // Unity's syncfs(true) in preRun will populate the virtual FS from these IDB records.
  await writeCloudSavesToIdb(fetchedRemoteFiles)

  // ── Phase 4: inject loader script (tiny, not cached as blob) ─────────────
  await appendRuntimeScript(manifest.loaderUrl)

  if (!window.createUnityInstance) {
    throw new Error(
      `Unity loader did not expose createUnityInstance. The CDN file may be malformed.`,
    )
  }

  // ── Phase 5: boot Unity — all asset fetches are instant cache hits ────────
  onStatus('Booting…')

  // Expose an IDB dump helper on window for DevTools debugging.
  // Usage: window.__hkDumpIdb()
  ;(window as unknown as Record<string, unknown>)['__hkDumpIdb'] = async () => {
    try {
      const db = await openIdb()
      const tx = db.transaction('FILE_DATA', 'readonly')
      const store = tx.objectStore('FILE_DATA')
      store.getAllKeys().onsuccess = (e: Event) => {
        const keys = (e.target as IDBRequest<IDBValidKey[]>).result
        console.log('[hk] IDB keys:', keys)
      }
      store.getAll().onsuccess = (e: Event) => {
        const recs = (e.target as IDBRequest<Array<{ timestamp?: unknown; mode?: number; contents?: Uint8Array }>>).result
        recs.forEach((rec, i) =>
          console.log(`[hk] IDB[${i}] ts=${rec.timestamp} mode=${rec.mode} bytes=${rec.contents?.byteLength ?? '(dir)'}`)
        )
      }
      tx.oncomplete = () => db.close()
    } catch (err) {
      console.error('[hk] __hkDumpIdb failed', err)
    }
  }

  const unity = await window.createUnityInstance(
    canvas,
    {
      dataUrl: dataBuffer,
      frameworkUrl: frameworkBuffer,
      codeUrl: codeBuffer,
      streamingAssetsUrl: manifest.streamingAssetsUrl,
      companyName: manifest.companyName,
      productName: manifest.productName,
      productVersion: manifest.productVersion,
      // Capture ALL Debug.Log output — HK's save system logs what it reads/writes.
      print: (message: string) => {
        console.log('[unity]', message)
      },
      printErr: (message: string) => {
        // Only surface genuine fatal errors; Unity emits many harmless printErr lines.
        const isFatal =
          /error|exception|abort|crash/i.test(message) &&
          !/falling back/i.test(message) &&
          !/syncfs operations in flight/i.test(message)
        if (isFatal) console.error('[unity]', message)
        onStatus(message)
      },
    },
    (value) => {
      onProgress(0.8 + value * 0.2)
    },
  )

  // Expose FS walk helper so we can see Unity's virtual filesystem from the console.
  // Usage: window.__hkLsFs('/idbfs') — shows all files under /idbfs in Unity's FS.
  // This tells us the EXACT path where Unity reads/writes saves.
  ;(window as unknown as Record<string, unknown>)['__hkLsFs'] = (path = '/idbfs') => {
    const Module = (window as unknown as Record<string, { FS?: Record<string, ((...args: unknown[]) => unknown)> }>)['Module']
    const FS = Module?.FS
    if (!FS) { console.error('[hk] Module.FS not available'); return }
    function walk(dir: string) {
      try {
        const entries = FS!['readdir']!(dir) as string[]
        for (const entry of entries) {
          if (entry === '.' || entry === '..') continue
          const full = dir === '/' ? `/${entry}` : `${dir}/${entry}`
          try {
            const stat = FS!['stat']!(full) as { mode: number; size: number }
            const isDir = FS!['isDir']!(stat.mode)
            if (isDir) { console.log('[hk] FS dir: ', full); walk(full) }
            else console.log('[hk] FS file:', full, `(${stat.size} bytes)`)
          } catch { console.log('[hk] FS stat err:', full) }
        }
      } catch { console.log('[hk] FS readdir err:', dir) }
    }
    console.log('[hk] Walking FS from:', path)
    walk(path)
  }

  return { unity }
}

export const LOCAL_SYNC_KEYS = {
  localBundleHash: 'hk-local-bundle-hash',
  lastSyncedBundleHash: 'hk-last-synced-bundle-hash',
}

export function detectConflict(cloudBundleHash?: string | null): boolean {
  const local = localStorage.getItem(LOCAL_SYNC_KEYS.localBundleHash)
  const lastSynced = localStorage.getItem(LOCAL_SYNC_KEYS.lastSyncedBundleHash)
  if (!local || !cloudBundleHash) return false
  return local !== cloudBundleHash && local !== lastSynced
}

export function rememberLocalBundleHash(bundleHash: string) {
  localStorage.setItem(LOCAL_SYNC_KEYS.localBundleHash, bundleHash)
}

export function rememberSyncedBundleHash(bundleHash: string) {
  localStorage.setItem(LOCAL_SYNC_KEYS.lastSyncedBundleHash, bundleHash)
  localStorage.setItem(LOCAL_SYNC_KEYS.localBundleHash, bundleHash)
}

export function createSyncTimer(callback: () => void): number {
  return window.setInterval(callback, SAVE_SYNC_INTERVAL_MS)
}
