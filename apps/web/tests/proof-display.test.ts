import { describe, expect, it } from 'vitest'
import {
  getProofViewportHeight,
  isLikelyBrowserFullscreen,
  shouldHideProofChrome,
} from '~/lib/proof-display'

describe('proof display helpers', () => {
  it('treats a screen-sized viewport as browser fullscreen', () => {
    expect(
      isLikelyBrowserFullscreen({
        innerWidth: 1920,
        innerHeight: 1080,
        screenWidth: 1920,
        screenHeight: 1080,
      }),
    ).toBe(true)
  })

  it('does not treat a shorter viewport as browser fullscreen', () => {
    expect(
      isLikelyBrowserFullscreen({
        innerWidth: 1920,
        innerHeight: 1020,
        screenWidth: 1920,
        screenHeight: 1080,
      }),
    ).toBe(false)
  })

  it('only hides proof chrome for the proof route in fullscreen mode', () => {
    expect(shouldHideProofChrome('/proof', true)).toBe(true)
    expect(shouldHideProofChrome('/proof', false)).toBe(false)
    expect(shouldHideProofChrome('/account', true)).toBe(false)
  })

  it('uses full viewport height when proof chrome is hidden', () => {
    expect(getProofViewportHeight(true)).toBe('100dvh')
    expect(getProofViewportHeight(false)).toBe('calc(100dvh - var(--header-height, 57px))')
  })
})
