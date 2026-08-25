/** Stable plugin failure with a model-safe diagnostic. */
export class NativeAgentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'NativeAgentError'
  }
}

/** Normalize an arbitrary provider failure without exposing protocol payloads. */
export function asNativeAgentError(
  error: unknown,
  code: string,
  message: string,
): NativeAgentError {
  return error instanceof NativeAgentError
    ? error
    : new NativeAgentError(code, message, { cause: error })
}
