/** An error the API turns into a clean response: a status code, a stable code for programs, and a message for people. */
export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export const notFound = (what: string) => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (code: string, msg: string) => new HttpError(409, code, msg);
export const badRequest = (code: string, msg: string) => new HttpError(400, code, msg);
export const forbidden = (msg = "You do not have permission to do that") => new HttpError(403, "forbidden", msg);
