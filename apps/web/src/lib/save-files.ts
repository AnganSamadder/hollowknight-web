import JSZip from 'jszip'
import { SAVE_FILE_PATTERNS } from './constants'

export type SaveUploadRecord = {
  path: string
  bytes: ArrayBuffer
  size: number
  sha256: string
}

export type SaveBundleManifest = {
  runtimeId: string
  runtimeVersion: string
  bundleHash: string
  files: Array<{
    path: string
    size: number
    sha256: string
  }>
  updatedAt: number
}

export type RuntimePreflightResult = {
  browserSupported: boolean
  indexedDbAvailable: boolean
  persistentRoot: string
  warnings: string[]
}

export function normalizeSavePath(name: string) {
  return name.split('/').pop()?.split('\\').pop()?.trim() ?? ''
}

export function isSupportedSaveFile(path: string) {
  return SAVE_FILE_PATTERNS.some((pattern) => pattern.test(path))
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const buffer = toArrayBuffer(view)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function toArrayBuffer(view: Uint8Array) {
  const copy = new Uint8Array(view.byteLength)
  copy.set(view)
  return copy.buffer
}

export async function buildBundleHash(
  files: Array<{ path: string; sha256: string; size: number }>,
) {
  const canonical = files
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}:${file.sha256}:${file.size}`)
    .join('|')
  return sha256Hex(new TextEncoder().encode(canonical))
}

export async function parseSaveSelection(
  inputFiles: FileList | File[],
): Promise<SaveUploadRecord[]> {
  const files = Array.from(inputFiles)
  if (files.length === 0) {
    return []
  }

  if (files.length === 1 && files[0]?.name.toLowerCase().endsWith('.zip')) {
    return parseSaveZip(files[0])
  }

  const parsed = await Promise.all(
    files.map(async (file) => {
      const path = normalizeSavePath(file.name)
      if (!isSupportedSaveFile(path)) {
        return null
      }

      const bytes = await file.arrayBuffer()
      return {
        path,
        bytes,
        size: bytes.byteLength,
        sha256: await sha256Hex(bytes),
      } satisfies SaveUploadRecord
    }),
  )

  return parsed.filter((file): file is SaveUploadRecord => file !== null)
}

async function parseSaveZip(file: File) {
  const zip = await JSZip.loadAsync(file)

  // Build a map from normalised bare filename → ZipObject so we can look up
  // entries regardless of whether they sit at the root or inside a subdirectory.
  const entryMap = new Map<string, JSZip.JSZipObject>()
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      const bare = normalizeSavePath(relativePath)
      if (isSupportedSaveFile(bare)) {
        entryMap.set(bare, entry)
      }
    }
  })

  if (entryMap.size === 0) {
    return []
  }

  return Promise.all(
    Array.from(entryMap.entries()).map(async ([path, entry]) => {
      const bytes = await entry.async('arraybuffer')
      return {
        path,
        bytes,
        size: bytes.byteLength,
        sha256: await sha256Hex(bytes),
      } satisfies SaveUploadRecord
    }),
  )
}

export async function createZipFromSaveFiles(
  files: Array<{ path: string; bytes: Uint8Array }>,
) {
  const zip = new JSZip()
  for (const file of files) {
    zip.file(file.path, file.bytes)
  }
  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
