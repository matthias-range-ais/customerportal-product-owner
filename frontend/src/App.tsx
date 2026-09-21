import { useEffect, useState } from 'react'
import SettingsDialog from './SettingsDialog.tsx'
import SoftwareOverview from './SoftwareOverview.tsx'
import { ENVIRONMENT_LABELS, type SettingsSnapshot } from './settings-types.ts'

function App() {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-header-row">
          <h1>EquipmentCloud-Verbindung</h1>
          <button
            type="button"
            className="button--secondary"
            onClick={() => setIsSettingsOpen(true)}
            disabled={!settings}
          >
            Einstellungen
          </button>
        </div>
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

      <SettingsDialog
        open={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={setSettings}
      />

      <SoftwareOverview activeEnvironment={settings?.active ?? null} />
    </main>
  )
}

export default App
