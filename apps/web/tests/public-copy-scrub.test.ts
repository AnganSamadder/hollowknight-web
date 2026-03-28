import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const files = [
  'src/routes/index.tsx',
  'src/routes/__root.tsx',
  'src/routes/_authed.account.index.tsx',
  'src/routes/_authed.account.archive.tsx',
  'src/routes/_authed.proof.tsx',
  'src/components/ProofFullscreenHint.tsx',
]

describe('public copy scrub', () => {
  it('uses proof and archive routes instead of game-facing paths', () => {
    const rootSource = readFileSync(resolve(process.cwd(), 'src/routes/__root.tsx'), 'utf8')
    const homeSource = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf8')
    const accountSource = readFileSync(
      resolve(process.cwd(), 'src/routes/_authed.account.index.tsx'),
      'utf8',
    )

    expect(rootSource).toContain('to="/proof"')
    expect(rootSource).toContain('to="/account/archive"')
    expect(homeSource).toContain('to="/proof"')
    expect(homeSource).toContain('to="/account/archive"')
    expect(accountSource).toContain('to="/proof"')
    expect(accountSource).toContain('to="/account/archive"')
  })

  it('removes flagged gaming phrases from the public shell source', () => {
    const combined = files
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n')

    expect(combined).not.toContain('Hollow Knight')
    expect(combined).not.toContain('stays in-game')
    expect(combined).not.toContain('Sign In to Play')
    expect(combined).not.toContain('Launch game')
    expect(combined).not.toContain('Preparing game')
    expect(combined).not.toContain('Play Hollow Knight')
  })

  it('uses neutral archive download names in the archive screen source', () => {
    const archiveSource = readFileSync(
      resolve(process.cwd(), 'src/routes/_authed.account.archive.tsx'),
      'utf8',
    )

    expect(archiveSource).toContain("'archive-bundle.zip'")
    expect(archiveSource).toContain('`bundle-slot${slot}.zip`')
    expect(archiveSource).not.toContain('hollow-knight-saves.zip')
    expect(archiveSource).not.toContain('hollow-knight-slot')
  })
})
