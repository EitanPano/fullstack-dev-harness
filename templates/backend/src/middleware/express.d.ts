// express.d.ts belongs: the shape of res.locals. Middleware is what writes it (request-id,
// authenticate, validate), so the shape is declared here, once, for every layer that reads it.
import type { Caller } from '../models/auth/type'

declare global {
  namespace Express {
    interface Locals {
      requestId: string
      caller?: Caller
      input?: unknown
    }
  }
}

export {}
