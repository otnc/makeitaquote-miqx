import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { v14Message } from './__fixtures__/messages'
import { MiQX } from './client'
import { MiQXApiError, ValidationError } from './errors'

interface Call {
  url: string
  method: string
  form: FormData
}

let calls: Call[] = []

/**
 * Stubs `fetch` rather than the HTTP client itself, so the retry, timeout and
 * error-mapping behaviour under test is the real thing.
 */
function stubFetch(handler: (url: string, form: FormData) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input)
    const form = init.body as FormData
    calls.push({ url, method: (init.method ?? 'GET').toUpperCase(), form })
    return handler(url, form)
  })
}

function successResponse(data: { image?: string; url?: string } = {}) {
  return jsonResponse({
    status: 'success',
    message: 'Image generated successfully',
    data: { image: 'aGVsbG8=', ...data },
  })
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function client() {
  return new MiQX({ apiKey: 'test-key', retry: 0 })
    .setText('Hello World!!')
    .setName('Steve Jobs')
    .setId('user0001')
    .setMid('mid0001')
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('constructor', () => {
  it('requires an apiKey', () => {
    expect(() => new MiQX({ apiKey: '' })).toThrow(ValidationError)
    expect(() => new MiQX({} as never)).toThrow(ValidationError)
  })

  it('sends the apiKey as a Bearer token', async () => {
    let seenAuth: string | null = null
    vi.stubGlobal('fetch', async (_input: unknown, init?: RequestInit) => {
      seenAuth = new Headers(init?.headers).get('Authorization')
      return successResponse()
    })

    await client().generate()

    expect(seenAuth).toBe('Bearer test-key')
  })
})

describe('generate', () => {
  it('posts to /v1/make with the request fields as multipart form data', async () => {
    stubFetch(() => successResponse())

    await client().generate()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.miqx.jp/v1/make')
    expect(calls[0]?.method).toBe('POST')
    const form = calls[0]?.form as FormData
    expect(form.get('text')).toBe('Hello World!!')
    expect(form.get('name')).toBe('Steve Jobs')
    expect(form.get('id')).toBe('user0001')
    expect(form.get('mid')).toBe('mid0001')
    expect(form.has('hideLogo')).toBe(false)
    expect(form.has('upload')).toBe(false)
  })

  it('decodes the base64 image into a Buffer', async () => {
    stubFetch(() => successResponse({ image: Buffer.from('hello').toString('base64') }))

    const result = await client().generate()

    expect(result.image).toEqual(Buffer.from('hello'))
    expect(result.url).toBeNull()
  })

  it('includes hideLogo and upload only when set', async () => {
    stubFetch(() => successResponse())

    await client().setHideLogo().setUpload().generate()

    const form = calls[0]?.form as FormData
    expect(form.get('hideLogo')).toBe('true')
    expect(form.get('upload')).toBe('true')
  })

  it('honours a custom baseUrl and trims its trailing slash', async () => {
    stubFetch(() => successResponse())

    await new MiQX({ apiKey: 'k', baseUrl: 'https://mirror.test/', retry: 0 })
      .setText('hi')
      .setName('n')
      .setId('id1')
      .setMid('m1')
      .generate()

    expect(calls[0]?.url).toBe('https://mirror.test/v1/make')
  })

  it('defaults to the v1 endpoint, and honours an explicit apiVersion', async () => {
    stubFetch(() => successResponse())

    await new MiQX({ apiKey: 'k', apiVersion: 'v1', retry: 0 })
      .setText('hi')
      .setName('n')
      .setId('id1')
      .setMid('m1')
      .generate()

    expect(calls[0]?.url).toBe('https://api.miqx.jp/v1/make')
  })

  it('attaches the icon as a file part when set from bytes', async () => {
    stubFetch(() => successResponse())

    await client()
      .setIcon(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
      .generate()

    const icon = calls[0]?.form.get('img')
    expect(icon).toBeInstanceOf(Blob)
  })

  it('requires text, name, id and mid before sending', async () => {
    stubFetch(() => successResponse())

    await expect(new MiQX({ apiKey: 'k', retry: 0 }).generate()).rejects.toThrow(ValidationError)
    expect(calls).toHaveLength(0)
  })
})

describe('toBuffer / toURL', () => {
  it('toBuffer returns just the image', async () => {
    stubFetch(() => successResponse({ image: Buffer.from('img').toString('base64') }))

    const buffer = await client().toBuffer()

    expect(buffer).toEqual(Buffer.from('img'))
  })

  it('toURL forces upload for that call without mutating stored state', async () => {
    stubFetch(() => successResponse({ url: 'https://miqx.jp/i/abc.png' }))

    const quote = client()
    const url = await quote.toURL()

    expect(url).toBe('https://miqx.jp/i/abc.png')
    expect(calls[0]?.form.get('upload')).toBe('true')
    expect(quote.getData().upload).toBe(false)
  })

  it('fails when toURL gets a response without a url', async () => {
    stubFetch(() => successResponse())

    await expect(client().toURL()).rejects.toThrow(MiQXApiError)
  })
})

describe('input', () => {
  it('builds from a Discord message', () => {
    const data = new MiQX({ apiKey: 'k' }).setFromMessage(v14Message()).getData()

    expect(data.text).toBe('Hello World!')
    expect(data.name).toBe('ねこ')
    expect(data.id).toBe('1000')
    expect(data.mid).toBe('1')
  })

  it('builds from a tweet', () => {
    const data = new MiQX({ apiKey: 'k' })
      .setFromTweet({
        id: '20',
        text: 'just setting up my twttr',
        author: { id: '12', username: 'jack', name: 'jack', avatarUrl: 'https://cdn.test/j.png' },
      })
      .getData()

    expect(data.text).toBe('just setting up my twttr')
    expect(data.name).toBe('jack')
    expect(data.id).toBe('20')
    expect(data.mid).toBe('12')
    expect(data.icon).toBe('https://cdn.test/j.png')
  })

  it('builds from a Misskey note', () => {
    const data = new MiQX({ apiKey: 'k' })
      .setFromNote({
        id: 'x',
        text: '$[jelly おはよう]',
        user: { id: 'u', username: 'otoneko', name: '音猫｡', host: null, avatarUrl: null },
      })
      .getData()

    expect(data.text).toBe('おはよう')
    expect(data.name).toBe('音猫｡')
    expect(data.id).toBe('x')
    expect(data.mid).toBe('u')
  })

  it('keeps param/hideLogo/upload across setFromMessage/setFromTweet/setFromNote', () => {
    const data = new MiQX({ apiKey: 'k' })
      .setParam('p')
      .setHideLogo()
      .setUpload()
      .setFromTweet({
        id: '20',
        text: 'hi',
        author: { id: '12', username: 'jack' },
      })
      .getData()

    expect(data).toMatchObject({ param: 'p', hideLogo: true, upload: true })
  })

  it('merges partial objects', () => {
    const data = new MiQX({ apiKey: 'k' })
      .setText('first')
      .setFromObject({ name: 'otoneko.', id: 'id1' })
      .getData()

    expect(data).toMatchObject({ text: 'first', name: 'otoneko.', id: 'id1' })
  })

  it('rejects a non-alphanumeric id', () => {
    expect(() => new MiQX({ apiKey: 'k' }).setId('bad id!')).toThrow(ValidationError)
  })

  it('clone does not share state with the original', () => {
    const original = new MiQX({ apiKey: 'k' }).setText('first')
    const copy = original.clone().setText('second')

    expect(original.getData().text).toBe('first')
    expect(copy.getData().text).toBe('second')
  })

  it('clone carries the apiVersion over', async () => {
    stubFetch(() => successResponse())

    const copy = new MiQX({ apiKey: 'k', apiVersion: 'v1', retry: 0 })
      .setText('hi')
      .setName('n')
      .setId('id1')
      .setMid('m1')
      .clone()

    await copy.generate()

    expect(calls[0]?.url).toBe('https://api.miqx.jp/v1/make')
  })
})

describe('errors', () => {
  it('maps an HTTP failure onto MiQXApiError with the status, body and error_code', async () => {
    stubFetch(() =>
      jsonResponse({ status: 'error', message: 'nope', error_code: 'VALIDATION_ERROR' }, 400),
    )

    const error = await client()
      .generate()
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(MiQXApiError)
    expect((error as MiQXApiError).status).toBe(400)
    expect((error as MiQXApiError).errorCode).toBe('VALIDATION_ERROR')
    expect((error as MiQXApiError).endpoint).toBe('/v1/make')
  })

  it('fails when the API reports status "error" on a 200 response', async () => {
    stubFetch(() => jsonResponse({ status: 'error', message: 'boom' }))

    await expect(client().generate()).rejects.toThrow(MiQXApiError)
  })

  it('fails when the response is not JSON', async () => {
    stubFetch(() => new Response('<html>oops</html>', { status: 200 }))

    await expect(client().generate()).rejects.toThrow(MiQXApiError)
  })

  it('wraps network failures', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })

    await expect(client().generate()).rejects.toThrow(MiQXApiError)
  })
})
