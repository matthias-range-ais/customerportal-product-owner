import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SoftwareOverview from './SoftwareOverview.tsx'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

describe('SoftwareOverview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a hint instead of a table when no environment is active', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)))

    render(<SoftwareOverview />)

    expect(
      await screen.findByText('Keine aktive Umgebung ausgewählt. Bitte zuerst eine Umgebung konfigurieren und als aktiv auswählen.'),
    ).toBeInTheDocument()
  })

  it('renders the software and sets tables with live data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [
            { id: 1, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [{ id: 30, name: '2016' }] },
          ],
          sets: [{ id: 2, name: 'Office Set', category: 'Office', state: 'RELEASED', stateLabel: 'Released' }],
        }),
      ),
    )

    render(<SoftwareOverview />)

    expect(await screen.findByText('MS Word')).toBeInTheDocument()
    expect(screen.getByText('Word processor')).toBeInTheDocument()
    expect(screen.getByText('2016')).toBeInTheDocument()
    expect(screen.getByText('Office Set')).toBeInTheDocument()
    expect(screen.getByText('Released')).toBeInTheDocument()
  })

  it('shows a placeholder row when a table has no items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ software: [], sets: [] })))

    render(<SoftwareOverview />)

    expect(await screen.findByText('Keine Software vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine Sets vorhanden.')).toBeInTheDocument()
  })

  it('shows the raw EquipmentCloud error, distinct from the connection banner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' })),
    )

    render(<SoftwareOverview />)

    expect(await screen.findByText('EquipmentCloud-Fehler 401: Unauthorized')).toBeInTheDocument()
  })

  it('shows a clear timeout failure, distinct from a credential rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'timeout' })))

    render(<SoftwareOverview />)

    expect(await screen.findByText('Zeitüberschreitung: keine Antwort von EquipmentCloud.')).toBeInTheDocument()
  })

  it('shows a network-error message distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND eqcloud-test' })),
    )

    render(<SoftwareOverview />)

    const overview = await screen.findByRole('region', { name: 'SoftwareCenter-Übersicht' })
    expect(within(overview).getByText('Netzwerkfehler: getaddrinfo ENOTFOUND eqcloud-test')).toBeInTheDocument()
  })
})
