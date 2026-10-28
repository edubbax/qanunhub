// Errors carry a stable code for the client and an Azerbaijani message for the learner.

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'PREMIUM_REQUIRED'
  | 'HEARTS_LOCKED'
  | 'LESSON_LOCKED'
  | 'FINAL_LOCKED'
  | 'FINAL_COOLDOWN'
  | 'NO_CATEGORY'
  | 'NOTHING_TO_REVIEW'
  | 'SESSION_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'CATEGORY_CHANGE_LIMIT'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  PREMIUM_REQUIRED: 402,
  HEARTS_LOCKED: 423,
  LESSON_LOCKED: 423,
  FINAL_LOCKED: 423,
  FINAL_COOLDOWN: 429,
  NO_CATEGORY: 409,
  NOTHING_TO_REVIEW: 409,
  SESSION_CLOSED: 409,
  ALREADY_ANSWERED: 409,
  CATEGORY_CHANGE_LIMIT: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly data?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.data = data;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError || (typeof e === 'object' && e !== null && 'code' in e && 'status' in e);
}
