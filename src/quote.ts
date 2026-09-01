import { ValidationError } from './errors'
import type { AvatarSource, QuoteData, QuoteInput } from './types'

export const MAX_TEXT_LENGTH = 4000
export const MAX_NAME_LENGTH = 128
export const MAX_PARAM_LENGTH = 256

/** The API rejects any `id` that isn't alphanumeric-only. */
const ID_PATTERN = /^[A-Za-z0-9]+$/

export function emptyQuote(): QuoteData {
  return {
    text: '',
    name: '',
    id: '',
    mid: '',
    icon: null,
    param: null,
    hideLogo: false,
    upload: false,
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string, received ${typeof value}`, { field })
  }
}

function assertLength(value: string, max: number, field: string) {
  if (value.length > max) {
    throw new ValidationError(
      `${field} must be at most ${max} characters, received ${value.length}`,
      { field },
    )
  }
}

export function normalizeText(text: unknown): string {
  assertString(text, 'text')
  assertLength(text, MAX_TEXT_LENGTH, 'text')
  return text
}

export function normalizeName(name: unknown): string {
  assertString(name, 'name')
  assertLength(name, MAX_NAME_LENGTH, 'name')
  return name
}

/** `id` must be a unique, alphanumeric-only identifier for the message — no spaces or symbols. */
export function normalizeId(id: unknown): string {
  assertString(id, 'id')
  if (!ID_PATTERN.test(id)) {
    throw new ValidationError('id must contain only alphanumeric characters (A-Z, a-z, 0-9)', {
      field: 'id',
    })
  }
  return id
}

export function normalizeMid(mid: unknown): string {
  assertString(mid, 'mid')
  assertLength(mid, MAX_NAME_LENGTH, 'mid')
  return mid
}

export function normalizeParam(param: unknown): string | null {
  if (param === null || param === undefined) return null
  assertString(param, 'param')
  assertLength(param, MAX_PARAM_LENGTH, 'param')
  return param
}

export function normalizeIcon(icon: unknown): AvatarSource | null {
  if (icon === null || icon === undefined) return null
  if (typeof icon === 'string') return icon
  if (icon instanceof URL) return icon
  if (icon instanceof Uint8Array) return icon
  if (icon instanceof Blob) return icon
  throw new ValidationError('icon must be a string, URL, Buffer, Uint8Array or Blob', {
    field: 'icon',
  })
}

export function normalizeHideLogo(hideLogo: unknown): boolean {
  if (typeof hideLogo !== 'boolean') {
    throw new ValidationError('hideLogo must be a boolean', { field: 'hideLogo' })
  }
  return hideLogo
}

export function normalizeUpload(upload: unknown): boolean {
  if (typeof upload !== 'boolean') {
    throw new ValidationError('upload must be a boolean', { field: 'upload' })
  }
  return upload
}

/**
 * Applies a partial input onto a request, validating each provided field.
 *
 * Absent keys are left untouched; `undefined` is treated as absent so that
 * spreading a partially-filled object behaves the way it reads.
 */
export function applyInput(target: QuoteData, input: QuoteInput): QuoteData {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('setFromObject expects an object', { field: 'input' })
  }

  const next: QuoteData = { ...target }

  if (input.text !== undefined) next.text = normalizeText(input.text)
  if (input.name !== undefined) next.name = normalizeName(input.name)
  if (input.id !== undefined) next.id = normalizeId(input.id)
  if (input.mid !== undefined) next.mid = normalizeMid(input.mid)
  if (input.icon !== undefined) next.icon = normalizeIcon(input.icon)
  if (input.param !== undefined) next.param = normalizeParam(input.param)
  if (input.hideLogo !== undefined) next.hideLogo = normalizeHideLogo(input.hideLogo)
  if (input.upload !== undefined) next.upload = normalizeUpload(input.upload)

  return next
}

/**
 * Final check before sending.
 *
 * `text`, `name`, `id` and `mid` are all required by the API — anything
 * missing would fail server-side anyway, so it's rejected before the request
 * goes out.
 */
export function assertRenderable(data: QuoteData): void {
  if (data.text.trim().length === 0) {
    throw new ValidationError('text is required', { field: 'text' })
  }
  if (data.name.trim().length === 0) {
    throw new ValidationError('name is required', { field: 'name' })
  }
  if (data.id.trim().length === 0) {
    throw new ValidationError('id is required', { field: 'id' })
  }
  if (data.mid.trim().length === 0) {
    throw new ValidationError('mid is required', { field: 'mid' })
  }
}
