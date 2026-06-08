import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

export function generateRequestId() {
  return randomUUID();
}

export function extractRequestId(headers, options = {}) {
  const raw = headers.get(REQUEST_ID_HEADER);
  if (raw) return raw;

  for (const [key] of headers) {
    if (key.toLowerCase() === REQUEST_ID_HEADER) {
      return headers.get(key);
    }
  }

  if (options.generateIfMissing) {
    const id = generateRequestId();
    headers.set(REQUEST_ID_HEADER, id);
    return id;
  }

  return null;
}
