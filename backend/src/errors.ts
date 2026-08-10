export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = "Resource not found") =>
  new AppError(404, "NOT_FOUND", message);

export const unauthorized = () =>
  new AppError(401, "INVALID_SESSION_TOKEN", "Invalid session token");

export const sessionClosed = () =>
  new AppError(409, "SESSION_CLOSED", "This session has already been submitted");

export const resultsLocked = () =>
  new AppError(423, "RESULTS_LOCKED", "Submit a rating to unlock the results");
