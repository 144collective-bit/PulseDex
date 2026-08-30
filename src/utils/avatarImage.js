/**
 * Profile picture handling.
 *
 * Pictures are stored as data URLs alongside the rest of the profile, which
 * means they live in localStorage and count against a quota of a few megabytes
 * shared with everything else. A phone photo is several megabytes on its own,
 * so nothing is stored as picked: every image is decoded, cropped square and
 * re-encoded at a fixed size first.
 */

/** Longest edge of the stored image, in pixels. */
const OUTPUT_SIZE = 256

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
  if (!file) return { error: 'No file selected.' }

  if (!ACCEPTED.includes(file.type)) {
    return { error: 'Pick a PNG, JPEG, WebP or GIF image.' }
  }

  if (file.size > MAX_INPUT_BYTES) {
    return { error: 'That image is over 8MB. Please choose a smaller one.' }
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { error: 'That image could not be read. It may be corrupt.' }
  }

  try {
    // Centre crop to a square so portraits and landscapes both fill the frame
    // rather than being squashed.
    const edge = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - edge) / 2
    const sy = (bitmap.height - edge) / 2

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE

    const ctx = canvas.getContext('2d')
    if (!ctx) return { error: 'Your browser could not process that image.' }

    ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

    // JPEG rather than PNG: a photo re-encoded as PNG can be several hundred
    // kilobytes, which is a meaningful slice of the storage quota.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    if (!dataUrl.startsWith('data:image/')) {
      return { error: 'That image could not be processed.' }
    }

    return { dataUrl }
  } finally {
    bitmap.close?.()
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
