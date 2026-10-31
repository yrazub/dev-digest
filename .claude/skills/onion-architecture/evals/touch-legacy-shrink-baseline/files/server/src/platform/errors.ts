export class AppError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}
export class NotFoundError extends AppError {
  constructor(what: string) { super(`${what} not found`, 404); }
}
export class ExternalServiceError extends AppError {
  constructor(service: string, cause?: unknown) { super(`${service} failed: ${String(cause)}`, 502); }
}
