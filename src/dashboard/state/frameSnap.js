/**
 * Moving a module between fixed holders.
 *
 * The board is a rack of frames, not free canvas. A frame is any rectangle the
 * board already has: one a module is sitting in, or an empty bay. Moving a
 * module never invents, resizes or reshapes a frame - it only changes which
 * module is in which one - so the holder grid a user arranged stays exactly as
 * they left it however much they shuffle its contents.
 *
 * That is the whole rule, and it is why this is arithmetic rather than a
 * layout engine: dropping is a choice between rectangles that already exist.
 *
 * Pure and free of React on purpose. Everything here is a function of
 * (what moved, where the frames are), which is testable without a browser and
 * is the part that has a right and a wrong answer.
 */

/** Area shared by two rectangles, in grid cells. */
export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function centreDistance(a, b) {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2)
  const dy = a.y + a.h / 2 - (b.y + b.h / 2)
  return Math.hypot(dx, dy)
}

/**
 * Which frame a rectangle is being offered to.
 *
 * Greatest overlap, with ties broken on centre distance so the answer is
 * deterministic rather than array order.
 *
 * The drag passes a single cell here - the one under the cursor - which reduces
 * this to "the frame containing that point". Passing the module's own rectangle
 * instead was tried and is wrong: a wide module laid across a rack of narrow
 * frames covers three or four at once, so the winner becomes a lottery between
 * neighbours rather than the frame the user is pointing at.
 *
 * @param {{x:number,y:number,w:number,h:number}} moved
 * @param {{x:number,y:number,w:number,h:number}[]} frames
 */
export function bestFrame(moved, frames) {
  let best = null
  let bestScore = 0
  let bestDistance = Infinity

  for (const frame of frames) {
    const score = overlapArea(moved, frame)
    if (score <= 0) continue

    const distance = centreDistance(moved, frame)
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = frame
      bestScore = score
      bestDistance = distance
    }
  }

  return best
}

/**
 * Whether a module's own size limits let it live in this frame.
 *
 * A module takes its frame whole, so a frame larger than what the module says
 * it can be is as much a misfit as one that is too small - and it is the worse
 * of the two, because the grid engine is handed those same maxima and would
 * quietly clamp the module back down, leaving the stored layout claiming a size
 * the board is not drawing.
 */
export function fitsFrame(frame, min, max) {
  if (frame.w < (min?.w ?? 1) || frame.h < (min?.h ?? 1)) return false
  if (max?.w != null && frame.w > max.w) return false
  if (max?.h != null && frame.h > max.h) return false
  return true
}

const rectOf = (item) => ({ x: item.x, y: item.y, w: item.w, h: item.h })
const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/**
 * Work out the layout a drop should produce.
 *
 * Three outcomes, and refusing is one of them. A frame too small for what is
 * being put in it is not a frame that should quietly grow, because the grid
 * staying put is the point - so the move is declined and the module goes back
 * where it came from, which is the same answer a user gets from dropping on
 * nothing at all.
 *
 * @param {object} args
 * @param {string} args.movedId
 * @param {{x:number,y:number,w:number,h:number}} args.movedTo Where the drag left it.
 * @param {{i:string,x:number,y:number,w:number,h:number}[]} args.layout The committed layout.
 * @param {{x:number,y:number,w:number,h:number}[]} args.bays Empty frames.
 * @param {(id:string) => {min?:{w:number,h:number}, max?:{w:number,h:number}}} args.limitsOf
 * @returns {{i:string,x:number,y:number,w:number,h:number}[] | null} Null when nothing should change.
 */
export function planFrameMove({ movedId, movedTo, layout, bays, limitsOf }) {
  const moved = layout.find((item) => item.i === movedId)
  if (!moved) return null

  const home = rectOf(moved)

  // Every frame except the one it started in: offering a module its own frame
  // back would register as a move and cost an undo step for nothing.
  const occupied = layout.filter((item) => item.i !== movedId)
  const frames = [...occupied.map(rectOf), ...bays]

  const target = bestFrame(movedTo, frames)
  if (!target || sameRect(target, home)) return null

  const held = occupied.find((item) => sameRect(rectOf(item), target))

  // Into an empty bay: the module takes the bay, and the frame it came from
  // becomes a bay in its turn.
  if (!held) {
    const limits = limitsOf(movedId)
    if (!fitsFrame(target, limits?.min, limits?.max)) return null
    return layout.map((item) => (item.i === movedId ? { ...item, ...target } : item))
  }

  // Onto another module: they trade frames, each resizing to fit the one it
  // arrives in. Both have to fit, or neither moves - a half-completed swap
  // would leave one of them overlapping the other.
  const movedLimits = limitsOf(movedId)
  const heldLimits = limitsOf(held.i)

  if (
    !fitsFrame(target, movedLimits?.min, movedLimits?.max) ||
    !fitsFrame(home, heldLimits?.min, heldLimits?.max)
  ) {
    return null
  }

  return layout.map((item) => {
    if (item.i === movedId) return { ...item, ...target }
    if (item.i === held.i) return { ...item, ...home }
    return item
  })
}
