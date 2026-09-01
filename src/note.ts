import { resolveNoteText, stripMfm } from '@makeitaquote/utils/mfm'
import { ValidationError } from './errors'
import { emptyQuote } from './quote'
import type { NoteLike, NoteSourceOptions, QuoteData } from './types'

function isNoteLike(value: unknown): value is NoteLike {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<NoteLike>
  if (typeof candidate.id !== 'string') return false
  if (candidate.user === null || typeof candidate.user !== 'object') return false
  return typeof candidate.user.id === 'string' && typeof candidate.user.username === 'string'
}

/** A remote author's id, qualified with their host so it stays unique across instances. */
function midFor(user: NoteLike['user']): string {
  return user.host ? `${user.id}@${user.host}` : user.id
}

/**
 * Derives a request from a Misskey note.
 *
 * The Misskey counterpart to `fromMessage()`, and shaped by the same rule:
 * quote what a reader saw. That means the display name over the handle, the
 * author's own avatar, and — by default — the note with its MFM scaffolding
 * taken off.
 *
 * Unlike Discord there is nothing here to resolve by id. A Misskey mention
 * is written `@user@host` in the note text already, so it is readable as it
 * stands and is left exactly alone.
 *
 * The note's own id becomes `id`. `mid` is the author's id, qualified with
 * their host for a remote author — a local id alone is only unique within
 * one instance, and a note quoted from a timeline could be from any of them.
 */
export function fromNote(note: unknown, options: NoteSourceOptions = {}): QuoteData {
  if (!isNoteLike(note)) {
    throw new ValidationError(
      'setFromNote expects a note with `id` and `user.id`/`user.username`',
      {
        field: 'note',
      },
    )
  }

  const source = resolveNoteText(note, options.preferCw)

  const quote = emptyQuote()
  quote.text = options.stripMfm === false ? source : stripMfm(source)
  quote.id = note.id
  quote.mid = midFor(note.user)
  quote.name = note.user.name || note.user.username
  quote.icon = note.user.avatarUrl ?? null

  return quote
}
