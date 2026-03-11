import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../convex/_generated/dataModel'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { CANONICAL_SAVE_FILES, RUNTIME_CONFIG, RUNTIME_SLUG } from '~/lib/constants'
import {
  type RemoteSaveFile,
  detectConflict,
  extractRuntimeSyncPayload,
  loadUnityRuntime,
  rememberLocalBundleHash,
  rememberSyncedBundleHash,
  runPreflight,
  createSyncTimer,
} from '~/lib/runtime'
import { toArrayBuffer } from '~/lib/save-files'
import { formatDateTime } from '~/lib/utils'

export const Route = createFileRoute('/_authed/play')({
  component: PlayPage,
})

function PlayPage() {
  const runtimeBundle = useQuery(api.saves.getLaunchBundle, { runtimeSlug: RUNTIME_SLUG })
  const markPlayed = useMutation(api.saves.markRuntimeSessionStarted)
  const generateUploadUrl = useMutation(api.saves.generateImportUploadUrl)
  const commitRuntimeSync = useMutation(api.saves.commitRuntimeSync)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runtimeRef = useRef<Awaited<ReturnType<typeof loadUnityRuntime>> | null>(null)
  const bootingRef = useRef(false)  // blocks re-entry during async boot
  const timerRef = useRef<number | null>(null)
  const runtimeBundleRef = useRef(runtimeBundle)

  const [status, setStatus] = useState('Loading…')
  const [progress, setProgress] = useState(0)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [resolution, setResolution] = useState<'cloud' | 'local'>('cloud')
  const [controlsVisible, setControlsVisible] = useState(true)
  const [preflight, setPreflight] = useState<ReturnType<typeof runPreflight> | null>(null)
  const [bundleResolved, setBundleResolved] = useState(false)

  const controlButtonClass =
    'inline-flex items-center justify-center rounded-lg border border-border-strong bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg transition-colors hover:bg-surface-hover'

  // Preflight is client-only — keeps SSR and initial client render identical.
  useEffect(() => {
    setPreflight(runPreflight())
  }, [])

  // Keep bundle ref current on every render so syncNow closure sees fresh data.
  runtimeBundleRef.current = runtimeBundle

  // Gate: flip once when Convex delivers its first result.
  useEffect(() => {
    if (runtimeBundle !== undefined && !bundleResolved) {
      setBundleResolved(true)
    }
  }, [runtimeBundle, bundleResolved])

  // Conflict detection whenever the cloud hash changes.
  useEffect(() => {
    if (runtimeBundle?.activeRevision?.bundleHash) {
      setConflict(detectConflict(runtimeBundle.activeRevision.bundleHash))
    }
  }, [runtimeBundle?.activeRevision?.bundleHash])

  // Auto-hide controls overlay after inactivity.
  const activityTimerRef = useRef<number | null>(null)
  useEffect(() => {
    if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current)
    activityTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2600)
    return () => { if (activityTimerRef.current) window.clearTimeout(activityTimerRef.current) }
  }, [controlsVisible])

  // ── Main boot effect ───────────────────────────────────────────────────────
  // runtimeBundle is intentionally NOT in the dep array — it's snapshotted from
  // the ref at boot time. Adding it would restart a ~1 GB download on every
  // Convex subscription re-delivery.
  // conflict/resolution are also NOT in dep array — snapshotted at boot time.
  // bootingRef prevents re-entry while the async boot is in progress.
  useEffect(() => {
    if (!preflight) return
    if (!preflight.browserSupported) return
    if (!canvasRef.current) return
    if (!bundleResolved) return
    if (bootingRef.current) return  // already booting or booted
    if (runtimeRef.current) return  // already booted (StrictMode guard)

    bootingRef.current = true

    const snapshotBundle = runtimeBundleRef.current
    const remoteFiles = (snapshotBundle?.activeRevision?.files ?? []) as RemoteSaveFile[]
    // Snapshot conflict/resolution NOW — don't re-read from state mid-async
    const snapshotConflict = conflict
    const snapshotResolution = resolution
    const mode = snapshotConflict && snapshotResolution === 'local' ? 'local' : 'cloud'

    let cancelled = false
    let flushOnHide: (() => void) | null = null
    let onVisibilityChange: (() => void) | null = null

    void loadUnityRuntime({
      canvas: canvasRef.current,
      remoteFiles,
      mode,
      onProgress: (v) => { if (!cancelled) setProgress(v) },
      onStatus:   (s) => { if (!cancelled) setStatus(s) },
    })
      .then(async (runtime) => {
        if (cancelled) {
          await runtime.unity.Quit?.()
          return
        }

        runtimeRef.current = runtime

        await markPlayed({
          runtimeSlug: RUNTIME_SLUG,
          runtimeVersion: RUNTIME_CONFIG.productVersion,
        })

        setRuntimeReady(true)
        setStatus('Running')

        // ── syncNow: reads saves from IDB (not Unity FS) ─────────────────────
        const syncNow = async () => {
          const currentBundle = runtimeBundleRef.current
          const payload = await extractRuntimeSyncPayload(CANONICAL_SAVE_FILES)

          rememberLocalBundleHash(payload.bundleHash)

          // Nothing changed since last cloud snapshot — skip upload.
          if (
            currentBundle?.activeRevision?.bundleHash &&
            payload.bundleHash === currentBundle.activeRevision.bundleHash
          ) {
            rememberSyncedBundleHash(payload.bundleHash)
            return
          }

          // Unity hasn't written any saves yet.
          if (payload.files.length === 0) return

          const uploadedFiles = []
          for (const file of payload.files) {
            const uploadUrl = await generateUploadUrl()
            const response = await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: new Blob([toArrayBuffer(file.bytes)], { type: 'application/octet-stream' }),
            })
            if (!response.ok) throw new Error(`Upload failed for ${file.path}`)
            const { storageId } = (await response.json()) as { storageId: string }
            uploadedFiles.push({
              path: file.path,
              size: file.size,
              sha256: file.sha256,
              storageId: storageId as Id<'_storage'>,
            })
          }

          const result = await commitRuntimeSync({
            runtimeSlug: RUNTIME_SLUG,
            runtimeVersion: RUNTIME_CONFIG.productVersion,
            baseBundleHash: currentBundle?.activeRevision?.bundleHash,
            bundleHash: payload.bundleHash,
            files: uploadedFiles,
          })

          rememberSyncedBundleHash(payload.bundleHash)
          setStatus(`Synced ${formatDateTime(result.lastSyncedAt)}`)
        }

        timerRef.current = createSyncTimer(() => {
          void syncNow().catch((e) => {
            setStatus(e instanceof Error ? e.message : 'Sync failed.')
          })
        })

        flushOnHide = () => void syncNow().catch(console.error)
        onVisibilityChange = () => {
          if (document.visibilityState === 'hidden') flushOnHide?.()
        }

        window.addEventListener('pagehide', flushOnHide)
        document.addEventListener('visibilitychange', onVisibilityChange)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg || 'Runtime launch failed — check console.')
        }
      })

    return () => {
      cancelled = true
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (flushOnHide) window.removeEventListener('pagehide', flushOnHide)
      if (onVisibilityChange) document.removeEventListener('visibilitychange', onVisibilityChange)
      // Only fully tear down if Unity actually booted. If cleanup fires before
      // loadUnityRuntime resolves (e.g. StrictMode double-invoke in dev), we leave
      // bootingRef=true so the second invocation is blocked — one instance only.
      if (runtimeRef.current) {
        void runtimeRef.current.unity.Quit?.()
        runtimeRef.current = null
        bootingRef.current = false
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleResolved, commitRuntimeSync, generateUploadUrl, markPlayed, preflight])

  return (
    <div className="animate-fade-in">
      <div
        className="relative overflow-hidden bg-canvas"
        style={{ height: 'calc(100dvh - var(--header-height, 57px))' }}
        onMouseMove={() => setControlsVisible(true)}
        onMouseLeave={() => setControlsVisible(false)}
        suppressHydrationWarning
      >
        <canvas
          id="unity-canvas"
          ref={canvasRef}
          className="block h-full w-full bg-black"
          suppressHydrationWarning
        />

        {/* Floating controls — fades after inactivity */}
        <div
          className={`pointer-events-auto absolute right-3 top-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface-alt p-3 transition-opacity duration-200 ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="flex flex-wrap gap-2">
            <button
              className={controlButtonClass}
              onClick={() => runtimeRef.current?.unity.SetFullscreen?.(1)}
            >
              Fullscreen
            </button>
            <Link to="/account/saves" className={controlButtonClass}>
              Saves
            </Link>
          </div>
          <span className="ui-status-pill">
            <span className={`size-2 rounded-full ${runtimeReady ? 'bg-accent animate-status-pulse' : 'bg-border-strong'}`} />
            {status}
          </span>
        </div>

        {/* Unsupported browser */}
        {preflight && !preflight.browserSupported ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="ui-panel w-full max-w-2xl p-6 desktop:p-8">
              <div className="ui-eyebrow">Unsupported Device</div>
              <h1 className="mt-2 text-[clamp(1.8rem,3.5vw,2.4rem)] font-semibold tracking-tight text-fg-bright">
                Desktop browsers only.
              </h1>
              <p className="mt-3 text-sm leading-7 text-fg-muted">
                This wrapper is optimized for desktop Chrome, Edge, and Firefox. Mobile devices are not supported.
              </p>
            </div>
          </div>
        ) : null}

        {/* Hard error */}
        {error ? (
          <div className="absolute inset-0 grid place-items-center p-6">
            <div className="ui-panel w-full max-w-2xl p-6 desktop:p-8">
              <div className="ui-eyebrow">Runtime Error</div>
              <h1 className="mt-2 text-[clamp(1.8rem,3.5vw,2.4rem)] font-semibold tracking-tight text-fg-bright">
                Unable to launch.
              </h1>
              <p className="mt-3 text-sm leading-7 text-fg-muted">{error}</p>
              <div className="mt-6">
                <button
                  className="ui-btn-primary"
                  onClick={() => { setError(null); setProgress(0); setRuntimeReady(false); setStatus('Loading…') }}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Launch progress + conflict resolution */}
        {!error ? (
          <div className="pointer-events-none absolute inset-0">
            <div className="pointer-events-auto absolute bottom-4 left-4 right-4 rounded-xl bg-surface p-4 desktop:right-auto desktop:w-[30rem]">
              {!runtimeReady ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="ui-eyebrow">Loading</div>
                      <div className="mt-1 text-sm text-fg">{status}</div>
                    </div>
                    <div className="text-right text-sm tabular-nums text-fg-muted">
                      {Math.round(progress * 100)}%
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                    <span
                      className="block h-full rounded-full bg-accent transition-all duration-150"
                      style={{ width: `${Math.max(progress * 100, 2)}%` }}
                    />
                  </div>

                  {conflict ? (
                    <div className="mt-4 rounded-xl border border-border-strong bg-surface-alt p-4">
                      <div className="ui-eyebrow">Save conflict</div>
                      <p className="mt-2 text-sm leading-7 text-fg-muted">
                        Local progress differs from cloud. Choose which version to keep.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <button
                          className={`ui-btn-secondary ${resolution === 'local' ? 'ring-2 ring-fg/30' : ''}`}
                          onClick={() => setResolution('local')}
                        >
                          Use local
                        </button>
                        <button
                          className={`ui-btn-primary ${resolution === 'cloud' ? 'ring-2 ring-fg/30' : ''}`}
                          onClick={() => setResolution('cloud')}
                        >
                          Use cloud
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="ui-eyebrow">Cloud bundle</div>
                    <div className="mt-1 text-sm text-fg">
                      {runtimeBundle?.activeRevision?.bundleHash.slice(0, 16) ?? 'No cloud saves yet'}
                    </div>
                  </div>
                  {runtimeBundle?.lastSyncedAt ? (
                    <div className="text-right text-xs text-fg-dim">
                      <div>Last synced</div>
                      <div>{formatDateTime(runtimeBundle.lastSyncedAt)}</div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
