export const PROOF_FULLSCREEN_HINT = 'Use F11 for fullscreen. Esc keeps the worksheet visible.'

const hintClassName =
  'inline-flex items-center justify-center rounded-lg border border-border-strong bg-surface px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-fg-dim'

export function ProofFullscreenHint() {
  return (
    <span className={hintClassName}>
      {PROOF_FULLSCREEN_HINT}
    </span>
  )
}
