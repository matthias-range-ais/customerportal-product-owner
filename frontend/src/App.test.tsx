import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

function settingsSnapshot(
  overrides: Partial<{
    test: boolean
    prod: boolean
    active: 'test' | 'prod' | null
    activeUsername: string | null
  }> = {},
) {
  const { test = false, prod = false, active = null, activeUsername = null } = overrides
  return {
    environments: { test: { configured: test }, prod: { configured: prod } },
    active,
    activeUsername,
  }
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

// Not-configured is the harmless default for the SoftwareOverview section's own
// GET /api/software call, mounted alongside the settings dialog — most tests here
// don't care about it, they just need it not to desync the ordered per-URL queues below.
const softwareNotConfigured = () => jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)

/**
 * Routes each `fetch(url, init)` call to a per-"METHOD URL" queue of canned responses,
 * consumed in order. Needed because App mounts <SoftwareOverview/>, whose own GET
 * /api/software fires concurrently with App's GET /api/settings (child effects run before
 * the parent's), so a single flat `mockResolvedValueOnce` chain can't assume a fixed order.
 */
function mockFetchRoutes(routes: Record<string, Response[]>) {
  const queues = new Map(Object.entries(routes).map(([key, responses]) => [key, [...responses]]))
  return vi.fn((url: string, init?: { method?: string }) => {
    const key = `${init?.method ?? 'GET'} ${url}`
    const queue = queues.get(key)
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected fetch call: ${key}`)
    }
    return Promise.resolve(queue.shift()!)
  })
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads settings and shows no active environment on first launch', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse(settingsSnapshot())],
        'GET /api/software': [softwareNotConfigured()],
      }),
    )

    render(<App />)

    expect(await screen.findByTestId('active-environment')).toHaveTextContent('Aktive Umgebung: keine')
  })

  it('shows a load error banner when settings fail to load', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse({}, false, 500)],
        'GET /api/software': [softwareNotConfigured()],
      }),
    )

    render(<App />)

    expect(await screen.findByText('Einstellungen konnten nicht geladen werden.')).toBeInTheDocument()
  })

  it('opens the settings dialog via the header button and closes it via its close button', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse(settingsSnapshot())],
        'GET /api/software': [softwareNotConfigured()],
      }),
    )

    render(<App />)
    await screen.findByTestId('active-environment')

    // getByRole would filter this out as hidden while closed (jsdom applies the UA
    // `dialog:not([open]) { display: none }` rule), so use the test id instead.
    const dialog = screen.getByTestId('settings-dialog')
    expect(dialog).not.toHaveAttribute('open')

    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))
    expect(dialog).toHaveAttribute('open')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }))
    expect(dialog).not.toHaveAttribute('open')
  })

  it('mounts the SoftwareCenter overview section', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse(settingsSnapshot())],
        'GET /api/software': [softwareNotConfigured()],
        'GET /api/equipment': [jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)],
      }),
    )

    render(<App />)

    expect(await screen.findByRole('region', { name: 'SoftwareCenter-Übersicht' })).toBeInTheDocument()
  })

  it('mounts the Equipment Assignments section', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse(settingsSnapshot())],
        'GET /api/software': [softwareNotConfigured()],
        'GET /api/equipment': [jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)],
      }),
    )

    render(<App />)

    expect(
      await screen.findByRole('region', { name: 'Kundenausrüstung & aktuelle Zuordnungen' }),
    ).toBeInTheDocument()
  })

  it('updates the header once an environment is selected as active in the settings dialog', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchRoutes({
        'GET /api/settings': [jsonResponse(settingsSnapshot({ test: true }))],
        // Two responses: the initial mount fetch, plus the refetch `SoftwareOverview` triggers
        // once `activeEnvironment` changes after the environment switch below.
        'GET /api/software': [softwareNotConfigured(), softwareNotConfigured()],
        'POST /api/settings/active-environment': [
          jsonResponse(settingsSnapshot({ test: true, active: 'test', activeUsername: 'alice' })),
        ],
      }),
    )

    render(<App />)
    await screen.findByTestId('active-environment')
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }))

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Als aktive Umgebung auswählen' }))

    await within(testSection).findByText(/Aktiv/)
    expect(screen.getByTestId('active-environment')).toHaveTextContent('Aktive Umgebung: Test (alice)')
  })
})
