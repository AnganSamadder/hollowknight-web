import { describe, expect, it } from 'vitest'
import {
  getPlayViewportHeight,
  isLikelyBrowserFullscreen,
  shouldHidePlayChrome,
} from '~/lib/play-display'

describe('play display helpers', () => {
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

  it('only hides play chrome for the play route in fullscreen mode', () => {
    expect(shouldHidePlayChrome('/play', true)).toBe(true)
    expect(shouldHidePlayChrome('/play', false)).toBe(false)
    expect(shouldHidePlayChrome('/account', true)).toBe(false)
  })

  it('uses full viewport height when play chrome is hidden', () => {
    expect(getPlayViewportHeight(true)).toBe('100dvh')
    expect(getPlayViewportHeight(false)).toBe('calc(100dvh - var(--header-height, 57px))')
  })
})
