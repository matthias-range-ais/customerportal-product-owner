import { useEffect, useState, type FormEvent } from 'react'

type Environment = 'test' | 'prod'

interface SettingsSnapshot {
  environments: Record<Environment, { configured: boolean }>
  active: Environment | null
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

  return (
    <main>
      <h1>EquipmentCloud-Verbindung</h1>

      {loadError && <p role="alert">{loadError}</p>}

      {settings && (
        <p>Aktive Umgebung: {settings.active ? ENVIRONMENT_LABELS[settings.active] : 'keine'}</p>
      )}

      {switchError && <p role="alert">{switchError}</p>}

      {settings &&
        ENVIRONMENTS.map((environment) => {
          const status = settings.environments[environment]
          const isActive = settings.active === environment

          return (
            <section key={environment} aria-label={ENVIRONMENT_LABELS[environment]}>
              <h2>{ENVIRONMENT_LABELS[environment]}</h2>
              <p>
                {status.configured ? 'Konfiguriert' : 'Nicht konfiguriert'}
                {isActive ? ' · Aktiv' : ''}
              </p>

              <form onSubmit={(event) => void handleSave(environment, event)}>
                <label>
                  Benutzername
                  <input
                    type="text"
                    autoComplete="username"
                    value={forms[environment].username}
                    onChange={(event) => updateForm(environment, 'username', event.target.value)}
                  />
                </label>
                <label>
                  Passwort
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={forms[environment].password}
                    onChange={(event) => updateForm(environment, 'password', event.target.value)}
                  />
                </label>
                <button type="submit">Speichern</button>
              </form>

              {formErrors[environment] && <p role="alert">{formErrors[environment]}</p>}
              {formSuccess[environment] && <p>{formSuccess[environment]}</p>}

              <button type="button" onClick={() => void handleSelectActive(environment)} disabled={isActive}>
                Als aktive Umgebung auswählen
              </button>
            </section>
          )
        })}
    </main>
  )
}

export default App
