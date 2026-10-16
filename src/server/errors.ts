export class AppError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export function notFound(what: string): AppError {
  return new AppError(404, `${what} not found`);
}

export function conflict(message: string): AppError {
  return new AppError(409, message);
}
