/**
 * Profile picture handling.
 *
 * Pictures are stored as data URLs alongside the rest of the profile, which
 * means they live in localStorage and count against a quota of a few megabytes
 * shared with everything else. A phone photo is several megabytes on its own,
 * so nothing is stored as picked: every image is decoded, cropped square and
 * re-encoded at a fixed size first.
 */

/** Longest edge of a stored avatar, in pixels. */
const OUTPUT_SIZE = 256

/**
 * A banner's dimensions.
 *
 * 3:1, which is roughly what every social banner has settled on, and wide
 * enough that it still reads as a band rather than a photograph on a desktop
 * window. Capped at 1200 across rather than the 1500 X uses: the extra pixels
 * cost file size that the byte limit then has to allow, and nothing on this
 * page renders a banner larger than about 900.
 */
const BANNER_WIDTH = 1200
const BANNER_HEIGHT = 400

/**
 * The box a post's image is fitted inside.
 *
 * Fitted, not cropped - see fileToPostImage. 1280 is enough for a chart
 * screenshot to stay readable, which is most of what gets posted here, and
 * small enough that the result is tens of kilobytes rather than hundreds.
 */
const POST_MAX_EDGE = 1280

/** Rejected before decoding - the browser should not be asked to parse a 40MB file. */
const MAX_INPUT_BYTES = 8 * 1024 * 1024

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

export const ACCEPT_ATTRIBUTE = ACCEPTED.join(',')

/**
 * Turn a picked file into a small square data URL.
 *
 * Resolves to `{ dataUrl }` or `{ error }` rather than throwing, because every
 * failure here is something the person needs to read: the wrong file type, a
 * photo that is too large, an image the browser cannot decode.
 */
export async function fileToAvatarDataUrl(file) {
  return decodeAndDraw(file, { fit: 'cover', width: OUTPUT_SIZE, height: OUTPUT_SIZE })
}

/**
 * The same, for a banner: wide rather than square, and a little more forgiving
 * on quality because the result is stretched across a page rather than shown
 * at 84 pixels.
 */
export async function fileToBannerDataUrl(file) {
  return decodeAndDraw(file, {
    fit: 'cover',
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    quality: 0.82,
  })
}

/**
 * An image fitted inside a box, for a post.
 *
 * Contain rather than cover, which is the opposite of what an avatar and a
 * banner do, and the difference is what the image is for. An avatar fills a
 * known frame, so cropping to fill it is right. A post's image is the content:
 * most of what gets posted here is a screenshot of a chart, and a centre crop
 * of one takes the axis off the bottom and the pair name off the top. So the
 * whole picture is kept and the layout is told what shape it is - hence the
 * dimensions coming back, which get stored so the feed can reserve the right
 * box before the bytes arrive.
 *
 * An image already smaller than the box is left at its own size rather than
 * scaled up, which would only add bytes and blur.
 *
 * Resolves to `{ dataUrl, width, height }` or `{ error }`.
 */
export async function fileToPostImage(file) {
  return decodeAndDraw(file, { fit: 'contain', maxEdge: POST_MAX_EDGE, quality: 0.85 })
}

/**
 * Decode a picked file, draw it into the target box, and re-encode.
 *
 * 'cover' takes the largest centred region of the source with the target's
 * aspect ratio, so the result fills its frame - letterboxing instead would
 * mean bars whose colour is somebody else's choice showing through a layout
 * that did not ask for them. 'contain' scales the whole image down to fit
 * inside `maxEdge` and reports the size it ended up.
 *
 * This function used to take `width`, `height` and `quality` and use none of
 * them: the canvas was hardcoded to OUTPUT_SIZE square and the quality to
 * 0.85, so every banner was a 256x256 JPEG stretched across a 1200x400 box.
 * Three unused-parameter lint warnings said so and were read as noise. They
 * are the whole bug.
 */
async function decodeAndDraw(file, { fit, width, height, maxEdge, quality = 0.85 }) {
  if (!file) return { error: 'No file selected.' }

  if (!ACCEPTED.includes(file.type)) {
    return { error: 'Pick a PNG, JPEG, WebP or GIF image.' }
  }

  if (file.size > MAX_INPUT_BYTES) {
    return { error: 'That image is over 8MB. Please choose a smaller one.' }
  }

  let bitmap
  try {
    /*
     * `imageOrientation: 'from-image'` applies the EXIF rotation tag while
     * decoding, and it has to be asked for - the default leaves it alone.
     *
     * This matters precisely because the canvas re-encode strips EXIF: a phone
     * photo is stored as landscape bytes plus "rotate 90", so discarding the
     * tag without applying it first is what turns every portrait photo
     * sideways. Stripping metadata is the feature; applying orientation before
     * stripping it is what makes the feature not break the picture.
     */
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    /*
     * Not every browser accepts the options argument. Rather than lose the
     * decode entirely, try again without it - a possibly-sideways photo beats
     * refusing the upload.
     */
    try {
      bitmap = await createImageBitmap(file)
    } catch {
      return { error: 'That image could not be read. It may be corrupt.' }
    }
  }

  try {
    const box = targetBox(bitmap, { fit, width, height, maxEdge })

    const canvas = document.createElement('canvas')
    canvas.width = box.canvasWidth
    canvas.height = box.canvasHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return { error: 'Your browser could not process that image.' }

    ctx.drawImage(
      bitmap,
      box.sx,
      box.sy,
      box.sWidth,
      box.sHeight,
      0,
      0,
      box.canvasWidth,
      box.canvasHeight,
    )

    // JPEG rather than PNG: a photo re-encoded as PNG can be several hundred
    // kilobytes, which is a meaningful slice of the storage quota.
    const dataUrl = canvas.toDataURL('image/jpeg', quality)

    if (!dataUrl.startsWith('data:image/')) {
      return { error: 'That image could not be processed.' }
    }

    return { dataUrl, width: canvas.width, height: canvas.height }
  } finally {
    bitmap.close?.()
  }
}

/**
 * Which part of the source goes where on the canvas.
 *
 * Pulled out as a pure function of numbers so the arithmetic can be checked
 * without a canvas, a bitmap or a browser - see avatarImage.test.js. It is the
 * half of the bug above that was wrong, and arithmetic that only a browser can
 * exercise is arithmetic nothing checks.
 *
 * @param {{ width: number, height: number }} source
 */
export function targetBox(source, { fit, width, height, maxEdge }) {
  const sw = Math.max(1, source.width)
  const sh = Math.max(1, source.height)

  if (fit === 'contain') {
    // Never scaled up: an image smaller than the box keeps its own size, since
    // enlarging it only adds bytes and blur.
    const scale = Math.min(1, maxEdge / Math.max(sw, sh))
    return {
      sx: 0,
      sy: 0,
      sWidth: sw,
      sHeight: sh,
      canvasWidth: Math.max(1, Math.round(sw * scale)),
      canvasHeight: Math.max(1, Math.round(sh * scale)),
    }
  }

  // Cover: the largest centred region of the source with the target's aspect
  // ratio, scaled to fill the canvas exactly.
  const targetRatio = width / height
  const sourceRatio = sw / sh

  const sWidth = sourceRatio > targetRatio ? sh * targetRatio : sw
  const sHeight = sourceRatio > targetRatio ? sh : sw / targetRatio

  return {
    sx: (sw - sWidth) / 2,
    sy: (sh - sHeight) / 2,
    sWidth,
    sHeight,
    canvasWidth: width,
    canvasHeight: height,
  }
}

/**
 * Guard anything read back from storage before it reaches an `src`.
 *
 * Storage is editable by hand, so a stored value is untrusted input. Only
 * image data URLs are allowed through - this is what stops a stored
 * `javascript:` or a remote URL being rendered.
 */
export function isSafeAvatarUrl(value) {
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(value)
}

/**
 * The same guard, widened to the pictures the server holds.
 *
 * A published avatar is an https URL in Supabase Storage rather than a data
 * URL, so `isSafeAvatarUrl` refuses it - correctly, since that function guards
 * what comes back out of localStorage, which is hand-editable. This one guards
 * what may reach an `<img src>` from either source.
 *
 * https and nothing else. An `<img>` cannot run a `javascript:` URL in any
 * browser still shipping, but "cannot" there rests on the browser rather than
 * on us, and the same string tends to get reused as an `<a href>` where it
 * very much can.
 */
export function isSafeAvatarSrc(value) {
  if (isSafeAvatarUrl(value)) return true
  if (typeof value !== 'string') return false

  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}
