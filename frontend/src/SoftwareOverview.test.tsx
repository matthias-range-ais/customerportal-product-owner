import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SoftwareOverview from './SoftwareOverview.tsx'

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

/** Expands every category `<details>` in the rendered overview by clicking its `<summary>`. */
function expandAllCategoryGroups() {
  for (const group of screen.getAllByRole('group')) {
    const summary = group.querySelector('summary')
    if (summary) {
      fireEvent.click(summary)
    }
  }
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

  it('starts with every category collapsed in both tables on load, with nothing pre-expanded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [{ id: 1, name: 'MS Word', category: 'Office', description: '', versions: [] }],
          sets: [
            { id: 2, name: 'Office Set', category: 'Office', state: 'RELEASED', stateLabel: 'Released', updatedOn: '2026-03-01T10:00:00Z' },
          ],
        }),
      ),
    )

    render(<SoftwareOverview activeEnvironment="test" />)
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    // One category group in Software, one in Sets.
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect((group as HTMLDetailsElement).open).toBe(false)
    }
    // Collapsed `<details>` content stays in the DOM (native browser behavior) — assert it's
    // hidden rather than absent.
    expect(screen.getByText('MS Word')).not.toBeVisible()
    expect(screen.getByText('Office Set')).not.toBeVisible()
  })

  it('renders the software and sets tables with live data once their categories are expanded', async () => {
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

    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    expect(screen.getByText('MS Word')).toBeInTheDocument()
    expect(screen.getByText('Office Set')).toBeInTheDocument()
    // Scoped to the table cell — "Released" also appears as an option in the Sets state filter <select>.
    expect(screen.getByRole('cell', { name: 'Released' })).toBeInTheDocument()

    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.getByText('Word processor')).toBeInTheDocument()
    expect(screen.getByText('2016')).toBeInTheDocument()
  })

  it('wraps the Software and Sets tables in the responsive two-column layout container', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [{ id: 1, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [] }],
          sets: [
            { id: 2, name: 'Office Set', category: 'Office', state: 'RELEASED', stateLabel: 'Released', updatedOn: '2026-03-01T10:00:00Z' },
          ],
        }),
      ),
    )

    const { container } = render(<SoftwareOverview activeEnvironment="test" />)
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    const wrapper = container.querySelector('.overview-tables')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelectorAll(':scope > .table-block')).toHaveLength(2)
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

    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()
    expect(screen.getByText('MS Word')).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()
    expect(screen.getByText('MS Word')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'OFFICE' } })

    expect(screen.getByText('MS Word')).toBeInTheDocument()
    expect(screen.queryByText('Firefox')).not.toBeInTheDocument()
  })

  it('matches on description text', async () => {
    renderWithSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'web browser' } })

    expect(screen.getByText('Firefox')).toBeInTheDocument()
    expect(screen.queryByText('MS Word')).not.toBeInTheDocument()
  })

  it('shows a "no matches" placeholder distinct from the "no data" placeholder when the search has no results', async () => {
    renderWithSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'nonexistent' } })

    expect(screen.getByText('Keine Treffer für diese Suche.')).toBeInTheDocument()
    expect(screen.queryByText('Keine Software vorhanden.')).not.toBeInTheDocument()
  })
})

describe('SoftwareOverview — Software category tree and detail expansion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function renderWithCategorizedSoftware() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          software: [
            {
              id: 1,
              name: 'MS Word',
              category: 'Office',
              description: 'Word processor',
              versions: [
                { id: 30, name: '2016' },
                { id: 31, name: '2019' },
              ],
            },
            { id: 2, name: 'MS Excel', category: 'Office', description: '', versions: [] },
            { id: 3, name: 'Firefox', category: 'Browser', description: 'Web browser', versions: [{ id: 40, name: '128' }] },
          ],
          sets: [],
        }),
      ),
    )
    return render(<SoftwareOverview activeEnvironment="test" />)
  }

  it('shows each category collapsed with its filtered item count', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect((group as HTMLDetailsElement).open).toBe(false)
    }

    const summaries = groups.map((group) => group.querySelector('summary')?.textContent ?? '')
    expect(summaries.find((text) => text.startsWith('Browser'))).toContain('(1)')
    expect(summaries.find((text) => text.startsWith('Office'))).toContain('(2)')
  })

  it('updates a category count to the search-filtered count, not the pre-filter total', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    // Narrows Office from 2 items down to 1 (still nonzero) while it stays visible.
    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'MS Word' } })

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('summary')?.textContent).toContain('Office')
    expect(groups[0].querySelector('summary')?.textContent).toContain('(1)')
  })

  it('expanding a category shows only its software names', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    const browserGroup = screen
      .getAllByRole('group')
      .find((group) => group.querySelector('summary')?.textContent?.startsWith('Browser'))!
    fireEvent.click(browserGroup.querySelector('summary')!)

    expect(within(browserGroup).getByText('Firefox')).toBeInTheDocument()
    expect(screen.getByText('MS Word')).not.toBeVisible()
    expect(screen.getByText('MS Excel')).not.toBeVisible()
  })

  it('does not render a category with zero matches after filtering', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })

    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'Firefox' } })

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('summary')?.textContent).toContain('Browser')
  })

  it('expands an inline detail block with the description and comma-joined version names on click', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    // Not shown as a Kategorie/Versionen column, and not visible before the click.
    expect(screen.queryByText('Word processor')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('MS Word'))

    expect(screen.getByText('Word processor')).toBeInTheDocument()
    expect(screen.getByText('2016, 2019')).toBeInTheDocument()
  })

  it('collapses an expanded item detail when the search query changes the visible items', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.getByText('Word processor')).toBeInTheDocument()

    // Narrows the list so MS Word drops out, then widens it again — the detail must not
    // silently resurface once MS Word reappears without being clicked again. Detail visibility
    // is driven by `expandedId`, independent of the category `<details>` open/closed state.
    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: 'Excel' } })
    fireEvent.change(screen.getByLabelText('Software suchen'), { target: { value: '' } })

    expect(screen.queryByText('Word processor')).not.toBeInTheDocument()
  })

  it('collapses an expanded item detail when the active environment changes and reloads the item list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          software: [{ id: 1, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [] }],
          sets: [],
        }),
      )
      .mockResolvedValueOnce(
        // A different environment reusing the same id — EquipmentCloud item ids are not
        // guaranteed distinct across environments.
        jsonResponse({
          software: [{ id: 1, name: 'Notepad', category: 'Office', description: 'Text editor', versions: [] }],
          sets: [],
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(<SoftwareOverview activeEnvironment="test" />)
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()
    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.getByText('Word processor')).toBeInTheDocument()

    rerender(<SoftwareOverview activeEnvironment="prod" />)
    await screen.findByText('Notepad')

    // Detail visibility is driven by `expandedId`, independent of the category `<details>`
    // open/closed state, so this holds regardless of whether the group re-collapsed.
    expect(screen.queryByText('Text editor')).not.toBeInTheDocument()
  })

  it('shows clear placeholders when a software item has no description or versions', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    fireEvent.click(screen.getByText('MS Excel'))

    expect(screen.getByText('Keine Beschreibung vorhanden.')).toBeInTheDocument()
    expect(screen.getByText('Keine Versionen vorhanden.')).toBeInTheDocument()
  })

  it('collapses the previously expanded item when a different item is clicked, expanding only one at a time', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.getByText('Word processor')).toBeInTheDocument()

    fireEvent.click(screen.getByText('MS Excel'))
    expect(screen.queryByText('Word processor')).not.toBeInTheDocument()
    expect(screen.getByText('Keine Beschreibung vorhanden.')).toBeInTheDocument()
  })

  it('collapses the detail block when the already-expanded item is clicked again', async () => {
    renderWithCategorizedSoftware()
    await screen.findByRole('heading', { name: 'Software', level: 3 })
    expandAllCategoryGroups()

    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.getByText('Word processor')).toBeInTheDocument()

    fireEvent.click(screen.getByText('MS Word'))
    expect(screen.queryByText('Word processor')).not.toBeInTheDocument()
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

  it('groups sets by category into collapsed-by-default sections, sorted alphabetically with accurate counts', async () => {
    renderWithSets()
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

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
      expect((group as HTMLDetailsElement).open).toBe(false)
    }
    expect(screen.getByText('Office Base')).not.toBeVisible()

    fireEvent.click(groups[1].querySelector('summary')!)
    expect((groups[1] as HTMLDetailsElement).open).toBe(true)
    expect(within(groups[1]).getByText('Office Base')).toBeInTheDocument()
  })

  it('sorts items within a group by name', async () => {
    renderWithSets()
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

    const groups = screen.getAllByRole('group')
    const officeGroup = groups[1]
    fireEvent.click(officeGroup.querySelector('summary')!)

    const names = within(officeGroup)
      .getAllByRole('row')
      .slice(1) // skip header row
      .map((row) => within(row).getAllByRole('cell')[0].textContent)

    expect(names).toEqual(['Office Base', 'Office Extended'])
  })

  it('filters by search query and release-state filter combined, keeping rows grouped by category', async () => {
    renderWithSets()
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

    fireEvent.change(screen.getByLabelText('Sets suchen'), { target: { value: 'office' } })
    fireEvent.change(screen.getByLabelText('Nach Freigabestatus filtern'), { target: { value: 'DRAFT' } })

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(1)
    expect(groups[0].querySelector('summary')?.textContent).toContain('(1)')

    fireEvent.click(groups[0].querySelector('summary')!)
    expect(within(groups[0]).getByText('Office Extended')).toBeInTheDocument()
    expect(screen.queryByText('Office Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Windows Baseline')).not.toBeInTheDocument()
    expect(screen.queryByText('Misc Tool')).not.toBeInTheDocument()
  })

  it('matches sets by category alone, independent of the name-match branch', async () => {
    renderWithSets()
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

    // "operating" matches Windows Baseline's category ("Operating Systems") but none of the
    // items' names — isolates the category-match branch of matchesSetQuery from name matching.
    fireEvent.change(screen.getByLabelText('Sets suchen'), { target: { value: 'operating' } })

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(1)
    fireEvent.click(groups[0].querySelector('summary')!)

    expect(within(groups[0]).getByText('Windows Baseline')).toBeInTheDocument()
    expect(screen.queryByText('Office Base')).not.toBeInTheDocument()
    expect(screen.queryByText('Office Extended')).not.toBeInTheDocument()
    expect(screen.queryByText('Misc Tool')).not.toBeInTheDocument()
  })

  it('shows a "no matches for these filters" placeholder distinct from the "no data" placeholder', async () => {
    renderWithSets()
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

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
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

    const group = screen.getByRole('group')
    fireEvent.click(group.querySelector('summary')!)

    const expected = new Date('2026-03-01T10:00:00Z').toLocaleDateString('de-DE')
    expect(within(group).getByText(expected)).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'Sets', level: 3 })

    const group = screen.getByRole('group')
    fireEvent.click(group.querySelector('summary')!)

    expect(within(group).getByText('not-a-real-date')).toBeInTheDocument()
    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument()
  })
})
