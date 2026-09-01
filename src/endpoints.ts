export const DEFAULT_BASE_URL = 'https://api.miqx.jp'

/**
 * API versions this package knows how to speak.
 *
 * Only `v1` exists today — see https://miqx.jp/docs. Kept as a union rather
 * than a bare `string` so that adding a future `v2` is a matter of extending
 * this type and `src/v1.ts`'s sibling `src/v2.ts`: every `switch` over
 * `ApiVersion` elsewhere (see `client.ts`) then fails to compile until it
 * handles the new one, rather than silently falling through to v1's.
 */
export type ApiVersion = 'v1'

export const DEFAULT_API_VERSION: ApiVersion = 'v1'
