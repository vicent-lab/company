export class HttpError extends Error {
  status: number;
  details?: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = 'HttpError';
  }
}

export const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<any>) =>
  (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function notFound(req: any, res: any) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(err: any, req: any, res: any, _next: any) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // Postgres 22P02 = "invalid input syntax for type uuid" — happens whenever a route
  // param that's supposed to be a UUID (an :id, a stale/placeholder farmId from a
  // frontend still initializing) gets passed straight into a parameterized query. That's
  // a malformed request, not a server fault, so it belongs on a 400, not a 500.
  if (err?.code === '22P02') {
    return res.status(400).json({ error: 'Invalid id format' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
}
