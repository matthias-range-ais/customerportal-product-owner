// Treats an unset OR empty-string env var the same way — `??` alone would let
// e.g. `HOST=""` slip through and bind to all interfaces instead of localhost.
export function envOrDefault(value: string | undefined, fallback: string): string {
  return value && value.trim() !== '' ? value : fallback;
}
