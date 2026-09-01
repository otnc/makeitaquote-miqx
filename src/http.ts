import { FetchError, ofetch } from 'ofetch'

export interface HttpOptions {
  timeout?: number
  retry?: number
  headers?: Record<string, string>
}

export interface RequestOptions {
  signal?: AbortSignal
  /** Serialized as the request body. */
  json?: unknown
}

export interface HttpClient {
  get(url: string, options?: RequestOptions): Promise<Response>
  post(url: string, options?: RequestOptions): Promise<Response>
  /** GETs `url` and reads the body into a `Buffer` — the shape every asset fetcher needs. */
  getBuffer(url: string, signal?: AbortSignal): Promise<Buffer>
}

/** Thrown for a non-2xx response. */
export class HTTPError extends Error {
  readonly response: Response
  /** The body, already read — the response above is a fresh one built from it, not the original stream. */
  readonly body: string

  constructor(response: Response, body: string) {
    super(`Request failed with status code ${response.status}`)
    this.name = 'HTTPError'
    this.response = response
    this.body = body
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'TimeoutError'
  }
}

/**
 * Shared `ofetch` factory.
 *
 * `MiQX`'s constructor builds one from `timeout` / `retry` / `headers`, so
 * there is only ever one client per instance. A second, header-less one is
 * created on the fly to fetch an icon URL — see `util/icon.ts` — so the API
 * key never reaches whatever third-party host the icon lives on.
 */
export function createClient(options: HttpOptions = {}): HttpClient {
  const instance = ofetch.create({
    timeout: options.timeout ?? 10_000,
    retry: options.retry ?? 2,
    retryStatusCodes: [408, 413, 429, 500, 502, 503, 504],
    // A flat delay, not a growing one — `ofetch` gives `retryDelay` no
    // attempt count to grow it with.
    retryDelay: 300,
    headers: options.headers,
  })

  async function request(
    method: 'GET' | 'POST',
    url: string,
    options: RequestOptions,
  ): Promise<Response> {
    try {
      const raw = await instance.raw(url, {
        method,
        body: options.json as Record<string, unknown> | undefined,
        signal: options.signal,
        // Fetched as bytes regardless of content type, then rebuilt into a
        // real `Response` below — `ofetch` otherwise consumes the body to
        // populate its own parsed `.data`, leaving nothing for a caller to
        // read `.arrayBuffer()`/`.text()`/`.json()` off of afterwards.
        responseType: 'arrayBuffer',
      })
      return toResponse(raw.status, raw.statusText, raw.headers, raw._data as ArrayBuffer)
    } catch (cause) {
      if (isTimeout(cause)) throw new TimeoutError()
      if (cause instanceof FetchError && cause.response) {
        const body = cause.data as ArrayBuffer
        throw new HTTPError(
          toResponse(
            cause.response.status,
            cause.response.statusText,
            cause.response.headers,
            body,
          ),
          new TextDecoder().decode(body),
        )
      }
      throw cause
    }
  }

  const get = (url: string, options: RequestOptions = {}) => request('GET', url, options)

  return {
    get,
    post: (url, options = {}) => request('POST', url, options),
    getBuffer: async (url, signal) => {
      const response = await get(url, signal ? { signal } : {})
      return Buffer.from(await response.arrayBuffer())
    },
  }
}

function toResponse(
  status: number,
  statusText: string,
  headers: Headers,
  body: ArrayBuffer,
): Response {
  return new Response(body, { status, statusText, headers })
}

/** `ofetch` wraps `fetch`'s own abort-on-timeout error rather than raising its own type. */
function isTimeout(cause: unknown): boolean {
  return (
    cause instanceof FetchError &&
    cause.cause instanceof Error &&
    cause.cause.name === 'TimeoutError'
  )
}
