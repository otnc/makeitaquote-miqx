import { errorMessage } from '@makeitaquote/utils/errors'
import { createClient, HTTPError, TimeoutError } from '@makeitaquote/utils/http'
import { ValidationError } from '../errors'
import type { AvatarSource } from '../types'

/**
 * Turns any accepted icon source into a `Blob` the multipart body can carry.
 *
 * A string or `URL` is fetched through its own bare client, deliberately
 * unauthenticated — the `Authorization` header must never reach whatever
 * third-party host the icon happens to live on (Discord's CDN, X's, a
 * Misskey instance's).
 */
export async function resolveIcon(icon: AvatarSource, signal?: AbortSignal): Promise<Blob> {
  if (icon instanceof Blob) return icon
  // Buffer is a Uint8Array subclass, so this covers both.
  if (icon instanceof Uint8Array) return new Blob([icon])
  if (typeof icon === 'string' || icon instanceof URL) return fetchIcon(String(icon), signal)

  throw new ValidationError('icon must be a string, URL, Buffer, Uint8Array or Blob', {
    field: 'icon',
  })
}

/** The API keys the icon's format off the multipart filename, so this must match the bytes. */
export function filenameFor(blob: Blob): string {
  return blob.type === 'image/jpeg' || blob.type === 'image/jpg' ? 'icon.jpg' : 'icon.png'
}

async function fetchIcon(url: string, signal?: AbortSignal): Promise<Blob> {
  const client = createClient({ timeout: 15_000, retry: 1 })

  let response: Response
  try {
    response = await client.get(url, signal ? { signal } : {})
  } catch (cause) {
    if (cause instanceof HTTPError) {
      throw new ValidationError(`Failed to fetch icon from ${url}: HTTP ${cause.response.status}`, {
        field: 'icon',
        cause,
      })
    }
    if (cause instanceof TimeoutError) {
      throw new ValidationError(`Failed to fetch icon from ${url}: request timed out`, {
        field: 'icon',
        cause,
      })
    }
    throw new ValidationError(`Failed to fetch icon from ${url}: ${errorMessage(cause)}`, {
      field: 'icon',
      cause,
    })
  }

  const type = response.headers.get('content-type')
  const bytes = await response.arrayBuffer()
  return new Blob([bytes], type ? { type } : {})
}
