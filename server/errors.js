/** Fehler mit HTTP-Status; die Meldung geht als {error} an den Client. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (message) => new HttpError(400, message);
export const forbidden = (message = 'Keine Berechtigung') => new HttpError(403, message);
export const notFound = (message = 'Nicht gefunden') => new HttpError(404, message);
