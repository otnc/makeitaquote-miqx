import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import {
  applyInput,
  assertRenderable,
  emptyQuote,
  MAX_NAME_LENGTH,
  MAX_PARAM_LENGTH,
  MAX_TEXT_LENGTH,
  normalizeHideLogo,
  normalizeIcon,
  normalizeId,
  normalizeMid,
  normalizeName,
  normalizeParam,
  normalizeText,
  normalizeUpload,
} from './quote'

describe('emptyQuote', () => {
  it('returns a blank request', () => {
    expect(emptyQuote()).toEqual({
      text: '',
      name: '',
      id: '',
      mid: '',
      icon: null,
      param: null,
      hideLogo: false,
      upload: false,
    })
  })
})

describe('normalizeText', () => {
  it('accepts a string within the limit', () => {
    expect(normalizeText('hi')).toBe('hi')
  })

  it('rejects a non-string', () => {
    expect(() => normalizeText(42)).toThrow(ValidationError)
  })

  it('rejects text over the limit', () => {
    expect(() => normalizeText('a'.repeat(MAX_TEXT_LENGTH + 1))).toThrow(ValidationError)
  })
})

describe('normalizeName / normalizeMid / normalizeParam', () => {
  it('reject a value over their respective limits', () => {
    expect(() => normalizeName('a'.repeat(MAX_NAME_LENGTH + 1))).toThrow(ValidationError)
    expect(() => normalizeMid('a'.repeat(MAX_NAME_LENGTH + 1))).toThrow(ValidationError)
    expect(() => normalizeParam('a'.repeat(MAX_PARAM_LENGTH + 1))).toThrow(ValidationError)
  })

  it('accept a value at the limit', () => {
    expect(normalizeName('a'.repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH)
  })

  it('treats null/undefined param as absent', () => {
    expect(normalizeParam(null)).toBeNull()
    expect(normalizeParam(undefined)).toBeNull()
  })
})

describe('normalizeId', () => {
  it('accepts alphanumeric-only ids', () => {
    expect(normalizeId('user0001')).toBe('user0001')
  })

  it('rejects ids with spaces or symbols', () => {
    expect(() => normalizeId('user 0001')).toThrow(ValidationError)
    expect(() => normalizeId('user-0001')).toThrow(ValidationError)
    expect(() => normalizeId('')).toThrow(ValidationError)
  })

  it('rejects a non-string', () => {
    expect(() => normalizeId(42)).toThrow(ValidationError)
  })
})

describe('normalizeIcon', () => {
  it('accepts a string, a URL, a Uint8Array, a Blob or null', () => {
    expect(normalizeIcon('https://example.test/a.png')).toBe('https://example.test/a.png')
    const url = new URL('https://example.test/a.png')
    expect(normalizeIcon(url)).toBe(url)
    const bytes = new Uint8Array([1, 2, 3])
    expect(normalizeIcon(bytes)).toBe(bytes)
    const blob = new Blob([bytes])
    expect(normalizeIcon(blob)).toBe(blob)
    expect(normalizeIcon(null)).toBeNull()
  })

  it('treats undefined as null', () => {
    expect(normalizeIcon(undefined)).toBeNull()
  })

  it('rejects anything else', () => {
    expect(() => normalizeIcon(42)).toThrow(ValidationError)
  })
})

describe('normalizeHideLogo / normalizeUpload', () => {
  it('require a boolean', () => {
    expect(() => normalizeHideLogo('true')).toThrow(ValidationError)
    expect(() => normalizeUpload('true')).toThrow(ValidationError)
  })

  it('accept a boolean', () => {
    expect(normalizeHideLogo(true)).toBe(true)
    expect(normalizeUpload(false)).toBe(false)
  })
})

describe('applyInput', () => {
  it('validates and merges only the provided fields', () => {
    const base = emptyQuote()
    const merged = applyInput(base, { text: 'hi', name: 'otoneko.' })

    expect(merged).toMatchObject({ text: 'hi', name: 'otoneko.' })
    expect(merged.mid).toBe(base.mid)
  })

  it('rejects a non-object input', () => {
    expect(() => applyInput(emptyQuote(), null as never)).toThrow(ValidationError)
  })
})

describe('assertRenderable', () => {
  it('throws when text, name, id or mid is empty or whitespace-only', () => {
    expect(() => assertRenderable(emptyQuote())).toThrow(ValidationError)
    expect(() =>
      assertRenderable({ ...emptyQuote(), text: 'hi', name: 'a', id: 'a', mid: '   ' }),
    ).toThrow(ValidationError)
  })

  it('passes when all required fields have content', () => {
    expect(() =>
      assertRenderable({ ...emptyQuote(), text: 'hi', name: 'a', id: 'a', mid: 'a' }),
    ).not.toThrow()
  })
})
