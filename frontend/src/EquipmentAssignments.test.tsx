import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EquipmentAssignments from './EquipmentAssignments.tsx'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

const EQUIPMENT_LIST = {
  ok: true,
  items: [
    { id: 'HPC0815', name: 'Router 1', equipmentType: 'Router' },
    { id: 'HPC0816', name: 'Fräsmaschine 2', equipmentType: 'Fräsmaschine' },
  ],
}

describe('EquipmentAssignments', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a hint instead of the search list when no environment is active', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment={null} />)

    expect(
      await screen.findByText(
        'Keine aktive Umgebung ausgewählt. Bitte über "Einstellungen" zuerst eine Umgebung konfigurieren und als aktiv auswählen.',
      ),
    ).toBeInTheDocument()
  })

  it('renders the fetched equipment list and filters it client-side by name or id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(EQUIPMENT_LIST)))

    render(<EquipmentAssignments activeEnvironment="test" />)

    expect(await screen.findByText('Router 1')).toBeInTheDocument()
    expect(screen.getByText('Fräsmaschine 2')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Ausrüstung suchen'), { target: { value: 'HPC0816' } })

    expect(screen.queryByText('Router 1')).not.toBeInTheDocument()
    expect(screen.getByText('Fräsmaschine 2')).toBeInTheDocument()
  })

  it('shows a "no matches" placeholder when the search has no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(EQUIPMENT_LIST)))

    render(<EquipmentAssignments activeEnvironment="test" />)
    await screen.findByText('Router 1')

    fireEvent.change(screen.getByLabelText('Ausrüstung suchen'), { target: { value: 'does-not-exist' } })

    expect(screen.getByText('Keine Treffer für diese Suche.')).toBeInTheDocument()
  })

  it('selecting equipment fetches and shows its installed software and assigned sets, replacing the search list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            installed: [
              { softwareId: 1, software: 'MS Word', category: 'Office', versionId: 30, version: '2016', installedOn: '2026-01-10T09:00:00Z' },
            ],
            sets: [{ id: 2, name: 'Office Set', state: 'RELEASED', stateLabel: 'Freigegeben', updatedOn: '2026-03-01T10:00:00Z' }],
          }),
        )
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))

    expect(await screen.findByText('MS Word')).toBeInTheDocument()
    expect(screen.getByText('Office Set')).toBeInTheDocument()
    expect(screen.getByText('Freigegeben')).toBeInTheDocument()
    // Search list is replaced — the other equipment item is no longer shown.
    expect(screen.queryByText('Fräsmaschine 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Andere Auswahl' })).toBeInTheDocument()
  })

  it('returns to the search list without refetching it when "Andere Auswahl" is clicked', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        return Promise.resolve(jsonResponse({ ok: true, installed: [], sets: [] }))
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))
    await screen.findByRole('button', { name: 'Andere Auswahl' })

    const listCallsBeforeReturn = fetchMock.mock.calls.filter(([url]) => url === '/api/equipment').length

    fireEvent.click(screen.getByRole('button', { name: 'Andere Auswahl' }))

    expect(await screen.findByText('Fräsmaschine 2')).toBeInTheDocument()
    const listCallsAfterReturn = fetchMock.mock.calls.filter(([url]) => url === '/api/equipment').length
    expect(listCallsAfterReturn).toBe(listCallsBeforeReturn)
  })

  it('clears the selection and returns to the search list when the active environment changes', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        // Never resolves within this test — simulates a stale in-flight request that must not
        // be allowed to land after the environment switch below.
        return new Promise(() => {})
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))
    await screen.findByRole('button', { name: 'Andere Auswahl' })

    rerender(<EquipmentAssignments activeEnvironment="prod" />)

    expect(await screen.findByText('Router 1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Andere Auswahl' })).not.toBeInTheDocument()
  })

  it('shows distinct empty-state placeholders when nothing is installed/assigned', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        return Promise.resolve(jsonResponse({ ok: true, installed: [], sets: [] }))
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))

    expect(await screen.findByText('Keine installierte Software vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine zugewiesenen Sets vorhanden.')).toBeInTheDocument()
  })

  it('shows the raw EquipmentCloud error banner when the equipment list call is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' })))

    render(<EquipmentAssignments activeEnvironment="test" />)

    expect(await screen.findByText('EquipmentCloud-Fehler 401: Unauthorized')).toBeInTheDocument()
  })

  it('shows a distinct timeout message when the assignments call times out', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        return Promise.resolve(jsonResponse({ ok: false, kind: 'timeout' }))
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))

    expect(await screen.findByText('Zeitüberschreitung: keine Antwort von EquipmentCloud.')).toBeInTheDocument()
  })

  it('shows the not-configured hint (not a generic error) when the assignments call itself returns NOT_CONFIGURED', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        // The environment's credentials became unresolvable after the (already-loaded) equipment
        // list was fetched — createEquipmentCloudClient's null-client branch, distinct from a
        // generic load failure.
        return Promise.resolve(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409))
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))

    expect(
      await screen.findByText(
        'Keine aktive Umgebung ausgewählt. Bitte über "Einstellungen" zuerst eine Umgebung konfigurieren und als aktiv auswählen.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Zuordnungen konnten nicht geladen werden.')).not.toBeInTheDocument()
  })

  it('renders the installed-software table with the expected columns', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/equipment') {
        return Promise.resolve(jsonResponse(EQUIPMENT_LIST))
      }
      if (url === '/api/equipment/HPC0815/assignments') {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            installed: [
              { softwareId: 1, software: 'MS Word', category: 'Office', versionId: 30, version: '2016', installedOn: '2026-01-10T09:00:00Z' },
            ],
            sets: [],
          }),
        )
      }
      throw new Error(`unexpected fetch to ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EquipmentAssignments activeEnvironment="test" />)
    fireEvent.click(await screen.findByText('Router 1'))
    await screen.findByText('MS Word')

    const row = screen.getByText('MS Word').closest('tr')!
    expect(within(row).getByText('Office')).toBeInTheDocument()
    expect(within(row).getByText('2016')).toBeInTheDocument()
    expect(within(row).getByText(new Date('2026-01-10T09:00:00Z').toLocaleDateString('de-DE'))).toBeInTheDocument()
  })
})
