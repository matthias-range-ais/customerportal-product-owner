import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsDialog from './SettingsDialog.tsx'
import type { SettingsSnapshot } from './settings-types.ts'

function settingsSnapshot(
  overrides: Partial<{
    test: boolean
    prod: boolean
    active: 'test' | 'prod' | null
    activeUsername: string | null
  }> = {},
): SettingsSnapshot {
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

function findCall(fetchMock: ReturnType<typeof vi.fn>, url: string) {
  const call = fetchMock.mock.calls.find(([calledUrl]) => calledUrl === url)
  if (!call) {
    throw new Error(`No fetch call recorded for ${url}`)
  }
  return call
}

describe('SettingsDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <SettingsDialog open settings={settingsSnapshot()} onClose={onClose} onSettingsChange={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on a genuine backdrop click, but not on a click inside the dialog', () => {
    const onClose = vi.fn()
    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={onClose} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(testSection)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('settings-dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the dialog fires its native close event (e.g. via Escape)', () => {
    const onClose = vi.fn()
    render(
      <SettingsDialog open settings={settingsSnapshot()} onClose={onClose} onSettingsChange={vi.fn()} />,
    )

    fireEvent(screen.getByTestId('settings-dialog'), new Event('close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('saves credentials for an environment, shows it as configured, and does not echo the password back', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(settingsSnapshot({ test: true })))
    vi.stubGlobal('fetch', fetchMock)
    const onSettingsChange = vi.fn()

    render(
      <SettingsDialog open settings={settingsSnapshot()} onClose={vi.fn()} onSettingsChange={onSettingsChange} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.change(within(testSection).getByLabelText('Benutzername'), { target: { value: 'alice' } })
    fireEvent.change(within(testSection).getByLabelText('Passwort'), { target: { value: 'secret' } })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Speichern' }))

    expect(await within(testSection).findByText('Zugangsdaten gespeichert.')).toBeInTheDocument()
    expect(within(testSection).getByLabelText('Passwort')).toHaveValue('')
    expect(onSettingsChange).toHaveBeenCalledWith(settingsSnapshot({ test: true }))

    const saveCall = findCall(fetchMock, '/api/settings/credentials')
    expect(JSON.parse(saveCall[1].body)).toEqual({ environment: 'test', username: 'alice', password: 'secret' })
  })

  it('shows a validation message when the server rejects empty credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'MISSING_CREDENTIALS' }, false, 400)))

    render(<SettingsDialog open settings={settingsSnapshot()} onClose={vi.fn()} onSettingsChange={vi.fn()} />)

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Speichern' }))

    expect(await within(testSection).findByText('Bitte Benutzername und Passwort eingeben.')).toBeInTheDocument()
    expect(within(testSection).getByText('Nicht konfiguriert')).toBeInTheDocument()
  })

  it('selects a configured environment as active', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(settingsSnapshot({ test: true, active: 'test', activeUsername: 'alice' })))
    vi.stubGlobal('fetch', fetchMock)
    const onSettingsChange = vi.fn()

    render(
      <SettingsDialog
        open
        settings={settingsSnapshot({ test: true })}
        onClose={vi.fn()}
        onSettingsChange={onSettingsChange}
      />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Als aktive Umgebung auswählen' }))

    // The dialog is controlled by its `settings` prop — reflecting the change in its own UI
    // (e.g. the "Aktiv" badge) is the parent's job once it re-renders with the new snapshot,
    // covered by App's own integration test. Here we only verify the callback fired correctly.
    await vi.waitFor(() => {
      expect(onSettingsChange).toHaveBeenCalledWith(
        settingsSnapshot({ test: true, active: 'test', activeUsername: 'alice' }),
      )
    })
  })

  it('rejects selecting an environment with no stored credentials, with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)))

    render(<SettingsDialog open settings={settingsSnapshot()} onClose={vi.fn()} onSettingsChange={vi.fn()} />)

    const prodSection = screen.getByRole('region', { name: 'Produktion' })
    fireEvent.click(within(prodSection).getByRole('button', { name: 'Als aktive Umgebung auswählen' }))

    expect(
      await screen.findByText('Umgebung "Produktion" ist noch nicht konfiguriert. Bitte zuerst Zugangsdaten speichern.'),
    ).toBeInTheDocument()
  })

  it('does not offer the "Verbindung testen" action for an unconfigured environment', () => {
    render(<SettingsDialog open settings={settingsSnapshot()} onClose={vi.fn()} onSettingsChange={vi.fn()} />)

    const testSection = screen.getByRole('region', { name: 'Test' })
    expect(within(testSection).queryByRole('button', { name: 'Verbindung testen' })).not.toBeInTheDocument()
  })

  it('shows a clear success indicator when the connection check succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(await within(testSection).findByText('Verbindung erfolgreich.')).toBeInTheDocument()
    const checkCall = findCall(fetchMock, '/api/settings/test-connection')
    expect(JSON.parse(checkCall[1].body)).toEqual({ environment: 'test' })
  })

  it('shows the raw EquipmentCloud error when credentials are rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized: bad credentials' }),
      ),
    )

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(
      await within(testSection).findByText('EquipmentCloud-Fehler 401: Unauthorized: bad credentials'),
    ).toBeInTheDocument()
  })

  it('shows an unambiguous fallback message for an http-error with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'http-error', status: 500, body: '' })))

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(await within(testSection).findByText('EquipmentCloud-Fehler 500: (kein Antworttext)')).toBeInTheDocument()
  })

  it('rejects a connection test for a since-unconfigured environment, with a clear message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'NOT_CONFIGURED' }, false, 409)))

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(await within(testSection).findByText('Umgebung "Test" ist nicht konfiguriert.')).toBeInTheDocument()
  })

  it('shows a clear timeout failure, distinct from a credential rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'timeout' })))

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(
      await within(testSection).findByText('Zeitüberschreitung: keine Antwort von EquipmentCloud.'),
    ).toBeInTheDocument()
  })

  it('shows the raw network error message when EquipmentCloud is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND eqcloud-test' })),
    )

    render(
      <SettingsDialog open settings={settingsSnapshot({ test: true })} onClose={vi.fn()} onSettingsChange={vi.fn()} />,
    )

    const testSection = screen.getByRole('region', { name: 'Test' })
    fireEvent.click(within(testSection).getByRole('button', { name: 'Verbindung testen' }))

    expect(
      await within(testSection).findByText('Netzwerkfehler: getaddrinfo ENOTFOUND eqcloud-test'),
    ).toBeInTheDocument()
  })
})
