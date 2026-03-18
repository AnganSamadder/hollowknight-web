import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayFullscreenHint } from '~/components/PlayFullscreenHint'

describe('PlayFullscreenHint', () => {
  it('renders the F11-only fullscreen copy in passive markup', () => {
    const markup = renderToStaticMarkup(createElement(PlayFullscreenHint))

    expect(markup).toContain('Use F11 for fullscreen. Esc stays in-game.')
    expect(markup.startsWith('<span')).toBe(true)
    expect(markup).not.toContain('<button')
    expect(markup).not.toContain('>Fullscreen<')
  })
})
