export const PLAY_FULLSCREEN_HINT = 'Use F11 for fullscreen. Esc stays in-game.'

const hintClassName =
  'inline-flex items-center justify-center rounded-lg border border-border-strong bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-dim'

export function PlayFullscreenHint() {
  return (
    <span className={hintClassName}>
      {PLAY_FULLSCREEN_HINT}
    </span>
  )
}
