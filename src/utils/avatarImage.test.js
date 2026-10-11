import { describe, expect, it } from 'vitest'
import { isSafeAvatarSrc, isSafeAvatarUrl, targetBox } from './avatarImage'

/*
 * `targetBox` is the arithmetic half of the image pipeline, pulled out so it
 * can be checked without a canvas, a bitmap or a browser.
 *
 * It exists because that arithmetic was wrong for months and nothing noticed:
 * the function that drew into the canvas took `width`, `height` and `quality`
 * and used none of them, so every banner was a 256x256 square stretched across
 * a 1200x400 box. Three unused-parameter lint warnings said exactly that and
 * were read as noise. Arithmetic only a browser can exercise is arithmetic
 * nothing checks.
 */
describe('targetBox, cover', () => {
  const cover = (w, h) => targetBox({ width: w, height: h }, { fit: 'cover', width: 1200, height: 400 })

  it('fills the canvas at the asked-for size', () => {
    const box = cover(3000, 2000)
    expect(box.canvasWidth).toBe(1200)
    expect(box.canvasHeight).toBe(400)
  })

  it('takes a centred strip out of a source taller than the target', () => {
    // 1000x1000 into 3:1 means the full width and a third of the height.
    const box = cover(1000, 1000)
    expect(box.sWidth).toBe(1000)
    expect(box.sHeight).toBeCloseTo(1000 / 3, 5)
    expect(box.sx).toBe(0)
    expect(box.sy).toBeCloseTo((1000 - 1000 / 3) / 2, 5)
  })

  it('takes a centred strip out of a source wider than the target', () => {
    // 4000x500 is 8:1, wider than 3:1, so the height is all of it.
    const box = cover(4000, 500)
    expect(box.sHeight).toBe(500)
    expect(box.sWidth).toBeCloseTo(500 * 3, 5)
    expect(box.sy).toBe(0)
    expect(box.sx).toBeCloseTo((4000 - 1500) / 2, 5)
  })

  it('takes the whole source when the ratios already agree', () => {
    const box = cover(900, 300)
    expect(box.sx).toBe(0)
    expect(box.sy).toBe(0)
    expect(box.sWidth).toBeCloseTo(900, 5)
    expect(box.sHeight).toBeCloseTo(300, 5)
  })

  it('makes a square canvas for a square target', () => {
    const box = targetBox({ width: 4000, height: 3000 }, { fit: 'cover', width: 256, height: 256 })
    expect(box.canvasWidth).toBe(256)
    expect(box.canvasHeight).toBe(256)
    // A square crop out of a landscape source is the full height.
    expect(box.sWidth).toBeCloseTo(3000, 5)
    expect(box.sHeight).toBeCloseTo(3000, 5)
  })
})

describe('targetBox, contain', () => {
  const contain = (w, h) => targetBox({ width: w, height: h }, { fit: 'contain', maxEdge: 1280 })

  it('keeps the whole source, never cropping', () => {
    const box = contain(4000, 1000)
    expect(box.sx).toBe(0)
    expect(box.sy).toBe(0)
    expect(box.sWidth).toBe(4000)
    expect(box.sHeight).toBe(1000)
  })

  it('scales the longest edge down to the box', () => {
    const box = contain(4000, 1000)
    expect(box.canvasWidth).toBe(1280)
    expect(box.canvasHeight).toBe(320)
  })

  it('scales by the height when the image is tall', () => {
    const box = contain(1000, 4000)
    expect(box.canvasHeight).toBe(1280)
    expect(box.canvasWidth).toBe(320)
  })

  /*
   * A screenshot of a chart is the thing most often posted here, and a centre
   * crop of one takes the axis off the bottom. The aspect ratio surviving is
   * the whole reason this mode exists.
   */
  it('preserves the aspect ratio', () => {
    const box = contain(1920, 1080)
    expect(box.canvasWidth / box.canvasHeight).toBeCloseTo(1920 / 1080, 2)
  })

  // Enlarging only adds bytes and blur.
  it('leaves an image smaller than the box at its own size', () => {
    const box = contain(600, 400)
    expect(box.canvasWidth).toBe(600)
    expect(box.canvasHeight).toBe(400)
  })

  it('never produces a zero-pixel canvas from an extreme ratio', () => {
    const box = contain(10_000, 1)
    expect(box.canvasWidth).toBe(1280)
    expect(box.canvasHeight).toBeGreaterThanOrEqual(1)
  })

  it('survives a source reporting no size', () => {
    const box = contain(0, 0)
    expect(box.canvasWidth).toBeGreaterThanOrEqual(1)
    expect(box.canvasHeight).toBeGreaterThanOrEqual(1)
  })
})

/*
 * The guards, which were already here and had no test. They decide what may
 * reach an <img src>, which makes them worth pinning before anything else
 * starts reusing them - and Batch 3 does, for a post's image.
 */
describe('isSafeAvatarUrl', () => {
  it('accepts an image data URL', () => {
    expect(isSafeAvatarUrl('data:image/jpeg;base64,abc')).toBe(true)
    expect(isSafeAvatarUrl('data:image/png;base64,abc')).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isSafeAvatarUrl('data:text/html;base64,abc')).toBe(false)
    expect(isSafeAvatarUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeAvatarUrl('https://example.com/a.png')).toBe(false)
    expect(isSafeAvatarUrl(null)).toBe(false)
  })
})

describe('isSafeAvatarSrc', () => {
  it('accepts https and image data URLs', () => {
    expect(isSafeAvatarSrc('https://example.com/a.png')).toBe(true)
    expect(isSafeAvatarSrc('data:image/jpeg;base64,abc')).toBe(true)
  })

  /*
   * http is refused as well as the obvious ones. An <img> cannot run a
   * javascript: URL in any browser still shipping, but "cannot" there rests on
   * the browser rather than on us - and the same string tends to get reused as
   * an <a href>, where it very much can.
   */
  it('refuses http, javascript and anything unparseable', () => {
    expect(isSafeAvatarSrc('http://example.com/a.png')).toBe(false)
    expect(isSafeAvatarSrc('javascript:alert(1)')).toBe(false)
    expect(isSafeAvatarSrc('//example.com/a.png')).toBe(false)
    expect(isSafeAvatarSrc('')).toBe(false)
    expect(isSafeAvatarSrc(null)).toBe(false)
    expect(isSafeAvatarSrc(42)).toBe(false)
  })
})
