import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import {
  applyInput,
  assertRenderable,
  emptyQuote,
  MAX_PARAM_LENGTH,
  normalizeId,
  normalizeParam,
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

describe('normalizeParam', () => {
  it('rejects a value over the limit', () => {
    expect(() => normalizeParam('a'.repeat(MAX_PARAM_LENGTH + 1))).toThrow(ValidationError)
  })

  it('treats null/undefined as absent', () => {
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
