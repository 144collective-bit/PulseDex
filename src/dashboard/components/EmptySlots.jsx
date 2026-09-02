import { useState } from 'react'
import { Plus } from 'lucide-react'
import { slotToPixels } from '../state/gridSlots'
import SlotAddMenu from './SlotAddMenu'

/**
 * The gaps, made usable.
 *
 * With compaction off, removing a module leaves a hole. These draw that hole as
 * something you can act on - press it and a menu of modules opens against the
 * bay, already knowing where the module is going - rather than leaving the user
 * to guess that the blank area is a place they are allowed to put something.
 *
 * Rendered as an overlay rather than as grid children on purpose. Real grid
 * items would take part in collision and compaction, so the placeholders would
 * shove the user's modules around simply by existing, and every add or remove
 * would have to reconcile a set of phantom items against the real layout.
 *
 * The layer itself never takes pointer events; only the bays do. And while a
 * module is being dragged in from the library, even they stop, so the drag
 * reaches the grid underneath and can be dropped anywhere rather than only on a
 * bay.
 *
 * Each bay is a positioned wrapper holding the button and, when open, its menu.
 * The menu cannot live inside the button - a dialog with a search field nested
 * in a <button> is neither valid nor operable - so the wrapper carries the
 * geometry and the two sit side by side within it.
 */
export default function EmptySlots({ slots, geometry, dragging }) {
  const [openKey, setOpenKey] = useState(null)

  if (!slots?.length) return null

  return (
    <div className={`dash-slots ${dragging ? 'is-dragging' : ''}`} aria-hidden={dragging}>
      {slots.map((slot) => {
        const key = `${slot.x}-${slot.y}-${slot.w}-${slot.h}`
        const box = slotToPixels(slot, geometry)
        const open = openKey === key

        return (
          <div
            key={key}
            className={`dash-slot-mount ${open ? 'is-open' : ''}`}
            style={{
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          >
            <button
              type="button"
              className="dash-slot"
              onClick={() => setOpenKey(open ? null : key)}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label={`Add a module here: ${slot.w} columns by ${slot.h} rows`}
            >
              <span className="dash-slot-mark">
                <Plus size={16} aria-hidden="true" />
              </span>
              {/* Only labelled when there is room for the label. In a two-row gap
                  the icon alone has to carry it. */}
              {slot.h >= 3 && slot.w >= 3 ? (
                <span className="dash-slot-label">Add module</span>
              ) : null}
            </button>

            {open ? <SlotAddMenu slot={slot} onClose={() => setOpenKey(null)} /> : null}
          </div>
        )
      })}
    </div>
  )
}
