import { useState } from 'react'
import { DashboardProvider, useDashboardState } from '../state/DashboardProvider'
import DashboardToolbar from './DashboardToolbar'
import DashboardContextBar from './DashboardContextBar'
import DashboardGrid from './DashboardGrid'
import ModuleLibrary from './ModuleLibrary'
import ModuleConfigurator from './ModuleConfigurator'
import HiddenModules from './HiddenModules'

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
  const { dashboard, customizing } = useDashboardState()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [configuringId, setConfiguringId] = useState(null)

  const empty = (dashboard?.modules ?? []).filter((m) => !m.hidden).length === 0

  return (
    <div className={`dash-page ${customizing ? 'is-customizing' : ''}`}>
      <DashboardToolbar onAddModule={() => setLibraryOpen(true)} />
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
                onClick={() => setLibraryOpen(true)}
              >
                Add module
              </button>
            </div>
          ) : (
            <DashboardGrid onConfigure={setConfiguringId} />
          )}

          {customizing ? <HiddenModules /> : null}
        </div>

        {configuringId ? (
          <ModuleConfigurator moduleId={configuringId} onClose={() => setConfiguringId(null)} />
        ) : null}
      </div>

      <ModuleLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} />
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
