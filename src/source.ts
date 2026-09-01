import { stripDiscordMarkdown } from './discordMarkdown'
import { ValidationError } from './errors'
import { resolveMentions } from './mentions'
import { emptyQuote } from './quote'
import type { MessageLike, MessageSourceOptions, QuoteData } from './types'

/**
 * Ask discord.js for a PNG icon at a sane size.
 *
 * The default `displayAvatarURL()` can hand back an animated WebP, and pulling
 * a 4096px source to draw it small is pure waste. Some older or hand-rolled
 * message objects take no arguments at all, so fall back to a bare call.
 */
function avatarURL(holder: { displayAvatarURL?: (options?: unknown) => string }): string | null {
  if (typeof holder.displayAvatarURL !== 'function') return null
  try {
    const url = holder.displayAvatarURL({ extension: 'png', size: 512 })
    if (typeof url === 'string' && url.length > 0) return url
  } catch {
    // Falls through to the no-argument form below.
  }
  try {
    const url = holder.displayAvatarURL()
    return typeof url === 'string' && url.length > 0 ? url : null
  } catch {
    return null
  }
}

/** The per-server nickname, if this message has one. */
function guildName(message: MessageLike): string | null {
  const member = message.member
  if (!member) return null
  if (typeof member.nickname === 'string' && member.nickname) return member.nickname
  // discord.js exposes displayName as "nickname, or the global name"; it is
  // only a guild name when a nickname is actually set, so it is checked second.
  if (typeof member.displayName === 'string' && member.displayName) return member.displayName
  return null
}

/** The account-wide display name, ignoring any server nickname. */
function globalName(message: MessageLike): string | null {
  const { author } = message
  if (typeof author.globalName === 'string' && author.globalName) return author.globalName
  if (typeof author.global_name === 'string' && author.global_name) return author.global_name
  return null
}

function isMessageLike(value: unknown): value is MessageLike {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<MessageLike>
  if (typeof candidate.id !== 'string') return false
  if (typeof candidate.content !== 'string') return false
  if (candidate.author === null || typeof candidate.author !== 'object') return false
  return typeof candidate.author.id === 'string' && typeof candidate.author.username === 'string'
}

/**
 * Derives a request from anything shaped like a Discord message.
 *
 * The message's own id becomes `id` and the author's id becomes `mid` —
 * both are Discord snowflakes, so both are already alphanumeric-only, which
 * is all the API requires of `id`.
 *
 * By default the server's view wins for both the icon and the name — a
 * per-server avatar and nickname are what someone reading that server saw, so
 * they are what a quote from it should show. Both can be switched to the
 * account-wide version.
 *
 * Whichever is chosen, the other is still the fallback: asking for a guild
 * icon on a message with none gets the global one rather than nothing.
 */
export function fromMessage(message: unknown, options: MessageSourceOptions = {}): QuoteData {
  if (!isMessageLike(message)) {
    throw new ValidationError(
      'setFromMessage expects a message with `id`, `content`, `author.id` and `author.username`',
      { field: 'message' },
    )
  }

  const preferGlobalAvatar = options.avatar === 'global'
  const preferGlobalName = options.name === 'global'

  const guildAvatar = message.member ? avatarURL(message.member) : null
  const userAvatar = avatarURL(message.author)

  const quote = emptyQuote()
  const withMentions =
    options.resolveMentions === false
      ? message.content
      : resolveMentions(
          message.content,
          message,
          typeof options.resolveMentions === 'object' ? options.resolveMentions : {},
        )
  quote.text = options.stripDiscordMarkdown ? stripDiscordMarkdown(withMentions) : withMentions
  quote.id = message.id
  quote.mid = message.author.id
  quote.name = preferGlobalName
    ? (globalName(message) ?? guildName(message) ?? message.author.username)
    : (guildName(message) ?? globalName(message) ?? message.author.username)
  quote.icon = preferGlobalAvatar ? (userAvatar ?? guildAvatar) : (guildAvatar ?? userAvatar)

  return quote
}
