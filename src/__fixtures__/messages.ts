import type { MessageLike } from '../types'

/** discord.js v14: global name, guild member with a nickname. */
export function v14Message(overrides: Partial<MessageLike> = {}): MessageLike {
  return {
    id: '1000',
    content: 'Hello World!',
    author: {
      id: '1',
      username: 'otoneko.',
      globalName: '音猫｡',
      displayAvatarURL: (options) => urlFor('user', options),
    },
    member: {
      displayName: 'ねこ',
      nickname: 'ねこ',
      displayAvatarURL: (options) => urlFor('member', options),
    },
    ...overrides,
  }
}

/** discord.js v13 / selfbot: no global name, no member. */
export function v13Message(overrides: Partial<MessageLike> = {}): MessageLike {
  return {
    id: '1000',
    content: 'Hello World!',
    author: {
      id: '1',
      username: 'otoneko',
      displayAvatarURL: (options) => urlFor('user', options),
    },
    member: null,
    ...overrides,
  }
}

/** An object that only implements the bare minimum of `MessageLike`. */
export function minimalMessage(overrides: Partial<MessageLike> = {}): MessageLike {
  return {
    id: '1000',
    content: 'Hello World!',
    author: { id: '1', username: 'someone' },
    ...overrides,
  }
}

function urlFor(who: string, options: unknown): string {
  const opts = (options ?? {}) as { extension?: string; size?: number }
  const extension = opts.extension ?? 'webp'
  const size = opts.size ?? 4096
  return `https://cdn.discordapp.com/avatars/1/${who}.${extension}?size=${size}`
}
