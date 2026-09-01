import { type ApiVersion, DEFAULT_API_VERSION, DEFAULT_BASE_URL } from './endpoints'
import { MiQXApiError, ValidationError } from './errors'
import { createClient, HTTPError, type HttpClient, TimeoutError } from './http'
import { fromNote } from './note'
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
import { fromTweet } from './tweet'
import type {
  AvatarSource,
  MessageLike,
  MessageSourceOptions,
  MiQXOptions,
  MiQXResult,
  NoteLike,
  NoteSourceOptions,
  QuoteData,
  QuoteInput,
  TweetLike,
} from './types'
import { errorMessage } from './util/errorMessage'
import * as v1 from './v1'

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
  #apiVersion: ApiVersion
  #baseUrl: string
  #signal: AbortSignal | undefined

  constructor(options: MiQXOptions) {
    if (typeof options?.apiKey !== 'string' || options.apiKey.trim() === '') {
      throw new ValidationError('apiKey is required', { field: 'apiKey' })
    }

    this.#apiKey = options.apiKey
    this.#apiVersion = options.apiVersion ?? DEFAULT_API_VERSION
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

  /**
   * Reads a Misskey note the way `setFromMessage()` reads a Discord message.
   *
   * Takes what the API returns for a note, unchanged. MFM is stripped by
   * default — see `NoteSourceOptions`.
   */
  setFromNote(note: NoteLike, options?: NoteSourceOptions): this {
    const { param, hideLogo, upload } = this.#data
    this.#data = { ...fromNote(note, options), param, hideLogo, upload }
    return this
  }

  /**
   * Reads a tweet/post the way `setFromMessage()` reads a Discord message.
   *
   * `TweetLike` has no adapter this package fetches through directly —
   * `fromTwitterApiV2Tweet()`/`fromFxTwitterStatus()` turn a real API
   * response into one first.
   */
  setFromTweet(tweet: TweetLike): this {
    const { param, hideLogo, upload } = this.#data
    this.#data = { ...fromTweet(tweet), param, hideLogo, upload }
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
    const copy = new MiQX({
      apiKey: this.#apiKey,
      apiVersion: this.#apiVersion,
      baseUrl: this.#baseUrl,
    })
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
        endpoint: this.#path(),
        body: result,
      })
    }
    return result.url
  }

  async #send(upload: boolean): Promise<MiQXResult> {
    assertRenderable(this.#data)

    const path = this.#path()
    const form = await this.#buildForm(upload)

    let response: Response
    try {
      response = await this.#http.post(`${this.#baseUrl}${path}`, {
        json: form,
        ...(this.#signal ? { signal: this.#signal } : {}),
      })
    } catch (cause) {
      throw toApiError(cause, path, 'Failed to generate quote')
    }

    let parsed: unknown
    try {
      parsed = await response.json()
    } catch (cause) {
      throw new MiQXApiError('The API did not return JSON', { endpoint: path, cause })
    }

    return this.#parseResult(parsed)
  }

  /** The endpoint path for the request currently in flight — version-specific. */
  #path(): string {
    switch (this.#apiVersion) {
      case 'v1':
        return v1.PATH
      default:
        return assertNeverVersion(this.#apiVersion)
    }
  }

  #buildForm(upload: boolean): Promise<FormData> {
    switch (this.#apiVersion) {
      case 'v1':
        return v1.buildForm(this.#data, upload, this.#signal)
      default:
        return assertNeverVersion(this.#apiVersion)
    }
  }

  #parseResult(parsed: unknown): MiQXResult {
    switch (this.#apiVersion) {
      case 'v1':
        return v1.parseResult(parsed)
      default:
        return assertNeverVersion(this.#apiVersion)
    }
  }
}

/**
 * Turns whatever the HTTP layer threw into a `MiQXApiError`, keeping the
 * response body — and its `error_code` — when there is one.
 */
function toApiError(cause: unknown, endpoint: string, prefix: string): MiQXApiError {
  if (cause instanceof HTTPError) {
    const parsedBody = safeJsonParse(cause.body)
    return new MiQXApiError(`${prefix}: HTTP ${cause.response.status}`, {
      endpoint,
      status: cause.response.status,
      body: parsedBody ?? cause.body,
      errorCode: typeof parsedBody?.error_code === 'string' ? parsedBody.error_code : undefined,
      cause,
    })
  }

  if (cause instanceof TimeoutError) {
    return new MiQXApiError(`${prefix}: request timed out`, { endpoint, cause })
  }

  return new MiQXApiError(`${prefix}: ${errorMessage(cause)}`, { endpoint, cause })
}

/**
 * Exhaustiveness check for `ApiVersion`. Extending the union without adding a
 * matching `case` above fails to compile here — `version` stops being `never`
 * the moment a new member is added and not yet handled.
 */
function assertNeverVersion(version: never): never {
  throw new Error(`Unhandled API version: ${version as string}`)
}

function safeJsonParse(text: string): { error_code?: unknown; message?: unknown } | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
