/**
 * Checking an uploaded picture, on the server.
 *
 * The browser already decodes, crops and re-encodes every image to a 256px
 * JPEG before it is sent - see src/utils/avatarImage.js. None of that is a
 * control. The endpoint is reachable with curl, so whatever arrives has to be
 * treated as bytes somebody chose rather than as the output of our own canvas.
 *
 * What is checked here is what can be checked without decoding an image:
 * the declared type, the real type from the file's first bytes, and the size.
 * Dimensions are not, because that needs an image library, and a decoder in a
 * serverless function is a large dependency and a large attack surface to add
 * for a limit the byte cap already makes moot.
 */

/**
 * The largest picture accepted, after decoding from base64.
 *
 * The browser produces 20-40KB at 256px, so this is several times what an
 * honest client sends - room for a different encoder without inviting someone
 * to fill a storage bucket a megabyte at a time.
 */
export const MAX_AVATAR_BYTES = 256 * 1024

/**
 * The largest banner accepted.
 *
 * Four times an avatar, because a banner legitimately is: it spans the page
 * where an avatar is 84 pixels across, and the same limit would force a
 * quality nobody would want behind their name.
 */
export const MAX_BANNER_BYTES = 1024 * 1024

/**
 * The first bytes of each format accepted, and what they really are.
 *
 * Checked because the declared type in a data URL is a claim by the sender.
 * A file announcing itself as image/png while holding something else would
 * otherwise be stored and served from our own domain under a name that says
 * it is a picture.
 */
const SIGNATURES = [
  { type: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { type: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP is RIFF....WEBP: the size sits between, so the tail is checked apart
  // from the head.
  { type: 'image/webp', ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] },
]

export const REJECTED_AVATAR = {
  notDataUrl: 'notDataUrl',
  tooLarge: 'tooLarge',
  unsupported: 'unsupported',
  mismatch: 'mismatch',
}

const startsWith = (bytes, expected, offset = 0) =>
  expected.every((b, i) => bytes[offset + i] === b)

/**
 * Turn a data URL into bytes worth storing, or say why not.
 *
 * The size limit is a parameter rather than the constant it used to be,
 * because a banner is legitimately several times an avatar and one number
 * cannot serve both without being wrong for one of them.
 *
 * @param {unknown} dataUrl
 * @param {number} [maxBytes]
 * @returns {{ ok: true, bytes: Uint8Array, type: string, ext: string }
 *          | { ok: false, reason: string }}
 */
export function decodeAvatar(dataUrl, maxBytes = MAX_AVATAR_BYTES) {
  if (typeof dataUrl !== 'string') return { ok: false, reason: REJECTED_AVATAR.notDataUrl }

  const match = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim())
  if (!match) return { ok: false, reason: REJECTED_AVATAR.notDataUrl }

  const [, declared, encoded] = match

  /*
   * Size is checked from the encoded length before decoding, not after.
   * Base64 is four characters per three bytes, so the size is known without
   * allocating anything - which matters when the point of the check is to
   * refuse something too big to want in memory.
   */
  const approxBytes = Math.floor((encoded.length * 3) / 4)
  if (approxBytes > maxBytes) return { ok: false, reason: REJECTED_AVATAR.tooLarge }

  let bytes
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  } catch {
    return { ok: false, reason: REJECTED_AVATAR.notDataUrl }
  }

  if (bytes.length > maxBytes) return { ok: false, reason: REJECTED_AVATAR.tooLarge }

  const signature = SIGNATURES.find(
    (s) => startsWith(bytes, s.bytes) && (!s.at8 || startsWith(bytes, s.at8, 8)),
  )
  if (!signature) return { ok: false, reason: REJECTED_AVATAR.unsupported }

  // The bytes win over the label. A file claiming to be a PNG while being
  // something else is refused rather than quietly stored as what it is.
  if (signature.type !== declared) return { ok: false, reason: REJECTED_AVATAR.mismatch }

  return { ok: true, bytes, type: signature.type, ext: signature.ext }
}
