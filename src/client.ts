import { DEFAULT_BASE_URL, MAKE_PATH } from './endpoints'
import { MiQXApiError, ValidationError } from './errors'
import { createClient, HTTPError, type HttpClient, TimeoutError } from './http'
import {
  applyInput,
  assertRenderable,
  emptyQuote,
  normalizeHideLogo,
  normalizeIcon,
  normalizeId,
  normalizeMid,
  normalizeName,
  normalizeParam,
  normalizeText,
  normalizeUpload,
} from './quote'
import { fromMessage } from './source'
import type {
  AvatarSource,
  MessageLike,
  MessageSourceOptions,
  MiQXOptions,
  MiQXResult,
  QuoteData,
  QuoteInput,
} from './types'
import { errorMessage } from './util/errorMessage'
import { filenameFor, resolveIcon } from './util/icon'

/**
 * Builds a "Make it a Quote" image through the MiqX API.
 *
 * ```ts
 * const miqx = new MiQX({ apiKey: process.env.MIQX_API_KEY! })
 *
 * const { image } = await miqx
 *   .setText('Hello World!!')
 *   .setName('Steve Jobs')
 *   .setId('user0001')
 *   .setMid('94f7d0e8-98b3-4f79-971f-884e335f337a')
 *   .generate()
 * ```
 *
 * Note that the API is operated by a third party (miqx.jp), not by this
 * package. See https://miqx.jp/docs for the API it wraps.
 */
export class MiQX {
  #data: QuoteData = emptyQuote()
  #http: HttpClient
  #apiKey: string
  #baseUrl: string
  #signal: AbortSignal | undefined

  constructor(options: MiQXOptions) {
    if (typeof options?.apiKey !== 'string' || options.apiKey.trim() === '') {
      throw new ValidationError('apiKey is required', { field: 'apiKey' })
    }

    this.#apiKey = options.apiKey
    this.#baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.#signal = options.signal
    this.#http = createClient({
      timeout: options.timeout ?? 15_000,
      retry: options.retry ?? 2,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        ...options.headers,
      },
    })
  }

  setText(text: string): this {
    this.#data.text = normalizeText(text)
    return this
  }

  setName(name: string): this {
    this.#data.name = normalizeName(name)
    return this
  }

  /** Must be a unique, alphanumeric-only identifier for this message. */
  setId(id: string): this {
    this.#data.id = normalizeId(id)
    return this
  }

  /** The speaker's own unique identifier — kept separate from `id` so the same speaker is recognized across messages. */
  setMid(mid: string): this {
    this.#data.mid = normalizeMid(mid)
    return this
  }

  /** A URL, `Buffer`/`Uint8Array` of PNG or JPG bytes, or `Blob`. A URL is fetched before sending. */
  setIcon(icon: AvatarSource | null): this {
    this.#data.icon = normalizeIcon(icon)
    return this
  }

  /** Raw custom parameters, passed to the API as-is. See https://miqx.jp/param for the playground. */
  setParam(param: string | null): this {
    this.#data.param = normalizeParam(param)
    return this
  }

  /** Hides the MiqX watermark. Requires a Basic+ plan — the API ignores it otherwise. */
  setHideLogo(hideLogo = true): this {
    this.#data.hideLogo = normalizeHideLogo(hideLogo)
    return this
  }

  /** Also uploads the image and returns a hosted URL. Requires a Starter+ plan. */
  setUpload(upload = true): this {
    this.#data.upload = normalizeUpload(upload)
    return this
  }

  setFromMessage(message: MessageLike, options?: MessageSourceOptions): this {
    const { param, hideLogo, upload } = this.#data
    this.#data = { ...fromMessage(message, options), param, hideLogo, upload }
    return this
  }

  setFromObject(input: QuoteInput): this {
    this.#data = applyInput(this.#data, input)
    return this
  }

  getData(): Readonly<QuoteData> {
    return { ...this.#data }
  }

  clone(): MiQX {
    const copy = new MiQX({ apiKey: this.#apiKey, baseUrl: this.#baseUrl })
    copy.#data = { ...this.#data }
    copy.#http = this.#http
    copy.#signal = this.#signal
    return copy
  }

  /** Renders the request and returns the image bytes, plus a hosted URL when `upload` is set. */
  async generate(): Promise<MiQXResult> {
    return this.#send(this.#data.upload)
  }

  /** Convenience for `(await generate()).image`. */
  async toBuffer(): Promise<Buffer> {
    return (await this.generate()).image
  }

  /**
   * Convenience for `(await generate()).url`, forcing `upload` on for this
   * one request — it does not change what `setUpload()` left stored, or what
   * a later `generate()` returns.
   *
   * Requires a Starter+ plan; the API otherwise answers without a `url`.
   */
  async toURL(): Promise<string> {
    const result = await this.#send(true)
    if (!result.url) {
      throw new MiQXApiError('The API response did not contain a url', {
        endpoint: MAKE_PATH,
        body: result,
      })
    }
    return result.url
  }

  async #send(upload: boolean): Promise<MiQXResult> {
    assertRenderable(this.#data)

    const form = await this.#buildForm(upload)

    let response: Response
    try {
      response = await this.#http.post(`${this.#baseUrl}${MAKE_PATH}`, {
        json: form,
        ...(this.#signal ? { signal: this.#signal } : {}),
      })
    } catch (cause) {
      throw toApiError(cause, 'Failed to generate quote')
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch (cause) {
      throw new MiQXApiError('The API did not return JSON', { endpoint: MAKE_PATH, cause })
    }

    return parseResult(parsed)
  }

  async #buildForm(upload: boolean): Promise<FormData> {
    const { text, name, id, mid, icon, param, hideLogo } = this.#data

    const form = new FormData()
    form.set('text', text)
    form.set('name', name)
    form.set('id', id)
    form.set('mid', mid)
    if (param !== null) form.set('param', param)
    if (hideLogo) form.set('hideLogo', 'true')
    if (upload) form.set('upload', 'true')
    if (icon !== null) {
      const blob = await resolveIcon(icon, this.#signal)
      form.set('img', blob, filenameFor(blob))
    }
    return form
  }
}

function parseResult(parsed: unknown): MiQXResult {
  const body = parsed as {
    status?: unknown
    message?: unknown
    error_code?: unknown
    data?: { image?: unknown; url?: unknown }
  } | null

  if (body?.status !== 'success') {
    throw new MiQXApiError(
      typeof body?.message === 'string' ? body.message : 'The API reported a failure',
      {
        endpoint: MAKE_PATH,
        body: parsed,
        errorCode: typeof body?.error_code === 'string' ? body.error_code : undefined,
      },
    )
  }

  const image = body.data?.image
  if (typeof image !== 'string' || image.length === 0) {
    throw new MiQXApiError('The API response did not contain image data', {
      endpoint: MAKE_PATH,
      body: parsed,
    })
  }

  const url = body.data?.url
  return {
    image: Buffer.from(image, 'base64'),
    url: typeof url === 'string' ? url : null,
  }
}

/**
 * Turns whatever the HTTP layer threw into a `MiQXApiError`, keeping the
 * response body — and its `error_code` — when there is one.
 */
function toApiError(cause: unknown, prefix: string): MiQXApiError {
  if (cause instanceof HTTPError) {
    const parsedBody = safeJsonParse(cause.body)
    return new MiQXApiError(`${prefix}: HTTP ${cause.response.status}`, {
      endpoint: MAKE_PATH,
      status: cause.response.status,
      body: parsedBody ?? cause.body,
      errorCode: typeof parsedBody?.error_code === 'string' ? parsedBody.error_code : undefined,
      cause,
    })
  }

  if (cause instanceof TimeoutError) {
    return new MiQXApiError(`${prefix}: request timed out`, { endpoint: MAKE_PATH, cause })
  }

  return new MiQXApiError(`${prefix}: ${errorMessage(cause)}`, { endpoint: MAKE_PATH, cause })
}

function safeJsonParse(text: string): { error_code?: unknown; message?: unknown } | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
