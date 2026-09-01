import { describe, expect, it } from 'vitest'
import { minimalMessage, v13Message, v14Message } from './__fixtures__/messages'
import { ValidationError } from './errors'
import { fromMessage } from './source'

describe('fromMessage', () => {
  it('reads content, id, mid, member nickname and member icon from a v14 message', () => {
    const quote = fromMessage(v14Message())

    expect(quote.text).toBe('Hello World!')
    expect(quote.id).toBe('1000')
    expect(quote.mid).toBe('1')
    expect(quote.name).toBe('ねこ')
    expect(quote.icon).toBe('https://cdn.discordapp.com/avatars/1/member.png?size=512')
  })

  it('quotes the content exactly as written by default', () => {
    const quote = fromMessage(v14Message({ content: '**bold** message' }))

    expect(quote.text).toBe('**bold** message')
  })

  it('strips markdown when opted in', () => {
    const quote = fromMessage(v14Message({ content: '**bold** message' }), {
      stripDiscordMarkdown: true,
    })

    expect(quote.text).toBe('bold message')
  })

  it('resolves mentions by default', () => {
    const quote = fromMessage(
      v14Message({
        content: 'hi <@1>',
        mentions: { users: new Map([['1', { username: 'otoneko' }]]) },
      }),
    )

    expect(quote.text).toBe('hi @otoneko')
  })

  it('leaves mentions as written when resolveMentions is false', () => {
    const quote = fromMessage(
      v14Message({
        content: 'hi <@1>',
        mentions: { users: new Map([['1', { username: 'otoneko' }]]) },
      }),
      { resolveMentions: false },
    )

    expect(quote.text).toBe('hi <@1>')
  })

  it('is a no-op when the message has no mentions field', () => {
    expect(fromMessage(v14Message({ content: 'hi <@1>' })).text).toBe('hi <@1>')
  })

  it('resolves mentions before stripping markdown', () => {
    const quote = fromMessage(
      v14Message({
        content: '**hi** <@1>',
        mentions: { users: new Map([['1', { username: 'otoneko' }]]) },
      }),
      { stripDiscordMarkdown: true },
    )

    expect(quote.text).toBe('hi @otoneko')
  })

  it('falls back to the author icon when there is no member', () => {
    expect(fromMessage(v13Message()).icon).toBe(
      'https://cdn.discordapp.com/avatars/1/user.png?size=512',
    )
  })

  it('prefers globalName over username when no member is present', () => {
    const quote = fromMessage(
      v13Message({ author: { id: '1', username: 'otoneko', globalName: '音猫｡' } }),
    )

    expect(quote.name).toBe('音猫｡')
  })

  it('accepts the snake_case global_name used by raw gateway payloads', () => {
    const quote = fromMessage(
      v13Message({ author: { id: '1', username: 'otoneko', global_name: '音猫｡' } }),
    )

    expect(quote.name).toBe('音猫｡')
  })

  it('falls back to the username when nothing else names the author', () => {
    const quote = fromMessage(minimalMessage())

    expect(quote.name).toBe('someone')
    expect(quote.icon).toBeNull()
  })

  it('survives a displayAvatarURL that rejects options', () => {
    const quote = fromMessage(
      minimalMessage({
        author: {
          id: '1',
          username: 'someone',
          displayAvatarURL: (options) => {
            if (options !== undefined) throw new TypeError('no options accepted')
            return 'https://example.test/a.png'
          },
        },
      }),
    )

    expect(quote.icon).toBe('https://example.test/a.png')
  })

  it('rejects objects that are not messages', () => {
    expect(() => fromMessage(null)).toThrow(ValidationError)
    expect(() => fromMessage({})).toThrow(ValidationError)
    expect(() => fromMessage({ id: '1', content: 'hi' })).toThrow(ValidationError)
  })
})

describe('choosing which icon', () => {
  it('prefers the guild icon by default', () => {
    expect(fromMessage(v14Message()).icon).toContain('member')
  })

  it('takes the account icon when asked', () => {
    expect(fromMessage(v14Message(), { avatar: 'global' }).icon).toContain('user')
  })

  it('falls back to the account icon when the member has none', () => {
    const message = v14Message({ member: { displayName: 'ねこ' } })

    expect(fromMessage(message, { avatar: 'guild' }).icon).toContain('user')
  })

  it('falls back to the guild icon when the account has none', () => {
    const message = v14Message({
      author: { id: '1', username: 'otoneko.' },
    })

    expect(fromMessage(message, { avatar: 'global' }).icon).toContain('member')
  })
})

describe('choosing which name', () => {
  const withBoth = () =>
    v14Message({
      author: {
        id: '1',
        username: 'otoneko.',
        globalName: '音猫｡',
        displayAvatarURL: () => 'https://example.test/u.png',
      },
      member: { nickname: 'ねこ', displayName: 'ねこ' },
    })

  it('prefers the server nickname by default', () => {
    expect(fromMessage(withBoth()).name).toBe('ねこ')
  })

  it('takes the global name when asked', () => {
    expect(fromMessage(withBoth(), { name: 'global' }).name).toBe('音猫｡')
  })

  it('falls back to the global name when there is no nickname', () => {
    const message = v14Message({
      author: { id: '1', username: 'otoneko.', globalName: '音猫｡' },
      member: null,
    })

    expect(fromMessage(message, { name: 'nickname' }).name).toBe('音猫｡')
  })

  it('falls back to the nickname when there is no global name', () => {
    const message = v14Message({
      author: { id: '1', username: 'otoneko.' },
      member: { nickname: 'ねこ' },
    })

    expect(fromMessage(message, { name: 'global' }).name).toBe('ねこ')
  })

  it('ends at the username when the message has neither', () => {
    expect(fromMessage(minimalMessage(), { name: 'global' }).name).toBe('someone')
  })

  it('does not treat displayName as a nickname when none is set', () => {
    // discord.js reports displayName as "nickname, or the global name", so a
    // member with no nickname must not shadow the global name.
    const message = v14Message({
      author: { id: '1', username: 'otoneko.', globalName: '音猫｡' },
      member: { displayName: '音猫｡' },
    })

    expect(fromMessage(message, { name: 'global' }).name).toBe('音猫｡')
  })
})
