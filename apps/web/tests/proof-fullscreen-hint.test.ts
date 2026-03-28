import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProofFullscreenHint } from '~/components/ProofFullscreenHint'

describe('ProofFullscreenHint', () => {
  it('renders the neutral fullscreen copy in passive markup', () => {
    const markup = renderToStaticMarkup(createElement(ProofFullscreenHint))

    expect(markup).toContain('Use F11 for fullscreen. Esc keeps the worksheet visible.')
    expect(markup.startsWith('<span')).toBe(true)
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('>Fullscreen<')
    expect(markup).not.toContain('in-game')
  })
})
