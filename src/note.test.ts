import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import { fromNote } from './note'

/** A note shaped exactly as the Misskey API returns one. */
function note(overrides: Record<string, unknown> = {}) {
  return {
    id: 'x',
    text: 'こんにちは',
    cw: null,
    user: { id: 'u', username: 'otoneko', name: '音猫｡', host: null, avatarUrl: null },
    ...overrides,
  }
}

describe('fromNote', () => {
  it('reads text, id, mid and the display name from a local note', () => {
    const quote = fromNote(note())

    expect(quote.text).toBe('こんにちは')
    expect(quote.id).toBe('x')
    expect(quote.mid).toBe('u')
    expect(quote.name).toBe('音猫｡')
  })

  it('takes the avatar url when there is one', () => {
    const quote = fromNote(
      note({ user: { id: 'a', username: 'a', avatarUrl: 'https://cdn.test/a.png' } }),
    )

    expect(quote.icon).toBe('https://cdn.test/a.png')
  })

  it('qualifies mid with the host for a remote author', () => {
    const quote = fromNote(
      note({ user: { id: 'u', username: 'someone', host: 'misskey.example' } }),
    )

    expect(quote.mid).toBe('u@misskey.example')
  })

  it('falls back to the username when the account has no display name', () => {
    const quote = fromNote(note({ user: { id: 'u', username: 'someone', name: null } }))

    expect(quote.name).toBe('someone')
  })

  it('strips MFM by default', () => {
    expect(fromNote(note({ text: '$[jelly おはよう]' })).text).toBe('おはよう')
  })

  it('leaves MFM alone when asked', () => {
    const quote = fromNote(note({ text: '$[jelly おはよう]' }), { stripMfm: false })

    expect(quote.text).toBe('$[jelly おはよう]')
  })

  it('quotes the text rather than the content warning by default', () => {
    const quote = fromNote(note({ text: 'the note', cw: 'a warning' }))

    expect(quote.text).toBe('the note')
  })

  it('quotes the content warning when asked', () => {
    const quote = fromNote(note({ text: 'the note', cw: 'a warning' }), { preferCw: true })

    expect(quote.text).toBe('a warning')
  })

  it('falls back to the other when one of text and cw is missing', () => {
    expect(fromNote(note({ text: null, cw: 'only a warning' })).text).toBe('only a warning')
    expect(fromNote(note({ text: 'only text' }), { preferCw: true }).text).toBe('only text')
  })

  it('treats a text-less note as empty rather than throwing', () => {
    expect(fromNote(note({ text: null, cw: null })).text).toBe('')
  })

  it('rejects anything that is not a note', () => {
    expect(() => fromNote(null)).toThrow(ValidationError)
    expect(() => fromNote({})).toThrow(ValidationError)
    expect(() => fromNote({ id: 'x', text: 'hi' })).toThrow(ValidationError)
    expect(() => fromNote({ id: 'x', text: 'hi', user: {} })).toThrow(ValidationError)
    expect(() => fromNote({ text: 'hi', user: { id: 'u', username: 'a' } })).toThrow(
      ValidationError,
    )
  })
})
