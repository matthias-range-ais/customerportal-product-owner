import { useEffect, useState, type FormEvent } from 'react'

type Environment = 'test' | 'prod'

interface SettingsSnapshot {
  environments: Record<Environment, { configured: boolean }>
  active: Environment | null
  activeUsername: string | null
}

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

const ENVIRONMENTS: Environment[] = ['test', 'prod']

const ENVIRONMENT_LABELS: Record<Environment, string> = {
  test: 'Test',
  prod: 'Produktion',
}

type CredentialsForm = { username: string; password: string }

const emptyForms: Record<Environment, CredentialsForm> = {
  test: { username: '', password: '' },
  prod: { username: '', password: '' },
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body = await response.json()
    return typeof body?.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

function App() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forms, setForms] = useState(emptyForms)
  const [formErrors, setFormErrors] = useState<Record<Environment, string | null>>({ test: null, prod: null })
  const [formSuccess, setFormSuccess] = useState<Record<Environment, string | null>>({ test: null, prod: null })
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [testConnection, setTestConnection] = useState<Record<Environment, TestConnectionState>>(idleTestConnection)

  useEffect(() => {
    void loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const response = await fetch('/api/settings')
      if (!response.ok) {
        throw new Error(`unexpected status ${response.status}`)
      }
      const data = (await response.json()) as SettingsSnapshot
      setSettings(data)
      setLoadError(null)
    } catch {
      setLoadError('Einstellungen konnten nicht geladen werden.')
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
      setSettings(data)
      setForms((prev) => ({ ...prev, [environment]: { ...prev[environment], password: '' } }))
      setFormSuccess((prev) => ({ ...prev, [environment]: 'Zugangsdaten gespeichert.' }))
    } catch {
      setFormErrors((prev) => ({ ...prev, [environment]: 'Speichern fehlgeschlagen. Bitte erneut versuchen.' }))
    }
  }

  async function handleSelectActive(environment: Environment) {
    setSwitchError(null)

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
      setSettings(data)
    } catch {
      setSwitchError('Umgebung konnte nicht gewechselt werden. Bitte erneut versuchen.')
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
    <main className="page">
      <header className="page-header">
        <h1>EquipmentCloud-Verbindung</h1>
        {settings && (
          <p className="active-environment" data-testid="active-environment">
            Aktive Umgebung:{' '}
            <strong>
              {settings.active ? ENVIRONMENT_LABELS[settings.active] : 'keine'}
              {settings.active && settings.activeUsername ? ` (${settings.activeUsername})` : ''}
            </strong>
          </p>
        )}
      </header>

      {loadError && (
        <p className="banner" role="alert">
          {loadError}
        </p>
      )}
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
                  <h2>{ENVIRONMENT_LABELS[environment]}</h2>
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
                      disabled={isActive}
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
    </main>
  )
}

export default App
