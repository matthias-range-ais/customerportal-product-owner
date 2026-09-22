import { useEffect, useRef, useState } from 'react'
import { readErrorCode } from './api-utils.ts'
import type { Environment } from './settings-types.ts'

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
  updatedOn: string
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

/**
 * Formats an EquipmentCloud `updated_on` ISO-8601 timestamp for a German audience. Falls back to
 * the raw string (instead of "Invalid Date") when the value can't be parsed, per the "Datum"
 * column's edge case in the spec's I/O matrix.
 */
function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleDateString('de-DE')
}

function matchesSoftwareQuery(item: SoftwareItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  return (
    item.name.toLowerCase().includes(normalizedQuery) ||
    item.category.toLowerCase().includes(normalizedQuery) ||
    item.description.toLowerCase().includes(normalizedQuery)
  )
}

function matchesSetQuery(item: SoftwareSetItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  return item.name.toLowerCase().includes(normalizedQuery) || item.category.toLowerCase().includes(normalizedQuery)
}

/** Groups items by category (alphabetically, empty-string category included), each group sorted by name. */
function groupByCategory<T extends { category: string; name: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const category = item.category.trim()
    const group = groups.get(category)
    if (group) {
      group.push(item)
    } else {
      groups.set(category, [item])
    }
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name, 'de-DE'))
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'de-DE'))
}

interface SoftwareTableProps {
  items: SoftwareItem[]
}

/**
 * Software table with a client-side search over name/category/description, grouped into
 * collapsed-by-default per-category sections. Expanding a category shows a plain list of its
 * software names; clicking a name expands an inline detail block (description + versions) below
 * it — data the /api/software response already carries, so no extra request is made on click.
 */
function SoftwareTable({ items }: SoftwareTableProps) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = items.filter((item) => matchesSoftwareQuery(item, normalizedQuery))
  const groups = groupByCategory(filtered)

  // Guards against a stale expandedId surviving a visible-item-set change (environment switch,
  // or the search filtering a different item into view) — without this, a detail block could
  // auto-show for an item the Product Owner never clicked.
  useEffect(() => {
    setExpandedId(null)
  }, [items])

  return (
    <div className="table-block">
      <h3>Software</h3>
      <div className="filter-bar">
        <input
          type="search"
          className="filter-input"
          aria-label="Software suchen"
          placeholder="Suche nach Name, Kategorie oder Beschreibung…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setExpandedId(null)
          }}
        />
      </div>

      {items.length === 0 ? (
        <p className="data-table-empty">Keine Software vorhanden.</p>
      ) : groups.length === 0 ? (
        <p className="data-table-empty">Keine Treffer für diese Suche.</p>
      ) : (
        <div className="category-groups">
          {groups.map(([category, groupItems]) => (
            <details className="category-group" key={category}>
              <summary>
                {category || 'Ohne Kategorie'} <span className="category-count">({groupItems.length})</span>
              </summary>
              <ul className="software-list">
                {groupItems.map((item) => {
                  const isExpanded = expandedId === item.id
                  return (
                    <li className="software-list-item" key={item.id}>
                      <button
                        type="button"
                        className="software-list-row"
                        aria-expanded={isExpanded}
                        onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                      >
                        {item.name}
                      </button>
                      {isExpanded && (
                        <div className="software-detail">
                          <p>{item.description || 'Keine Beschreibung vorhanden.'}</p>
                          <p>
                            {item.versions.length > 0
                              ? item.versions.map((version) => version.name).join(', ')
                              : 'Keine Versionen vorhanden.'}
                          </p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

interface SoftwareSetsSectionProps {
  items: SoftwareSetItem[]
}

/**
 * Sets table with a client-side search (name/category) combinable with a multi-select
 * release-state filter (OR logic across selected statuses, chips with individual removal),
 * grouped into per-category collapsible sections, each showing the "Datum" column.
 */
function SoftwareSetsSection({ items }: SoftwareSetsSectionProps) {
  const [query, setQuery] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])

  // Guards against a stale selection surviving an environment switch — without this, a chip for
  // a status code that doesn't exist in the new environment's data would linger (showing the raw
  // code instead of a label) and silently filter the table down to zero matches.
  useEffect(() => {
    setSelectedStates([])
  }, [items])

  const stateOptions = Array.from(new Map(items.map((item) => [item.state, item.stateLabel])).entries()).sort(
    ([, labelA], [, labelB]) => labelA.localeCompare(labelB, 'de-DE'),
  )
  const stateLabelByState = new Map(stateOptions)
  const addableStateOptions = stateOptions.filter(([state]) => !selectedStates.includes(state))
  // Alphabetical by label, matching the rest of this filter bar's sort conventions (the
  // dropdown options and category groups), rather than raw selection/click order.
  const sortedSelectedStates = [...selectedStates].sort((a, b) =>
    (stateLabelByState.get(a) ?? a).localeCompare(stateLabelByState.get(b) ?? b, 'de-DE'),
  )

  function addState(state: string) {
    setSelectedStates((current) => (current.includes(state) ? current : [...current, state]))
  }

  function removeState(state: string) {
    setSelectedStates((current) => current.filter((selected) => selected !== state))
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = items.filter(
    (item) => matchesSetQuery(item, normalizedQuery) && (selectedStates.length === 0 || selectedStates.includes(item.state)),
  )
  const groups = groupByCategory(filtered)

  return (
    <div className="table-block">
      <h3>Sets</h3>
      <div className="filter-bar">
        <input
          type="search"
          className="filter-input"
          aria-label="Sets suchen"
          placeholder="Suche nach Name oder Kategorie…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="filter-input"
          aria-label="Freigabestatus hinzufügen"
          value=""
          onChange={(event) => {
            if (event.target.value) {
              addState(event.target.value)
            }
          }}
        >
          <option value="">+ Status hinzufügen</option>
          {addableStateOptions.map(([state, label]) => (
            <option key={state} value={state}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {sortedSelectedStates.length > 0 && (
        <ul className="chips" aria-label="Ausgewählte Freigabestatus-Filter">
          {sortedSelectedStates.map((state) => (
            <li key={state} className="chip">
              {stateLabelByState.get(state) ?? state}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Filter "${stateLabelByState.get(state) ?? state}" entfernen`}
                onClick={() => removeState(state)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kategorie</th>
                <th>Freigabestatus</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="data-table-empty">
                  Keine Sets vorhanden.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : groups.length === 0 ? (
        <p className="data-table-empty">Keine Treffer für diese Filter.</p>
      ) : (
        <div className="category-groups">
          {groups.map(([category, groupItems]) => (
            <details className="category-group" key={category}>
              <summary>
                {category || 'Ohne Kategorie'} <span className="category-count">({groupItems.length})</span>
              </summary>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kategorie</th>
                      <th>Freigabestatus</th>
                      <th>Datum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.category}</td>
                        <td>{item.stateLabel}</td>
                        <td>{formatDate(item.updatedOn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  )
}

interface SoftwareOverviewProps {
  // Refetches whenever this changes (e.g. the Product Owner switches the active
  // environment in the settings dialog), so the overview never shows stale data.
  activeEnvironment: Environment | null
}

function SoftwareOverview({ activeEnvironment }: SoftwareOverviewProps) {
  const [state, setState] = useState<OverviewState>({ status: 'loading' })
  // Bumped at the start of each `load()` call so a response for a since-superseded request
  // (e.g. the active environment changed again before this one resolved) can't overwrite
  // newer state — only the response whose token still matches the latest call applies.
  const requestIdRef = useRef(0)

  useEffect(() => {
    void load()
  }, [activeEnvironment])

  async function load() {
    const requestId = ++requestIdRef.current
    setState({ status: 'loading' })

    try {
      const response = await fetch('/api/software')

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        if (requestId !== requestIdRef.current) {
          return
        }
        if (errorCode === 'NOT_CONFIGURED') {
          setState({ status: 'not-configured' })
        } else {
          setState({ status: 'error', message: 'SoftwareCenter-Daten konnten nicht geladen werden.' })
        }
        return
      }

      const body = await response.json()
      if (requestId !== requestIdRef.current) {
        return
      }

      if (isEquipmentCloudFailure(body)) {
        setState({ status: 'error', message: failureMessage(body) })
        return
      }

      setState({ status: 'success', data: body as SoftwareOverviewData })
    } catch {
      if (requestId !== requestIdRef.current) {
        return
      }
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
          Keine aktive Umgebung ausgewählt. Bitte über "Einstellungen" zuerst eine Umgebung konfigurieren und als
          aktiv auswählen.
        </p>
      )}

      {state.status === 'error' && (
        <p className="banner" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'success' && (
        <div className="overview-tables">
          <SoftwareTable items={state.data.software} />
          <SoftwareSetsSection items={state.data.sets} />
        </div>
      )}
    </section>
  )
}

export default SoftwareOverview
