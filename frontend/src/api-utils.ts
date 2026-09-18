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
