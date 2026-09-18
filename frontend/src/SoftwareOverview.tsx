import { useEffect, useState } from 'react'
import { readErrorCode } from './api-utils.ts'

interface SoftwareVersion {
  id: number
  name: string
}

interface SoftwareItem {
  id: number
  name: string
  category: string
  description: string
  versions: SoftwareVersion[]
}

interface SoftwareSetItem {
  id: number
  name: string
  category: string
  state: string
  stateLabel: string
}

interface SoftwareOverviewData {
  software: SoftwareItem[]
  sets: SoftwareSetItem[]
}

// Mirrors EquipmentCloudFailure (src/adapters/equipmentcloud/equipmentcloud-port.ts) — the
// route passes this through verbatim, same convention as /api/settings/test-connection.
type EquipmentCloudFailure =
  | { ok: false; kind: 'http-error'; status: number; body: string }
  | { ok: false; kind: 'network-error'; message: string }
  | { ok: false; kind: 'timeout' }

type OverviewState =
  | { status: 'loading' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: SoftwareOverviewData }

function isEquipmentCloudFailure(body: unknown): body is EquipmentCloudFailure {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === false
}

function failureMessage(failure: EquipmentCloudFailure): string {
  if (failure.kind === 'http-error') {
    return `EquipmentCloud-Fehler ${failure.status}: ${failure.body || '(kein Antworttext)'}`
  }
  if (failure.kind === 'timeout') {
    return 'Zeitüberschreitung: keine Antwort von EquipmentCloud.'
  }
  return `Netzwerkfehler: ${failure.message}`
}

function SoftwareOverview() {
  const [state, setState] = useState<OverviewState>({ status: 'loading' })

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setState({ status: 'loading' })

    try {
      const response = await fetch('/api/software')

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        if (errorCode === 'NOT_CONFIGURED') {
          setState({ status: 'not-configured' })
        } else {
          setState({ status: 'error', message: 'SoftwareCenter-Daten konnten nicht geladen werden.' })
        }
        return
      }

      const body = await response.json()

      if (isEquipmentCloudFailure(body)) {
        setState({ status: 'error', message: failureMessage(body) })
        return
      }

      setState({ status: 'success', data: body as SoftwareOverviewData })
    } catch {
      setState({ status: 'error', message: 'SoftwareCenter-Daten konnten nicht geladen werden.' })
    }
  }

  return (
    <section className="card software-overview" aria-label="SoftwareCenter-Übersicht">
      <div className="card-header">
        <h2>SoftwareCenter-Übersicht</h2>
      </div>

      {state.status === 'loading' && <p className="form-message">Wird geladen…</p>}

      {state.status === 'not-configured' && (
        <p className="banner" role="alert">
          Keine aktive Umgebung ausgewählt. Bitte zuerst eine Umgebung konfigurieren und als aktiv auswählen.
        </p>
      )}

      {state.status === 'error' && (
        <p className="banner" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'success' && (
        <>
          <div className="table-block">
            <h3>Software</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kategorie</th>
                    <th>Beschreibung</th>
                    <th>Versionen</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.software.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="data-table-empty">
                        Keine Software vorhanden.
                      </td>
                    </tr>
                  ) : (
                    state.data.software.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>{item.description}</td>
                        <td>{item.versions.map((version) => version.name).join(', ') || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="table-block">
            <h3>Sets</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kategorie</th>
                    <th>Freigabestatus</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.sets.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="data-table-empty">
                        Keine Sets vorhanden.
                      </td>
                    </tr>
                  ) : (
                    state.data.sets.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>{item.stateLabel}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default SoftwareOverview
