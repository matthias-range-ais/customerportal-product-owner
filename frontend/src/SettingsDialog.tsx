import { useEffect, useRef, useState, type FormEvent } from 'react'
import { readErrorCode } from './api-utils.ts'
import { ENVIRONMENTS, ENVIRONMENT_LABELS, type Environment, type SettingsSnapshot } from './settings-types.ts'

type ConnectionCheckResult =
  | { ok: true }
  | { ok: false; kind: 'http-error'; status: number; body: string }
  | { ok: false; kind: 'network-error'; message: string }
  | { ok: false; kind: 'timeout' }

type TestConnectionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

const idleTestConnection: Record<Environment, TestConnectionState> = {
  test: { status: 'idle' },
  prod: { status: 'idle' },
}

type CredentialsForm = { username: string; password: string }

const emptyForms: Record<Environment, CredentialsForm> = {
  test: { username: '', password: '' },
  prod: { username: '', password: '' },
}

interface SettingsDialogProps {
  open: boolean
  settings: SettingsSnapshot | null
  onClose: () => void
  onSettingsChange: (settings: SettingsSnapshot) => void
}

function SettingsDialog({ open, settings, onClose, onSettingsChange }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [forms, setForms] = useState(emptyForms)
  const [formErrors, setFormErrors] = useState<Record<Environment, string | null>>({ test: null, prod: null })
  const [formSuccess, setFormSuccess] = useState<Record<Environment, string | null>>({ test: null, prod: null })
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [testConnection, setTestConnection] = useState<Record<Environment, TestConnectionState>>(idleTestConnection)
  const [isSwitchingActive, setIsSwitchingActive] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    // jsdom (used by the test suite) doesn't implement showModal()/close(), so fall back to
    // toggling the `open` attribute directly there — real browsers always take the modal path.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal()
      } else {
        dialog.open = true
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.open = false
      }
    }

    // Reset all transient form/status state whenever the dialog closes, so a stale
    // success/error banner or half-typed password never reappears on reopen.
    if (!open) {
      setForms(emptyForms)
      setFormErrors({ test: null, prod: null })
      setFormSuccess({ test: null, prod: null })
      setSwitchError(null)
      setTestConnection(idleTestConnection)
      setIsSwitchingActive(false)
    }
  }, [open])

  // Native `.close()` fires the `close` event (wired to `onClose` below), so it alone drives
  // `onClose` for the close button — calling `onClose` directly here too would fire it twice.
  // jsdom doesn't implement `.close()` (see the effect above), so fall back to calling
  // `onClose` directly there, exactly once.
  function requestClose() {
    const dialog = dialogRef.current
    if (dialog && typeof dialog.close === 'function') {
      dialog.close()
    } else {
      onClose()
    }
  }

  function updateForm(environment: Environment, field: keyof CredentialsForm, value: string) {
    setForms((prev) => ({ ...prev, [environment]: { ...prev[environment], [field]: value } }))
  }

  async function handleSave(environment: Environment, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormErrors((prev) => ({ ...prev, [environment]: null }))
    setFormSuccess((prev) => ({ ...prev, [environment]: null }))

    const { username, password } = forms[environment]

    try {
      const response = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, username, password }),
      })

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        setFormErrors((prev) => ({
          ...prev,
          [environment]:
            errorCode === 'MISSING_CREDENTIALS'
              ? 'Bitte Benutzername und Passwort eingeben.'
              : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
        }))
        return
      }

      const data = (await response.json()) as SettingsSnapshot
      onSettingsChange(data)
      setForms((prev) => ({ ...prev, [environment]: { ...prev[environment], password: '' } }))
      setFormSuccess((prev) => ({ ...prev, [environment]: 'Zugangsdaten gespeichert.' }))
    } catch {
      setFormErrors((prev) => ({ ...prev, [environment]: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' }))
    }
  }

  async function handleSelectActive(environment: Environment) {
    setSwitchError(null)
    setIsSwitchingActive(true)

    try {
      const response = await fetch('/api/settings/active-environment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      })

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        setSwitchError(
          errorCode === 'NOT_CONFIGURED'
            ? `Umgebung "${ENVIRONMENT_LABELS[environment]}" ist noch nicht konfiguriert. Bitte zuerst Zugangsdaten speichern.`
            : 'Umgebung konnte nicht gewechselt werden. Bitte erneut versuchen.',
        )
        return
      }

      const data = (await response.json()) as SettingsSnapshot
      onSettingsChange(data)
    } catch {
      setSwitchError('Umgebung konnte nicht gewechselt werden. Bitte erneut versuchen.')
    } finally {
      setIsSwitchingActive(false)
    }
  }

  async function handleTestConnection(environment: Environment) {
    setTestConnection((prev) => ({ ...prev, [environment]: { status: 'loading' } }))

    try {
      const response = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      })

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        setTestConnection((prev) => ({
          ...prev,
          [environment]: {
            status: 'error',
            message:
              errorCode === 'NOT_CONFIGURED'
                ? `Umgebung "${ENVIRONMENT_LABELS[environment]}" ist nicht konfiguriert.`
                : 'Verbindungstest fehlgeschlagen. Bitte erneut versuchen.',
          },
        }))
        return
      }

      const result = (await response.json()) as ConnectionCheckResult

      if (result.ok) {
        setTestConnection((prev) => ({ ...prev, [environment]: { status: 'success' } }))
        return
      }

      const message =
        result.kind === 'http-error'
          ? `EquipmentCloud-Fehler ${result.status}: ${result.body || '(kein Antworttext)'}`
          : result.kind === 'timeout'
            ? 'Zeitüberschreitung: keine Antwort von EquipmentCloud.'
            : `Netzwerkfehler: ${result.message}`

      setTestConnection((prev) => ({ ...prev, [environment]: { status: 'error', message } }))
    } catch {
      setTestConnection((prev) => ({
        ...prev,
        [environment]: { status: 'error', message: 'Verbindungstest fehlgeschlagen. Bitte erneut versuchen.' },
      }))
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-label="Einstellungen"
      data-testid="settings-dialog"
      onClose={onClose}
      onClick={(event) => {
        // The dialog's own box has no padding (see `.dialog-content` below, which carries it
        // instead) — so a click landing directly on the dialog element (rather than bubbling up
        // from `.dialog-content` or one of its descendants) can only be a genuine backdrop click,
        // never a click inside the visible padded area.
        if (event.target === dialogRef.current) {
          onClose()
        }
      }}
    >
      <div className="dialog-content">
        <div className="dialog-header">
          <h2>Einstellungen</h2>
          <button type="button" className="button--secondary dialog-close" onClick={requestClose} aria-label="Schließen">
            Schließen
          </button>
        </div>

        {switchError && (
          <p className="banner" role="alert">
            {switchError}
          </p>
        )}

        <div className="environments">
          {settings &&
            ENVIRONMENTS.map((environment) => {
              const status = settings.environments[environment]
              const isActive = settings.active === environment
              const connectionState = testConnection[environment]

              return (
                <section key={environment} className="card" aria-label={ENVIRONMENT_LABELS[environment]}>
                  <div className="card-header">
                    <h3>{ENVIRONMENT_LABELS[environment]}</h3>
                    <div className="status-badges">
                      <span className={`badge ${status.configured ? 'badge--configured' : 'badge--not-configured'}`}>
                        {status.configured ? 'Konfiguriert' : 'Nicht konfiguriert'}
                      </span>
                      {isActive && <span className="badge badge--active">Aktiv</span>}
                    </div>
                  </div>

                  <form className="field-group" onSubmit={(event) => void handleSave(environment, event)}>
                    <div className="field">
                      <label htmlFor={`${environment}-username`}>Benutzername</label>
                      <input
                        id={`${environment}-username`}
                        type="text"
                        autoComplete="username"
                        value={forms[environment].username}
                        onChange={(event) => updateForm(environment, 'username', event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`${environment}-password`}>Passwort</label>
                      <input
                        id={`${environment}-password`}
                        type="password"
                        autoComplete="new-password"
                        value={forms[environment].password}
                        onChange={(event) => updateForm(environment, 'password', event.target.value)}
                      />
                    </div>

                    {formErrors[environment] && (
                      <p className="form-message form-message--error" role="alert">
                        {formErrors[environment]}
                      </p>
                    )}
                    {formSuccess[environment] && (
                      <p className="form-message form-message--success">{formSuccess[environment]}</p>
                    )}

                    <div className="form-actions">
                      <button type="submit" className="button--primary">
                        Speichern
                      </button>
                      <button
                        type="button"
                        className="button--secondary"
                        onClick={() => void handleSelectActive(environment)}
                        disabled={isActive || isSwitchingActive}
                      >
                        Als aktive Umgebung auswählen
                      </button>
                    </div>
                  </form>

                  {status.configured && (
                    <div className="connection-test">
                      <div className="form-actions">
                        <button
                          type="button"
                          className="button--secondary"
                          onClick={() => void handleTestConnection(environment)}
                          disabled={connectionState.status === 'loading'}
                        >
                          {connectionState.status === 'loading' ? 'Verbindung wird getestet…' : 'Verbindung testen'}
                        </button>
                      </div>
                      {connectionState.status === 'success' && (
                        <p className="form-message form-message--success">Verbindung erfolgreich.</p>
                      )}
                      {connectionState.status === 'error' && (
                        <p className="form-message form-message--error" role="alert">
                          {connectionState.message}
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
        </div>
      </div>
    </dialog>
  )
}

export default SettingsDialog
