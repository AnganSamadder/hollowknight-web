const FULLSCREEN_TOLERANCE_PX = 16

export function isLikelyBrowserFullscreen(options: {
  innerWidth: number
  innerHeight: number
  screenWidth: number
  screenHeight: number
  screenAvailWidth?: number
  screenAvailHeight?: number
}) {
  const widthCandidates = [options.screenWidth, options.screenAvailWidth].filter(
    (value): value is number => typeof value === 'number' && value > 0,
  )
  const heightCandidates = [options.screenHeight, options.screenAvailHeight].filter(
    (value): value is number => typeof value === 'number' && value > 0,
  )

  const widthMatches = widthCandidates.some(
    (candidate) => Math.abs(candidate - options.innerWidth) <= FULLSCREEN_TOLERANCE_PX,
  )
  const heightMatches = heightCandidates.some(
    (candidate) => Math.abs(candidate - options.innerHeight) <= FULLSCREEN_TOLERANCE_PX,
  )

  return widthMatches && heightMatches
}

export function shouldHideProofChrome(pathname: string, browserFullscreen: boolean) {
  return pathname === '/proof' && browserFullscreen
}

export function getProofViewportHeight(hideProofChrome: boolean) {
  return hideProofChrome
    ? '100dvh'
    : 'calc(100dvh - var(--header-height, 57px))'
}
