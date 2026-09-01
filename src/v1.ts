import { MiQXApiError } from './errors'
import type { MiQXResult, QuoteData } from './types'
import { filenameFor, resolveIcon } from './util/icon'

/**
 * The `/v1/make` endpoint — see https://miqx.jp/docs
 *
 * Everything in this file is specific to this one version: the request shape
 * (multipart/form-data with these exact field names) and the response shape
 * (`{ status, message, data: { image, url? } }`, base64 `image`). A future
 * `src/v2.ts` is free to shape both differently — `client.ts` only relies on
 * this module exporting `PATH`, `buildForm()` and `parseResult()`.
 */
export const PATH = '/v1/make'

export async function buildForm(
  data: QuoteData,
  upload: boolean,
  signal: AbortSignal | undefined,
): Promise<FormData> {
  const { text, name, id, mid, icon, param, hideLogo } = data

  const form = new FormData()
  form.set('text', text)
  form.set('name', name)
  form.set('id', id)
  form.set('mid', mid)
  if (param !== null) form.set('param', param)
  if (hideLogo) form.set('hideLogo', 'true')
  if (upload) form.set('upload', 'true')
  if (icon !== null) {
    const blob = await resolveIcon(icon, signal)
    form.set('img', blob, filenameFor(blob))
  }
  return form
}

export function parseResult(parsed: unknown): MiQXResult {
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
        endpoint: PATH,
        body: parsed,
        errorCode: typeof body?.error_code === 'string' ? body.error_code : undefined,
      },
    )
  }

  const image = body.data?.image
  if (typeof image !== 'string' || image.length === 0) {
    throw new MiQXApiError('The API response did not contain image data', {
      endpoint: PATH,
      body: parsed,
    })
  }

  const url = body.data?.url
  return {
    image: Buffer.from(image, 'base64'),
    url: typeof url === 'string' ? url : null,
  }
}
