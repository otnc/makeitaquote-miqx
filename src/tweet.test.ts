import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import { fromTweet } from './tweet'

/** A tweet shaped exactly as `TweetLike` expects one. */
function tweet(overrides: Record<string, unknown> = {}) {
  return {
    id: '20',
    text: 'just setting up my twttr',
    author: { id: '12', username: 'jack', name: 'jack', avatarUrl: 'https://cdn.test/jack.png' },
    ...overrides,
  }
}

describe('fromTweet', () => {
  it('reads text, id, mid and the display name', () => {
    const quote = fromTweet(tweet())

    expect(quote.text).toBe('just setting up my twttr')
    expect(quote.id).toBe('20')
    expect(quote.mid).toBe('12')
    expect(quote.name).toBe('jack')
  })

  it('takes the avatar url when there is one', () => {
    const quote = fromTweet(
      tweet({ author: { id: '1', username: 'a', avatarUrl: 'https://cdn.test/a.png' } }),
    )

    expect(quote.icon).toBe('https://cdn.test/a.png')
  })

  it('is null when there is no avatar url', () => {
    const quote = fromTweet(tweet({ author: { id: '1', username: 'a' } }))

    expect(quote.icon).toBeNull()
  })

  it('falls back to the handle when the account has no display name', () => {
    const quote = fromTweet(tweet({ author: { id: '1', username: 'someone', name: null } }))

    expect(quote.name).toBe('someone')
  })

  it('leaves the text exactly as written — no markdown or entities to resolve', () => {
    const quote = fromTweet(tweet({ text: 'check out https://t.co/xxxxx, cc @someone' }))

    expect(quote.text).toBe('check out https://t.co/xxxxx, cc @someone')
  })

  it('rejects anything that is not a tweet', () => {
    expect(() => fromTweet(null)).toThrow(ValidationError)
    expect(() => fromTweet({})).toThrow(ValidationError)
    expect(() => fromTweet({ id: '1', text: 'hi' })).toThrow(ValidationError)
    expect(() => fromTweet({ id: '1', text: 'hi', author: {} })).toThrow(ValidationError)
    expect(() => fromTweet({ text: 'hi', author: { id: '1', username: 'a' } })).toThrow(
      ValidationError,
    )
  })
})
