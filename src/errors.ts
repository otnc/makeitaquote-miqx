import type { MiQXApiErrorOptions } from './types'

export interface MiQErrorOptions {
  cause?: unknown
}

/** Base class for everything this package throws. */
export class MiQError extends Error {
  constructor(message: string, options?: MiQErrorOptions) {
    super(message, options)
    this.name = 'MiQError'
  }
}

export interface ValidationErrorOptions extends MiQErrorOptions {
  /** Which input field was rejected, e.g. `'text'`. */
  field?: string
}

/** An input failed a type, format or length check. */
export class ValidationError extends MiQError {
  readonly field: string | undefined

  constructor(message: string, options?: ValidationErrorOptions) {
    super(message, options)
    this.name = 'ValidationError'
    this.field = options?.field
  }
}

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
