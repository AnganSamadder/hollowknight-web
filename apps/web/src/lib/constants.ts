export const APP_NAME = 'Hallownest Archive'
export const RUNTIME_SLUG = 'hollow-knight'

const CDN = 'https://cdn.jsdelivr.net/gh/aukak/hollow-knight'

export const RUNTIME_CONFIG = {
  slug: 'hollow-knight',
  companyName: 'Team Cherry',
  productName: 'Hollow Knight',
  productVersion: '1.0',
  loaderUrl: `${CDN}/Build/hktruffled.loader.js`,
  frameworkUrl: `${CDN}/Build/hktruffled.framework.js`,
  codeParts: Array.from(
    { length: 2 },
    (_, i) => `${CDN}/Build/hktruffled.wasm.part${i + 1}`,
  ),
  dataParts: Array.from(
    { length: 45 },
    (_, i) => `${CDN}/Build/hktruffled.data.part${i + 1}`,
  ),
  streamingAssetsUrl: `${CDN}/StreamingAssets`,
}

export const SAVE_FILE_PATTERNS = [
  /^shared\.dat$/,
  /^user[1-4]\.dat$/,
  /^user[1-4]\.dat\.bak[1-3]$/,
]
export const CANONICAL_SAVE_FILES = [
  'shared.dat',
  'user1.dat',
  'user1.dat.bak1',
  'user1.dat.bak2',
  'user1.dat.bak3',
  'user2.dat',
  'user2.dat.bak1',
  'user2.dat.bak2',
  'user2.dat.bak3',
  'user3.dat',
  'user3.dat.bak1',
  'user3.dat.bak2',
  'user3.dat.bak3',
  'user4.dat',
  'user4.dat.bak1',
  'user4.dat.bak2',
  'user4.dat.bak3',
]
export const SAVE_SYNC_INTERVAL_MS = 15_000
