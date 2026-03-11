import { useMutation, useQuery } from 'convex/react'
import type { Id } from '../../convex/_generated/dataModel'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { api } from '../../convex/_generated/api'
import { RUNTIME_SLUG } from '~/lib/constants'
import {
  buildBundleHash,
  createZipFromSaveFiles,
  downloadBlob,
  parseSaveSelection,
} from '~/lib/save-files'
import { formatBytes, formatDateTime } from '~/lib/utils'

export const Route = createFileRoute('/_authed/account/saves')({
  component: SaveManagementPage,
})

const SLOT_FILES: Record<number, string[]> = {
  1: ['user1.dat', 'user1.dat.bak1', 'user1.dat.bak2', 'user1.dat.bak3'],
  2: ['user2.dat', 'user2.dat.bak1', 'user2.dat.bak2', 'user2.dat.bak3'],
  3: ['user3.dat', 'user3.dat.bak1', 'user3.dat.bak2', 'user3.dat.bak3'],
  4: ['user4.dat', 'user4.dat.bak1', 'user4.dat.bak2', 'user4.dat.bak3'],
}

const HK_SAVE_PATH = String.raw`%AppData%\..\LocalLow\Team Cherry\Hollow Knight`

type BundleFile = { path: string; size: number; sha256: string; url: string | null }

function slotFiles(files: BundleFile[], slot: number): BundleFile[] {
  const names = new Set(SLOT_FILES[slot])
  return files.filter((f) => names.has(f.path))
}

function slotHasData(files: BundleFile[], slot: number): boolean {
  return files.some((f) => f.path === `user${slot}.dat`)
}

// ─── SaveSlotCard ─────────────────────────────────────────────────────────────

type SlotCardProps = {
  slot: number
  allFiles: BundleFile[]
  busy: boolean
  onImport: (slot: number, files: FileList) => void
  onExport: (slot: number) => void
}

function SaveSlotCard({ slot, allFiles, busy, onImport, onExport }: SlotCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const files = slotFiles(allFiles, slot)
  const hasData = slotHasData(allFiles, slot)
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0)

  return (
    <div className="ui-card flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="ui-eyebrow">Slot {slot}</div>
          {hasData ? (
            <div className="mt-1 text-sm text-fg">
              {formatBytes(totalBytes)}
              <span className="ml-2 text-fg-dim">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-sm text-fg-dim">No save data</div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            className="ui-btn-secondary text-xs"
            disabled={busy || !hasData}
            onClick={() => onExport(slot)}
          >
            Export
          </button>
          <button
            className="ui-btn-primary text-xs"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept=".dat,.zip"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.length) {
                onImport(slot, e.target.files)
                e.target.value = ''
              }
            }}
          />
        </div>
      </div>

      {hasData && (
        <div className="grid gap-2 border-t border-border pt-4">
          {files.map((f) => (
            <div key={f.path} className="flex items-center justify-between gap-3 text-xs text-fg-dim">
              <span className="font-mono">{f.path}</span>
              <span>{formatBytes(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SaveManagementPage ───────────────────────────────────────────────────────

function SaveManagementPage() {
  const activeBundle = useQuery(api.saves.getActiveBundle, { runtimeSlug: RUNTIME_SLUG })
  const revisions = useQuery(api.saves.listRevisions, { runtimeSlug: RUNTIME_SLUG }) ?? []
  const generateUploadUrl = useMutation(api.saves.generateImportUploadUrl)
  const commitImportedFiles = useMutation(api.saves.commitImportedFiles)
  const promoteRevision = useMutation(api.saves.promoteRevision)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const importAllRef = useRef<HTMLInputElement>(null)

  const activeFiles: BundleFile[] = (activeBundle?.activeRevision?.files ?? []) as BundleFile[]
  const hasAnyFiles = activeFiles.length > 0

  async function uploadAndCommit(parsedFiles: Array<{ path: string; bytes: ArrayBuffer; size: number; sha256: string }>) {
    if (parsedFiles.length === 0) throw new Error('No supported save files found.')

    const uploadedFiles = []
    for (const file of parsedFiles) {
      setStatus(`Uploading ${file.path}…`)
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([file.bytes], { type: 'application/octet-stream' }),
      })
      if (!response.ok) throw new Error(`Upload failed for ${file.path}`)
      const { storageId } = (await response.json()) as { storageId: string }
      uploadedFiles.push({ path: file.path, size: file.size, sha256: file.sha256, storageId: storageId as Id<'_storage'> })
    }

    const existingPaths = new Set(uploadedFiles.map((f) => f.path))
    const retained = activeFiles
      .filter((f) => !existingPaths.has(f.path) && f.url !== null)
      .map((f) => ({ path: f.path, size: f.size, sha256: f.sha256, url: f.url! }))

    const retainedUploaded = []
    for (const file of retained) {
      setStatus(`Re-uploading ${file.path}…`)
      const bytes = await fetch(file.url).then((r) => r.arrayBuffer())
      const uploadUrl = await generateUploadUrl()
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Blob([bytes], { type: 'application/octet-stream' }),
      })
      if (!response.ok) throw new Error(`Re-upload failed for ${file.path}`)
      const { storageId } = (await response.json()) as { storageId: string }
      retainedUploaded.push({ path: file.path, size: file.size, sha256: file.sha256, storageId: storageId as Id<'_storage'> })
    }

    const allFiles = [...uploadedFiles, ...retainedUploaded]
    const bundleHash = await buildBundleHash(allFiles)
    await commitImportedFiles({
      runtimeSlug: RUNTIME_SLUG,
      runtimeVersion: activeBundle?.runtimeVersion ?? 'manual-import',
      bundleHash,
      files: allFiles,
    })
  }

  async function handleImportAll(fileList: FileList) {
    setBusy(true)
    setStatus('Reading files…')
    try {
      const parsed = await parseSaveSelection(fileList)
      if (parsed.length === 0) throw new Error('No supported save files found.')
      await uploadAndCommit(parsed)
      setStatus(`Imported ${parsed.length} file${parsed.length !== 1 ? 's' : ''}.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSlotImport(slot: number, fileList: FileList) {
    setBusy(true)
    setStatus(`Reading slot ${slot} files…`)
    try {
      const parsed = await parseSaveSelection(fileList)
      const slotNames = new Set([...SLOT_FILES[slot], 'shared.dat'])
      const relevant = parsed.filter((f) => slotNames.has(f.path))
      if (relevant.length === 0) {
        throw new Error(`No slot ${slot} save files found. Expected user${slot}.dat or a zip containing it.`)
      }
      await uploadAndCommit(relevant)
      setStatus(`Slot ${slot} imported.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleExportAll() {
    if (activeFiles.length === 0) { setStatus('No active save bundle to export.'); return }
    setBusy(true)
    setStatus('Building export archive…')
    try {
      const bytes = await Promise.all(
        activeFiles.filter((f) => f.url !== null).map(async (f) => {
          const response = await fetch(f.url!)
          if (!response.ok) throw new Error(`Could not fetch ${f.path}`)
          return { path: f.path, bytes: new Uint8Array(await response.arrayBuffer()) }
        }),
      )
      downloadBlob(await createZipFromSaveFiles(bytes), 'hollow-knight-saves.zip')
      setStatus('Export ready.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSlotExport(slot: number) {
    const files = slotFiles(activeFiles, slot).filter((f) => f.url !== null)
    if (files.length === 0) { setStatus(`Slot ${slot} has no data to export.`); return }
    setBusy(true)
    setStatus(`Exporting slot ${slot}…`)
    try {
      const bytes = await Promise.all(
        files.map(async (f) => {
          const response = await fetch(f.url!)
          if (!response.ok) throw new Error(`Could not fetch ${f.path}`)
          return { path: f.path, bytes: new Uint8Array(await response.arrayBuffer()) }
        }),
      )
      downloadBlob(await createZipFromSaveFiles(bytes), `hollow-knight-slot${slot}.zip`)
      setStatus(`Slot ${slot} exported.`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-10 animate-fade-in">

      {/* ── Header ── */}
      <section className="grid gap-5 desktop:grid-cols-[minmax(0,1fr)_auto] desktop:items-end">
        <div>
          <div className="ui-eyebrow">Save Files</div>
          <h1 className="mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold tracking-tight text-fg-bright">
            Save Management
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="ui-btn-secondary"
            disabled={busy || activeFiles.length === 0}
            onClick={handleExportAll}
          >
            Export all slots
          </button>
          {status && (
            <span className="ui-status-pill">
              <span className="size-2 rounded-full bg-border-strong" />
              {status}
            </span>
          )}
        </div>
      </section>

      {/* ── Import all — always shown first ── */}
      <section className="ui-panel p-5 desktop:p-7">
        <div className="ui-eyebrow">Import Save Files</div>
        <p className="mt-3 text-sm leading-7 text-fg-dim">
          Navigate to your Hollow Knight save folder and select{' '}
          <strong className="text-fg">all files</strong> at once —{' '}
          <span className="font-mono text-xs">user*.dat</span> files.
        </p>

        {/* Path copyable block */}
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-alt px-4 py-3">
          <span className="flex-1 font-mono text-xs text-fg">{HK_SAVE_PATH}</span>
          <button
            className="shrink-0 rounded-lg border border-border px-3 py-1 text-xs text-fg-dim transition hover:border-border-strong hover:text-fg"
            onClick={() => void navigator.clipboard.writeText(HK_SAVE_PATH).then(() => setStatus('Path copied.'))}
          >
            Copy
          </button>
        </div>

        <button
          className="ui-btn-primary mt-5"
          disabled={busy}
          onClick={() => importAllRef.current?.click()}
        >
          Select save files…
        </button>
        <input
          ref={importAllRef}
          type="file"
          className="hidden"
          multiple
          accept=".dat,.zip"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.length) { handleImportAll(e.target.files); e.target.value = '' }
          }}
        />
      </section>

      {/* ── Per-slot cards ── */}
      <section className="grid gap-4 sm:grid-cols-2">
        {([1, 2, 3, 4] as const).map((slot) => (
          <SaveSlotCard
            key={slot}
            slot={slot}
            allFiles={activeFiles}
            busy={busy}
            onImport={handleSlotImport}
            onExport={handleSlotExport}
          />
        ))}
      </section>

      {/* ── Revision history ── */}
      <section className="ui-panel p-5">
        <div className="ui-eyebrow">Revision History</div>
          {revisions.length === 0 ? (
            <p className="mt-3 text-sm text-fg-dim">
              No revisions yet. Import saves or play a session to create one.
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {revisions.map((revision) => (
                <div
                  key={revision._id}
                  className="ui-card flex flex-wrap items-center justify-between gap-4 p-4"
                >
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <div className="text-xs uppercase tracking-[0.15em] text-fg-dim">
                        {revision.source === 'runtime_sync' ? 'Runtime sync'
                          : revision.source === 'import' ? 'Import'
                          : 'Manual'}
                      </div>
                      <div className="font-mono text-sm text-fg">
                        {revision.bundleHash.slice(0, 12)}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-fg-dim">
                      <span>{revision.fileCount} files</span>
                      <span>{formatBytes(revision.byteSize)}</span>
                      <span>{formatDateTime(revision.createdAt)}</span>
                    </div>
                  </div>
                  {revision.isActive ? (
                    <span className="ui-status-pill">
                      <span className="size-2 rounded-full bg-accent animate-status-pulse" />
                      Active
                    </span>
                  ) : (
                    <button
                      className="ui-btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true)
                        void promoteRevision({ revisionId: revision._id })
                          .then(() => setStatus('Revision restored.'))
                          .catch((e: unknown) => setStatus(e instanceof Error ? e.message : 'Restore failed.'))
                          .finally(() => setBusy(false))
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
      </section>
    </div>
  )
}
