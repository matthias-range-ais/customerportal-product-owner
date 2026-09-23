// Shared helper for reading a structured `{error: 'CODE'}` body off a failed
// fetch response — used by both App.tsx (settings) and SoftwareOverview.tsx.
export async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json()
    return typeof body?.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

// Mirrors EquipmentCloudFailure (src/adapters/equipmentcloud/equipmentcloud-port.ts) — every
// route that reads live EquipmentCloud data passes this through verbatim. Shared here since
// SoftwareOverview.tsx and EquipmentAssignments.tsx both need the identical type/guard/message.
export type EquipmentCloudFailure =
  | { ok: false; kind: 'http-error'; status: number; body: string }
  | { ok: false; kind: 'network-error'; message: string }
  | { ok: false; kind: 'timeout' }

export function isEquipmentCloudFailure(body: unknown): body is EquipmentCloudFailure {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === false
}

export function failureMessage(failure: EquipmentCloudFailure): string {
  if (failure.kind === 'http-error') {
    return `EquipmentCloud-Fehler ${failure.status}: ${failure.body || '(kein Antworttext)'}`
  }
  if (failure.kind === 'timeout') {
    return 'Zeitüberschreitung: keine Antwort von EquipmentCloud.'
  }
  return `Netzwerkfehler: ${failure.message}`
}

/** Formats an ISO-8601 timestamp for a German audience, falling back to the raw string when unparsable. */
export function formatDate(iso: string): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleDateString('de-DE')
}
