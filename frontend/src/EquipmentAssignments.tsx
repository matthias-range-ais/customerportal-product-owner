import { useEffect, useRef, useState } from 'react'
import { failureMessage, formatDate, isEquipmentCloudFailure, readErrorCode } from './api-utils.ts'
import type { Environment } from './settings-types.ts'

interface EquipmentItem {
  id: string
  name: string
  equipmentType: string
}

interface InstalledSoftwareItem {
  softwareId: number
  software: string
  category: string
  versionId: number
  version: string
  installedOn: string
}

interface AssignedSetItem {
  id: number
  name: string
  state: string
  stateLabel: string
  updatedOn: string
}

type EquipmentListState =
  | { status: 'loading' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: EquipmentItem[] }

type AssignmentsState =
  | { status: 'loading' }
  | { status: 'not-configured' }
  | { status: 'error'; message: string }
  | { status: 'success'; installed: InstalledSoftwareItem[]; sets: AssignedSetItem[] }

function matchesEquipmentQuery(item: EquipmentItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  return item.name.toLowerCase().includes(normalizedQuery) || item.id.toLowerCase().includes(normalizedQuery)
}

interface EquipmentSearchListProps {
  items: EquipmentItem[]
  onSelect: (item: EquipmentItem) => void
}

/** Client-side-filtered equipment search list (the `things` list endpoint has no query parameter). */
function EquipmentSearchList({ items, onSelect }: EquipmentSearchListProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = items.filter((item) => matchesEquipmentQuery(item, normalizedQuery))

  return (
    <div className="table-block">
      <div className="filter-bar">
        <input
          type="search"
          className="filter-input"
          aria-label="Ausrüstung suchen"
          placeholder="Suche nach Name oder ID…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <p className="data-table-empty">Keine Ausrüstung vorhanden.</p>
      ) : filtered.length === 0 ? (
        <p className="data-table-empty">Keine Treffer für diese Suche.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Typ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button type="button" className="equipment-select-row" onClick={() => onSelect(item)}>
                      {item.name}
                    </button>
                  </td>
                  <td>{item.equipmentType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface InstalledSoftwareTableProps {
  items: InstalledSoftwareItem[]
}

function InstalledSoftwareTable({ items }: InstalledSoftwareTableProps) {
  return (
    <div className="table-block">
      <h3>Installierte Software</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kategorie</th>
              <th>Version</th>
              <th>Installiert am</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="data-table-empty">
                  Keine installierte Software vorhanden.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${item.softwareId}-${item.versionId}-${index}`}>
                  <td>{item.software}</td>
                  <td>{item.category}</td>
                  <td>{item.version}</td>
                  <td>{formatDate(item.installedOn)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface AssignedSetsTableProps {
  items: AssignedSetItem[]
}

function AssignedSetsTable({ items }: AssignedSetsTableProps) {
  return (
    <div className="table-block">
      <h3>Zugewiesene Sets</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Freigabestatus</th>
              <th>Datum</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="data-table-empty">
                  Keine zugewiesenen Sets vorhanden.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.stateLabel}</td>
                  <td>{formatDate(item.updatedOn)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface SelectedEquipmentViewProps {
  equipment: EquipmentItem
  state: AssignmentsState
  onChangeSelection: () => void
}

/** The selected equipment's summary row plus its two assignment tables (or a loading/error state). */
function SelectedEquipmentView({ equipment, state, onChangeSelection }: SelectedEquipmentViewProps) {
  return (
    <div className="table-block">
      <div className="selected-equipment">
        <p>
          Ausgewählte Ausrüstung: <strong>{equipment.name}</strong>
          {equipment.equipmentType ? ` (${equipment.equipmentType})` : ''}
        </p>
        <button type="button" className="button--secondary" onClick={onChangeSelection}>
          Andere Auswahl
        </button>
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
          <InstalledSoftwareTable items={state.installed} />
          <AssignedSetsTable items={state.sets} />
        </div>
      )}
    </div>
  )
}

interface EquipmentAssignmentsProps {
  // Refetches the equipment list whenever this changes (e.g. the Product Owner switches the
  // active environment), same convention as SoftwareOverview.
  activeEnvironment: Environment | null
}

/**
 * Equipment picker + per-equipment assignments view (Story 1.5). Search/select and the
 * assignments table are one flow: selecting equipment fetches and shows its installed software
 * and assigned sets; "Andere Auswahl" clears the selection and returns to the (already-fetched)
 * search list without refetching it — the equipment list itself is fetched once per view-open
 * (mount / active-environment change), per the spec's "Always" note.
 */
function EquipmentAssignments({ activeEnvironment }: EquipmentAssignmentsProps) {
  const [listState, setListState] = useState<EquipmentListState>({ status: 'loading' })
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentItem | null>(null)
  const [assignmentsState, setAssignmentsState] = useState<AssignmentsState>({ status: 'loading' })
  // Bumped at the start of each request so a response for a since-superseded request can't
  // overwrite newer state — same race-safety convention as SoftwareOverview.
  const listRequestIdRef = useRef(0)
  const assignmentsRequestIdRef = useRef(0)

  useEffect(() => {
    // Invalidates any in-flight assignments request for the previous environment's equipment —
    // same reasoning as handleChangeSelection, just for an environment switch instead of an
    // explicit "Andere Auswahl" click.
    assignmentsRequestIdRef.current++
    setSelectedEquipment(null)
    void loadList()
  }, [activeEnvironment])

  async function loadList() {
    const requestId = ++listRequestIdRef.current
    setListState({ status: 'loading' })

    try {
      const response = await fetch('/api/equipment')

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        if (requestId !== listRequestIdRef.current) {
          return
        }
        if (errorCode === 'NOT_CONFIGURED') {
          setListState({ status: 'not-configured' })
        } else {
          setListState({ status: 'error', message: 'Ausrüstungsliste konnte nicht geladen werden.' })
        }
        return
      }

      const body = await response.json()
      if (requestId !== listRequestIdRef.current) {
        return
      }

      if (isEquipmentCloudFailure(body)) {
        setListState({ status: 'error', message: failureMessage(body) })
        return
      }

      setListState({ status: 'ready', items: (body as { items: EquipmentItem[] }).items })
    } catch {
      if (requestId !== listRequestIdRef.current) {
        return
      }
      setListState({ status: 'error', message: 'Ausrüstungsliste konnte nicht geladen werden.' })
    }
  }

  async function loadAssignments(equipmentId: string) {
    const requestId = ++assignmentsRequestIdRef.current
    setAssignmentsState({ status: 'loading' })

    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(equipmentId)}/assignments`)

      if (!response.ok) {
        const errorCode = await readErrorCode(response)
        if (requestId !== assignmentsRequestIdRef.current) {
          return
        }
        if (errorCode === 'NOT_CONFIGURED') {
          setAssignmentsState({ status: 'not-configured' })
        } else {
          setAssignmentsState({ status: 'error', message: 'Zuordnungen konnten nicht geladen werden.' })
        }
        return
      }

      const body = await response.json()
      if (requestId !== assignmentsRequestIdRef.current) {
        return
      }

      if (isEquipmentCloudFailure(body)) {
        setAssignmentsState({ status: 'error', message: failureMessage(body) })
        return
      }

      const data = body as { installed: InstalledSoftwareItem[]; sets: AssignedSetItem[] }
      setAssignmentsState({ status: 'success', installed: data.installed, sets: data.sets })
    } catch {
      if (requestId !== assignmentsRequestIdRef.current) {
        return
      }
      setAssignmentsState({ status: 'error', message: 'Zuordnungen konnten nicht geladen werden.' })
    }
  }

  function handleSelect(item: EquipmentItem) {
    setSelectedEquipment(item)
    void loadAssignments(item.id)
  }

  function handleChangeSelection() {
    // Invalidates any in-flight assignments request so a late response can't flip back into
    // view after returning to the search list.
    assignmentsRequestIdRef.current++
    setSelectedEquipment(null)
  }

  return (
    <section className="card equipment-assignments" aria-label="Kundenausrüstung & aktuelle Zuordnungen">
      <div className="card-header">
        <h2>Kundenausrüstung & aktuelle Zuordnungen</h2>
      </div>

      {listState.status === 'loading' && <p className="form-message">Wird geladen…</p>}

      {listState.status === 'not-configured' && (
        <p className="banner" role="alert">
          Keine aktive Umgebung ausgewählt. Bitte über "Einstellungen" zuerst eine Umgebung konfigurieren und als
          aktiv auswählen.
        </p>
      )}

      {listState.status === 'error' && (
        <p className="banner" role="alert">
          {listState.message}
        </p>
      )}

      {listState.status === 'ready' &&
        (selectedEquipment ? (
          <SelectedEquipmentView
            equipment={selectedEquipment}
            state={assignmentsState}
            onChangeSelection={handleChangeSelection}
          />
        ) : (
          <EquipmentSearchList items={listState.items} onSelect={handleSelect} />
        ))}
    </section>
  )
}

export default EquipmentAssignments
