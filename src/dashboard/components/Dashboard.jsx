import { useState } from 'react'
import { DashboardProvider, useDashboardState } from '../state/DashboardProvider'
import DashboardToolbar from './DashboardToolbar'
import DashboardContextBar from './DashboardContextBar'
import DashboardGrid from './DashboardGrid'
import ModuleLibrary from './ModuleLibrary'
import ModuleConfigurator from './ModuleConfigurator'
import HiddenModules from './HiddenModules'
import DeskChooser from './DeskChooser'

// Registers every module with the registry. This is the one import in the app
// that exists for its side effect, and it is why nothing else in the dashboard
// engine imports a module component.
import '../modules'

import '../../styles/dashboard.css'
import 'react-grid-layout/css/styles.css'

/**
 * The dashboard page.
 *
 * It orchestrates and owns almost nothing: the toolbar edits state, the grid
 * places modules, the renderer resolves them, the registry knows what they are.
 * Adding a module changes none of these files.
 */
function DashboardInner() {
  const { dashboard, customizing, isFirstVisit } = useDashboardState()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [configuringId, setConfiguringId] = useState(null)

  /*
   * The two halves of placement, both owned here because the library and the
   * grid are siblings and neither should reach into the other.
   *
   * `draggingEntry` is what the grid needs to size its drop preview while a card
   * is in flight. `targetSlot` is the gap a user clicked, which the library
   * then places into.
   */
  const [draggingEntry, setDraggingEntry] = useState(null)
  const [targetSlot, setTargetSlot] = useState(null)

  const openLibrary = (slot = null) => {
    setTargetSlot(slot)
    setLibraryOpen(true)
  }

  const closeLibrary = () => {
    setLibraryOpen(false)
    setTargetSlot(null)
    setDraggingEntry(null)
  }

  const empty = (dashboard?.modules ?? []).filter((m) => !m.hidden).length === 0

  return (
    <div className={`dash-page ${customizing ? 'is-customizing' : ''}`}>
      <DashboardToolbar onAddModule={() => openLibrary()} />
      <DashboardContextBar />

      <div className="dash-canvas">
        <div className="dash-canvas-main">
          {empty ? (
            <div className="dash-empty">
              <h2>This dashboard is empty</h2>
              <p>Add a module to start building, or apply a preset from the toolbar.</p>
              <button
                type="button"
                className="dash-btn dash-btn-primary"
                onClick={() => openLibrary()}
              >
                Add module
              </button>
            </div>
          ) : (
            <DashboardGrid
              onConfigure={setConfiguringId}
              draggingEntry={draggingEntry}
            />
          )}

          {customizing ? <HiddenModules /> : null}
        </div>

        {configuringId ? (
          <ModuleConfigurator moduleId={configuringId} onClose={() => setConfiguringId(null)} />
        ) : null}
      </div>

      {/* Offered once, before anything else is in the way. */}
      {isFirstVisit ? <DeskChooser /> : null}

      <ModuleLibrary
        open={libraryOpen}
        onClose={closeLibrary}
        targetSlot={targetSlot}
        onDragDefChange={setDraggingEntry}
      />
    </div>
  )
}

export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardInner />
    </DashboardProvider>
  )
}
