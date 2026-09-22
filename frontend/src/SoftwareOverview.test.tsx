import { fireEvent, render, screen, within } from '@testing-library/react'
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

    render(<SoftwareOverview activeEnvironment={null} />)

    expect(
      await screen.findByText(
        'Keine aktive Umgebung ausgewählt. Bitte über "Einstellungen" zuerst eine Umgebung konfigurieren und als aktiv auswählen.',
      ),
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
          sets: [
            {
              id: 2,
              name: 'Office Set',
              category: 'Office',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: '2026-03-01T10:00:00Z',
            },
          ],
        }),
      ),
    )

    render(<SoftwareOverview activeEnvironment="test" />)

    expect(await screen.findByText('MS Word')).toBeInTheDocument()
    expect(screen.getByText('Word processor')).toBeInTheDocument()
    expect(screen.getByText('2016')).toBeInTheDocument()
    expect(screen.getByText('Office Set')).toBeInTheDocument()
    // Scoped to the table cell — "Released" also appears as an option in the new state filter <select>.
    expect(screen.getByRole('cell', { name: 'Released' })).toBeInTheDocument()
  })

  it('shows a placeholder row when a table has no items', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ software: [], sets: [] })))

    render(<SoftwareOverview activeEnvironment="test" />)

    expect(await screen.findByText('Keine Software vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine Sets vorhanden.')).toBeInTheDocument()
  })

  it('shows the raw EquipmentCloud error, distinct from the connection banner', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' })),
    )

    render(<SoftwareOverview activeEnvironment="test" />)

    expect(await screen.findByText('EquipmentCloud-Fehler 401: Unauthorized')).toBeInTheDocument()
  })

  it('shows a clear timeout failure, distinct from a credential rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'timeout' })))

    render(<SoftwareOverview activeEnvironment="test" />)

    expect(await screen.findByText('Zeitüberschreitung: keine Antwort von EquipmentCloud.')).toBeInTheDocument()
  })

  it('shows a network-error message distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND eqcloud-test' })),
    )

    render(<SoftwareOverview activeEnvironment="test" />)

    const overview = await screen.findByRole('region', { name: 'SoftwareCenter-Übersicht' })
    expect(within(overview).getByText('Netzwerkfehler: getaddrinfo ENOTFOUND eqcloud-test')).toBeInTheDocument()
  })

  it('refetches when the active environment changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409))
      .mockResolvedValueOnce(
        jsonResponse({
          software: [{ id: 1, name: 'MS Word', category: 'Office', description: '', versions: [] }],
          sets: [],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<SoftwareOverview activeEnvironment={null} />)
    await screen.findByText(/Keine aktive Umgebung ausgewählt/)

    rerender(<SoftwareOverview activeEnvironment="test" />)

    expect(await screen.findByText('MS Word')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('SoftwareOverview — Software search', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderWithSoftware() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [
            { id: 1, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [] },
            { id: 2, name: 'Firefox', category: 'Browser', description: 'Web browser', versions: [] },
          ],
          sets: [],
        }),
      ),
    )
    return render(<SoftwareOverview activeEnvironment="test" />)
  }

  it('filters rows to items whose name, category, or description matches the query (case-insensitive)', async () => {
    renderWithSoftware()
    await screen.findByText('MS Word')

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'OFFICE' } })

    expect(screen.getByText('MS Word')).toBeInTheDocument()
    expect(screen.queryByText('Firefox')).not.toBeInTheDocument()
  })

  it('matches on description text', async () => {
    renderWithSoftware()
    await screen.findByText('MS Word')

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'web browser' } })

    expect(screen.getByText('Firefox')).toBeInTheDocument()
    expect(screen.queryByText('MS Word')).not.toBeInTheDocument()
  })

  it('shows a "no matches" placeholder distinct from the "no data" placeholder when the search has no results', async () => {
    renderWithSoftware()
    await screen.findByText('MS Word')

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'nonexistent' } })

    expect(screen.getByText('Keine Treffer für diese Suche.')).toBeInTheDocument()
    expect(screen.queryByText('Keine Software vorhanden.')).not.toBeInTheDocument()
  })
})

describe('SoftwareOverview — Sets search, state filter, and grouping', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderWithSets() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [],
          sets: [
            {
              id: 2,
              name: 'Office Extended',
              category: 'Office',
              state: 'DRAFT',
              stateLabel: 'Entwurf',
              updatedOn: '2026-02-15T08:30:00Z',
            },
            {
              id: 1,
              name: 'Office Base',
              category: 'Office',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: '2026-03-01T10:00:00Z',
            },
            {
              id: 3,
              name: 'Windows Baseline',
              category: 'Operating Systems',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: '2026-01-10T00:00:00Z',
            },
            {
              id: 4,
              name: 'Misc Tool',
              category: '',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      ),
    )
    return render(<SoftwareOverview activeEnvironment="test" />)
  }

  it('groups sets by category into open-by-default sections, sorted alphabetically with accurate counts', async () => {
    renderWithSets()
    await screen.findByText('Office Base')

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(3)

    // Sorted alphabetically: '' (Ohne Kategorie) < 'Office' < 'Operating Systems'
    const summaries = groups.map((group) => group.querySelector('summary')?.textContent ?? '')
    expect(summaries[0]).toContain('Ohne Kategorie')
    expect(summaries[0]).toContain('(1)')
    expect(summaries[1]).toContain('Office')
    expect(summaries[1]).toContain('(2)')
    expect(summaries[2]).toContain('Operating Systems')
    expect(summaries[2]).toContain('(1)')

    for (const group of groups) {
      expect((group as HTMLDetailsElement).open).toBe(true)
    }
  })

  it('sorts items within a group by name', async () => {
    renderWithSets()
    await screen.findByText('Office Base')

    const groups = screen.getAllByRole('group')
    const officeGroup = groups[1]
    const names = within(officeGroup)
      .getAllByRole('row')
      .slice(1) // skip header row
      .map((row) => within(row).getAllByRole('cell')[0].textContent)

    expect(names).toEqual(['Office Base', 'Office Extended'])
  })

  it('filters by search query and release-state filter combined, keeping rows grouped by category', async () => {
    renderWithSets()
    await screen.findByText('Office Base')

    fireEvent.change(screen.getByLabelText('Sets suchen'), { target: { value: 'office' } })
    fireEvent.change(screen.getByLabelText('Nach Freigabestatus filtern'), { target: { value: 'DRAFT' } })

    expect(screen.getByText('Office Extended')).toBeInTheDocument()
    expect(screen.queryByText('Office Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Windows Baseline')).not.toBeInTheDocument()
    expect(screen.queryByText('Misc Tool')).not.toBeInTheDocument()

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('summary')?.textContent).toContain('(1)')
  })

  it('matches sets by category alone, independent of the name-match branch', async () => {
    renderWithSets()
    await screen.findByText('Office Base')

    // "operating" matches Windows Baseline's category ("Operating Systems") but none of the
    // items' names — isolates the category-match branch of matchesSetQuery from name matching.
    fireEvent.change(screen.getByLabelText('Sets suchen'), { target: { value: 'operating' } })

    expect(screen.getByText('Windows Baseline')).toBeInTheDocument()
    expect(screen.queryByText('Office Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Office Extended')).not.toBeInTheDocument()
    expect(screen.queryByText('Misc Tool')).not.toBeInTheDocument()
  })

  it('shows a "no matches for these filters" placeholder distinct from the "no data" placeholder', async () => {
    renderWithSets()
    await screen.findByText('Office Base')

    fireEvent.change(screen.getByLabelText('Sets suchen'), { target: { value: 'nonexistent-set-name' } })

    expect(screen.getByText('Keine Treffer für diese Filter.')).toBeInTheDocument()
    expect(screen.queryByText('Keine Sets vorhanden.')).not.toBeInTheDocument()
  })
})

describe('SoftwareOverview — Sets "Datum" column', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('formats a valid updated_on ISO date for a German audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [],
          sets: [
            {
              id: 1,
              name: 'Office Base',
              category: 'Office',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: '2026-03-01T10:00:00Z',
            },
          ],
        }),
      ),
    )

    render(<SoftwareOverview activeEnvironment="test" />)
    await screen.findByText('Office Base')

    const expected = new Date('2026-03-01T10:00:00Z').toLocaleDateString('de-DE')
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('falls back to the raw string instead of "Invalid Date" when updated_on cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [],
          sets: [
            {
              id: 1,
              name: 'Broken Date Set',
              category: 'Office',
              state: 'RELEASED',
              stateLabel: 'Released',
              updatedOn: 'not-a-real-date',
            },
          ],
        }),
      ),
    )

    render(<SoftwareOverview activeEnvironment="test" />)
    await screen.findByText('Broken Date Set')

    expect(screen.getByText('not-a-real-date')).toBeInTheDocument()
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument()
  })
})
