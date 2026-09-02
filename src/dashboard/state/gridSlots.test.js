import { describe, it, expect } from 'vitest'
import { canFitFrame, findEmptySlots, fitToFrame, pixelsToCell, slotToPixels } from './gridSlots'

/*
 * The arithmetic that has to agree with the grid engine exactly.
 *
 * A bay reports its own coordinates when a module is added from it, and a drop
 * is resolved by turning a cursor back into a cell - so a rounding difference
 * here does not look like a rounding difference. It looks like a module landing
 * somewhere nobody put it.
 */

/** The real board: twelve columns, 54px rows, 12px margins. */
const geometry = { containerWidth: 958, cols: 12, rowHeight: 54, margin: [12, 12] }

const mod = (x, y, w, h) => ({ layout: { x, y, w, h } })

describe('slotToPixels and pixelsToCell', () => {
  it('round-trips every column origin', () => {
    for (let x = 0; x < geometry.cols; x += 1) {
      const px = slotToPixels({ x, y: 0, w: 1, h: 1 }, geometry)
      expect(pixelsToCell({ left: px.left, top: px.top }, geometry)).toEqual({ x, y: 0 })
    }
  })

  it('round-trips rows', () => {
    for (const y of [0, 1, 3, 8, 14, 30]) {
      const px = slotToPixels({ x: 0, y, w: 1, h: 1 }, geometry)
      expect(pixelsToCell({ left: px.left, top: px.top }, geometry)).toEqual({ x: 0, y })
    }
  })

  it('rounds a corner past halfway into the next column', () => {
    const pitch = (geometry.containerWidth - 12 * 11) / 12 + 12
    // Just over half a column in: the eye reads that as column one.
    expect(pixelsToCell({ left: pitch * 0.6, top: 0 }, geometry).x).toBe(1)
    expect(pixelsToCell({ left: pitch * 0.4, top: 0 }, geometry).x).toBe(0)
  })

  it('floors a pointer to the cell it is actually inside', () => {
    const pitch = (geometry.containerWidth - 12 * 11) / 12 + 12
    // Six tenths into column zero is still column zero for a cursor.
    expect(pixelsToCell({ left: pitch * 0.6, top: 0 }, geometry, 'floor').x).toBe(0)
    expect(pixelsToCell({ left: pitch * 1.9, top: 0 }, geometry, 'floor').x).toBe(1)
  })

  it('keeps a release past either edge on the board', () => {
    expect(pixelsToCell({ left: -400, top: -400 }, geometry)).toEqual({ x: 0, y: 0 })
    expect(pixelsToCell({ left: 99999, top: 0 }, geometry).x).toBe(geometry.cols - 1)
  })
})

describe('findEmptySlots', () => {
  it('offers the gap left by a removed module', () => {
    // A full top row, then one module in a row that could hold four.
    const slots = findEmptySlots([mod(0, 0, 12, 3), mod(0, 3, 3, 3)], 12)
    const beside = slots.find((s) => s.x === 3 && s.y === 3)

    expect(beside).toBeDefined()
    expect(beside.w).toBe(9)
    // Taller than the module it sits beside, because the run continues down
    // into the trailing space rather than stopping at the row.
    expect(beside.h).toBeGreaterThanOrEqual(3)
  })

  it('offers space below the lowest module so a full board is still usable', () => {
    const slots = findEmptySlots([mod(0, 0, 12, 3)], 12)

    expect(slots.some((s) => s.y >= 3 && s.w === 12)).toBe(true)
  })

  it('does not offer a gap too small to hold anything', () => {
    // One column free between two modules: nothing in the registry fits it.
    const slots = findEmptySlots([mod(0, 0, 5, 3), mod(6, 0, 6, 3)], 12)

    expect(slots.some((s) => s.y === 0 && s.w < 2)).toBe(false)
  })

  it('never overlaps a module', () => {
    const modules = [mod(0, 0, 12, 3), mod(0, 3, 4, 4), mod(8, 3, 4, 4)]
    const slots = findEmptySlots(modules, 12)

    for (const slot of slots) {
      for (const { layout } of modules) {
        const overlapW = Math.min(slot.x + slot.w, layout.x + layout.w) - Math.max(slot.x, layout.x)
        const overlapH = Math.min(slot.y + slot.h, layout.y + layout.h) - Math.max(slot.y, layout.y)
        expect(overlapW <= 0 || overlapH <= 0).toBe(true)
      }
    }
  })
})

/*
 * Putting a module into a bay.
 *
 * Adding has to agree with moving: both take the frame whole, or the rack
 * changes shape depending on how a module got there.
 */
describe('fitToFrame', () => {
  const def = (min, max) => ({ minSize: min, maxSize: max, defaultSize: { w: 3, h: 3 } })

  it('takes the whole frame rather than the module default size', () => {
    expect(fitToFrame(def({ w: 2, h: 2 }), { x: 4, y: 9, w: 8, h: 6 })).toEqual({
      x: 4,
      y: 9,
      w: 8,
      h: 6,
    })
  })

  it('never goes below the module minimum, even in a smaller frame', () => {
    const fitted = fitToFrame(def({ w: 4, h: 4 }), { x: 0, y: 0, w: 2, h: 2 })

    expect(fitted.w).toBe(4)
    expect(fitted.h).toBe(4)
  })

  it('never exceeds the module maximum, leaving the rest as the next bay', () => {
    // The grid engine holds the same maximum and would clamp it anyway; doing
    // it here keeps the stored layout honest about what is drawn.
    const fitted = fitToFrame(def({ w: 2, h: 3 }, { w: 12, h: 5 }), { x: 0, y: 0, w: 12, h: 9 })

    expect(fitted.w).toBe(12)
    expect(fitted.h).toBe(5)
  })

  it('keeps the frame origin', () => {
    expect(fitToFrame(def({ w: 2, h: 2 }), { x: 7, y: 13, w: 4, h: 4 })).toMatchObject({
      x: 7,
      y: 13,
    })
  })
})

describe('canFitFrame', () => {
  it('accepts a frame the module minimum sits inside', () => {
    expect(canFitFrame({ minSize: { w: 4, h: 3 } }, { x: 0, y: 0, w: 4, h: 3 })).toBe(true)
  })

  it('rejects a frame narrower or shorter than the minimum', () => {
    expect(canFitFrame({ minSize: { w: 4, h: 3 } }, { x: 0, y: 0, w: 3, h: 3 })).toBe(false)
    expect(canFitFrame({ minSize: { w: 4, h: 3 } }, { x: 0, y: 0, w: 4, h: 2 })).toBe(false)
  })
})
