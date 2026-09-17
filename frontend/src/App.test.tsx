import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

function settingsSnapshot(overrides: Partial<{ test: boolean; prod: boolean; active: 'test' | 'prod' | null }> = {}) {
  const { test = false, prod = false, active = null } = overrides
  return {
    environments: { test: { configured: test }, prod: { configured: prod } },
    active,
  }
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => body } as Response
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows both environments as not configured and no active environment on first launch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(settingsSnapshot())),
    )

    render(<App />)

    expect(await screen.findAllByText('Nicht konfiguriert')).toHaveLength(2)
    expect(screen.getByTestId('active-environment')).toHaveTextContent('Aktive Umgebung: keine')
  })

  it('saves credentials for an environment, shows it as configured, and does not echo the password back', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot()))
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot({ test: true })))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findAllByText('Nicht konfiguriert')

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.change(within(testSection).getByLabelText('Benutzername'), { target: { value: 'alice' } })
    fireEvent.change(within(testSection).getByLabelText('Passwort'), { target: { value: 'secret' } })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Speichern' }))

    expect(await within(testSection).findByText('Zugangsdaten gespeichert.')).toBeInTheDocument()
    expect(within(testSection).getByText(/Konfiguriert/)).toBeInTheDocument()
    expect(within(testSection).getByLabelText('Passwort')).toHaveValue('')

    const [, saveCall] = fetchMock.mock.calls
    expect(saveCall[0]).toBe('/api/settings/credentials')
    expect(JSON.parse(saveCall[1].body)).toEqual({ environment: 'test', username: 'alice', password: 'secret' })
  })

  it('shows a validation message and does not update state when the server rejects empty credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot()))
      .mockResolvedValueOnce(jsonResponse({ error: 'MISSING_CREDENTIALS' }, false, 400))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    await screen.findAllByText('Nicht konfiguriert')

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Speichern' }))

    expect(await within(testSection).findByText('Bitte Benutzername und Passwort eingeben.')).toBeInTheDocument()
    expect(within(testSection).getByText('Nicht konfiguriert')).toBeInTheDocument()
  })

  it('selects a configured environment as active and shows it clearly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot({ test: true })))
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot({ test: true, active: 'test' })))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const testSection = await screen.findByRole('region', { name: 'Test' })

    fireEvent.click(within(testSection).getByRole('button', { name: 'Als aktive Umgebung auswählen' }))

    await within(testSection).findByText(/Aktiv/)
    expect(screen.getByTestId('active-environment')).toHaveTextContent('Aktive Umgebung: Test')
  })

  it('rejects selecting an environment with no stored credentials, with a clear message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(settingsSnapshot()))
      .mockResolvedValueOnce(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const prodSection = await screen.findByRole('region', { name: 'Produktion' })

    fireEvent.click(within(prodSection).getByRole('button', { name: 'Als aktive Umgebung auswählen' }))

    expect(
      await screen.findByText(
        'Umgebung "Produktion" ist noch nicht konfiguriert. Bitte zuerst Zugangsdaten speichern.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('active-environment')).toHaveTextContent('Aktive Umgebung: keine')
  })
})
