/**
 * Erreur applicative typée. Le code est stable (utilisable côté client comme
 * un code Stripe), le message est humain. On ne fait jamais fuiter de détails
 * internes (stack, réponses brutes du fournisseur) dans `message`.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Clé API manquante ou invalide.'): ApiError {
    return new ApiError(401, 'unauthorized', message);
  }

  static notFound(message = 'Ressource introuvable.'): ApiError {
    return new ApiError(404, 'not_found', message);
  }

  static conflict(code: string, message: string, details?: unknown): ApiError {
    return new ApiError(409, code, message, details);
  }

  static providerError(message: string, details?: unknown): ApiError {
    return new ApiError(502, 'provider_error', message, details);
  }
}
