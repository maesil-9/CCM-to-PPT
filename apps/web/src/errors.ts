/** HTTP-mapped domain errors so the server returns meaningful status codes. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const notFound = (message: string) => new HttpError(404, message);
export const badRequest = (message: string) => new HttpError(400, message);
export const unprocessable = (message: string) => new HttpError(422, message);
export const payloadTooLarge = (message: string) => new HttpError(413, message);
