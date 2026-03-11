/**
 * tests/save-files.test.ts
 *
 * Unit tests for every exported helper in src/lib/save-files.ts and src/lib/utils.ts.
 * No browser APIs needed beyond what jsdom + fake-indexeddb provide.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeSavePath,
  isSupportedSaveFile,
  sha256Hex,
  toArrayBuffer,
  buildBundleHash,
  createZipFromSaveFiles,
  parseSaveSelection,
} from '~/lib/save-files'
import { formatBytes, formatDateTime, cn } from '~/lib/utils'
import { CANONICAL_SAVE_FILES, SAVE_FILE_PATTERNS } from '~/lib/constants'

// ---------------------------------------------------------------------------
// normalizeSavePath
// ---------------------------------------------------------------------------
describe('normalizeSavePath', () => {
  it('strips unix directory prefix', () => {
    expect(normalizeSavePath('/idbfs/user1.dat')).toBe('user1.dat')
  })
  it('strips windows directory prefix', () => {
    expect(normalizeSavePath('C:\\Users\\foo\\user2.dat')).toBe('user2.dat')
  })
  it('returns bare filename unchanged', () => {
    expect(normalizeSavePath('shared.dat')).toBe('shared.dat')
  })
  it('trims whitespace', () => {
    expect(normalizeSavePath('  user3.dat  ')).toBe('user3.dat')
  })
  it('handles empty string', () => {
    expect(normalizeSavePath('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// isSupportedSaveFile
// ---------------------------------------------------------------------------
describe('isSupportedSaveFile', () => {
  const valid = [
    'shared.dat',
    'user1.dat', 'user2.dat', 'user3.dat', 'user4.dat',
    'user1.dat.bak1', 'user1.dat.bak2', 'user1.dat.bak3',
    'user4.dat.bak3',
  ]
  const invalid = [
    'user0.dat', 'user5.dat', 'user1.dat.bak0', 'user1.dat.bak4',
    'User1.dat', 'user1.DAT', 'shared.dat.bak1', 'foo.dat', '', 'user1',
  ]

  valid.forEach((f) => {
    it(`accepts "${f}"`, () => expect(isSupportedSaveFile(f)).toBe(true))
  })
  invalid.forEach((f) => {
    it(`rejects "${f}"`, () => expect(isSupportedSaveFile(f)).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// CANONICAL_SAVE_FILES completeness
// ---------------------------------------------------------------------------
describe('CANONICAL_SAVE_FILES', () => {
  it('contains 17 entries', () => {
    expect(CANONICAL_SAVE_FILES).toHaveLength(17)
  })
  it('every entry passes isSupportedSaveFile', () => {
    for (const f of CANONICAL_SAVE_FILES) {
      expect(isSupportedSaveFile(f), `${f} should be supported`).toBe(true)
    }
  })
  it('contains shared.dat and user1-4.dat', () => {
    expect(CANONICAL_SAVE_FILES).toContain('shared.dat')
    for (let i = 1; i <= 4; i++) expect(CANONICAL_SAVE_FILES).toContain(`user${i}.dat`)
  })
})

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------
describe('sha256Hex', () => {
  it('returns a 64-char lowercase hex string', async () => {
    const hash = await sha256Hex(new Uint8Array([1, 2, 3]))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('empty buffer has known hash', async () => {
    const hash = await sha256Hex(new Uint8Array(0))
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('is deterministic', async () => {
    const buf = new Uint8Array([10, 20, 30, 40])
    const a = await sha256Hex(buf)
    const b = await sha256Hex(buf)
    expect(a).toBe(b)
  })

  it('accepts ArrayBuffer input', async () => {
    const buf = new Uint8Array([0xff, 0x00]).buffer
    const hash = await sha256Hex(buf as ArrayBuffer)
    expect(hash).toHaveLength(64)
  })
})

// ---------------------------------------------------------------------------
// toArrayBuffer
// ---------------------------------------------------------------------------
describe('toArrayBuffer', () => {
  it('returns an ArrayBuffer with matching bytes', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5])
    const out = toArrayBuffer(input)
    expect(out).toBeInstanceOf(ArrayBuffer)
    const view = new Uint8Array(out)
    expect(Array.from(view)).toEqual([1, 2, 3, 4, 5])
  })

  it('is a copy — mutating output does not affect input', () => {
    const input = new Uint8Array([10, 20])
    const out = toArrayBuffer(input)
    new Uint8Array(out)[0] = 99
    expect(input[0]).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// buildBundleHash
// ---------------------------------------------------------------------------
describe('buildBundleHash', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await buildBundleHash([
      { path: 'user1.dat', sha256: 'a'.repeat(64), size: 100 },
    ])
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is order-independent (sorts by path internally)', async () => {
    const files = [
      { path: 'user2.dat', sha256: 'b'.repeat(64), size: 200 },
      { path: 'user1.dat', sha256: 'a'.repeat(64), size: 100 },
    ]
    const h1 = await buildBundleHash(files)
    const h2 = await buildBundleHash([...files].reverse())
    expect(h1).toBe(h2)
  })

  it('changes when file content changes', async () => {
    const base = [{ path: 'user1.dat', sha256: 'a'.repeat(64), size: 100 }]
    const modified = [{ path: 'user1.dat', sha256: 'b'.repeat(64), size: 100 }]
    expect(await buildBundleHash(base)).not.toBe(await buildBundleHash(modified))
  })

  it('changes when file size changes', async () => {
    const h1 = await buildBundleHash([{ path: 'user1.dat', sha256: 'a'.repeat(64), size: 100 }])
    const h2 = await buildBundleHash([{ path: 'user1.dat', sha256: 'a'.repeat(64), size: 101 }])
    expect(h1).not.toBe(h2)
  })

  it('changes when a new file is added', async () => {
    const one = [{ path: 'user1.dat', sha256: 'a'.repeat(64), size: 100 }]
    const two = [
      ...one,
      { path: 'user2.dat', sha256: 'b'.repeat(64), size: 200 },
    ]
    expect(await buildBundleHash(one)).not.toBe(await buildBundleHash(two))
  })

  it('empty list produces a valid hash', async () => {
    const hash = await buildBundleHash([])
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ---------------------------------------------------------------------------
// createZipFromSaveFiles
// ---------------------------------------------------------------------------
describe('createZipFromSaveFiles', () => {
  it('produces a non-empty Blob', async () => {
    const blob = await createZipFromSaveFiles([
      { path: 'user1.dat', bytes: new Uint8Array([1, 2, 3]) },
    ])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('zip contains the expected files', async () => {
    const { default: JSZip } = await import('jszip')
    const files = [
      { path: 'user1.dat', bytes: new Uint8Array([0x41, 0x42]) },
      { path: 'shared.dat', bytes: new Uint8Array([0x43]) },
    ]
    const blob = await createZipFromSaveFiles(files)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(zip.files['user1.dat']).toBeDefined()
    expect(zip.files['shared.dat']).toBeDefined()
    const content = await zip.files['user1.dat'].async('uint8array')
    expect(Array.from(content)).toEqual([0x41, 0x42])
  })
})

// ---------------------------------------------------------------------------
// parseSaveSelection — non-zip files
// ---------------------------------------------------------------------------
describe('parseSaveSelection (plain files)', () => {
  function mockFile(name: string, bytes: Uint8Array): File {
    return new File([bytes.buffer as ArrayBuffer], name)
  }

  it('returns a record for a valid save file', async () => {
    const file = mockFile('user1.dat', new Uint8Array([1, 2, 3]))
    const result = await parseSaveSelection([file])
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('user1.dat')
    expect(result[0].size).toBe(3)
    expect(result[0].sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('skips unsupported files', async () => {
    const file = mockFile('readme.txt', new Uint8Array([1]))
    const result = await parseSaveSelection([file])
    expect(result).toHaveLength(0)
  })

  it('handles multiple valid files', async () => {
    const files = [
      mockFile('user1.dat', new Uint8Array([1])),
      mockFile('user2.dat', new Uint8Array([2, 3])),
      mockFile('shared.dat', new Uint8Array([4, 5, 6])),
    ]
    const result = await parseSaveSelection(files)
    expect(result).toHaveLength(3)
    const paths = result.map((r) => r.path)
    expect(paths).toContain('user1.dat')
    expect(paths).toContain('user2.dat')
    expect(paths).toContain('shared.dat')
  })
})

// ---------------------------------------------------------------------------
// parseSaveSelection — zip file
// ---------------------------------------------------------------------------
describe('parseSaveSelection (zip)', () => {
  async function makeZipFile(entries: { name: string; bytes: Uint8Array }[]): Promise<File> {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    for (const e of entries) zip.file(e.name, e.bytes)
    const blob = await zip.generateAsync({ type: 'blob' })
    return new File([blob], 'saves.zip', { type: 'application/zip' })  }

  it('extracts valid save files from a zip', async () => {
    const zipFile = await makeZipFile([
      { name: 'user1.dat', bytes: new Uint8Array([10, 20]) },
      { name: 'shared.dat', bytes: new Uint8Array([30]) },
    ])
    const result = await parseSaveSelection([zipFile])
    expect(result.length).toBeGreaterThanOrEqual(2)
    const paths = result.map((r) => r.path)
    expect(paths).toContain('user1.dat')
    expect(paths).toContain('shared.dat')
  })

  it('skips junk files inside zip', async () => {
    const zipFile = await makeZipFile([
      { name: 'user1.dat', bytes: new Uint8Array([1]) },
      { name: '__MACOSX/._user1.dat', bytes: new Uint8Array([2]) },
      { name: 'thumbs.db', bytes: new Uint8Array([3]) },
    ])
    const result = await parseSaveSelection([zipFile])
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('user1.dat')
  })
})

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------
describe('formatBytes', () => {
  it('formats 0 bytes', () => expect(formatBytes(0)).toBe('0 B'))
  it('formats negative as 0 B', () => expect(formatBytes(-1)).toBe('0 B'))
  it('formats bytes', () => expect(formatBytes(512)).toBe('512 B'))
  it('formats KB', () => expect(formatBytes(1024)).toBe('1.0 KB'))
  it('formats KB with decimal', () => expect(formatBytes(1536)).toBe('1.5 KB'))
  it('formats MB', () => expect(formatBytes(1024 * 1024)).toBe('1.0 MB'))
  it('formats GB', () => expect(formatBytes(1024 ** 3)).toBe('1.0 GB'))
  it('formats large value', () => {
    const result = formatBytes(1024 * 1024 * 50)
    expect(result).toBe('50 MB')
  })
})

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
  it('returns "Not yet" for undefined', () => expect(formatDateTime(undefined)).toBe('Not yet'))
  it('returns "Not yet" for null', () => expect(formatDateTime(null as any)).toBe('Not yet'))
  it('returns "Not yet" for 0', () => expect(formatDateTime(0)).toBe('Not yet'))
  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatDateTime(Date.now())
    expect(result).toBeTruthy()
    expect(result).not.toBe('Not yet')
  })
  it('includes year for a known date', () => {
    const result = formatDateTime(new Date('2024-06-15T12:00:00Z').getTime())
    expect(result).toContain('2024')
  })
})

// ---------------------------------------------------------------------------
// cn (class name merger)
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })
  it('deduplicates tailwind classes', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8')
  })
  it('handles falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar')
  })
  it('handles conditional classes', () => {
    const active = true
    expect(cn('base', active && 'active')).toBe('base active')
  })
})
