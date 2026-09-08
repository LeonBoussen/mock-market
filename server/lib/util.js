import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Shared curated universe
export const CATALOG = JSON.parse(fs.readFileSync(path.join(root, 'shared/catalog.json'), 'utf8')).items;
export const CATALOG_BY_SYMBOL = new Map(CATALOG.map((i) => [i.s, i]));

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Wraps async route handlers so rejected promises reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function ok(res, data, status = 200) {
  res.status(status).json({ data });
}

export function catalogItem(symbol) {
  const item = CATALOG_BY_SYMBOL.get(symbol);
  if (!item) throw new ApiError(404, 'unknown_symbol', `"${symbol}" is not in the Mock Market universe.`);
  return item;
}

export function assertOwner(profile, userId) {
  if (!profile) throw new ApiError(404, 'not_found', 'Profile not found.');
  if (profile.user_id !== userId) throw new ApiError(403, 'forbidden', 'This profile belongs to another account.');
}
