import { MiQError } from '@makeitaquote/utils/errors'
import type { MiQXApiErrorOptions } from './types'

export type { MiQErrorOptions, ValidationErrorOptions } from '@makeitaquote/utils/errors'
export { MiQError, ValidationError } from '@makeitaquote/utils/errors'

/** The MiqX API refused or failed a request. */
export class MiQXApiError extends MiQError {
  readonly status: number | undefined
  readonly body: unknown
  readonly endpoint: string
  /** The API's machine-readable `error_code`, e.g. `VALIDATION_ERROR`, when it sent one. */
  readonly errorCode: string | undefined

  constructor(message: string, options: MiQXApiErrorOptions) {
    super(message, options)
    this.name = 'MiQXApiError'
    this.status = options.status
    this.body = options.body
    this.endpoint = options.endpoint
    this.errorCode = options.errorCode
  }
}
