import { describe, it, expect } from 'vitest'
import { decodeAvatar, REJECTED_AVATAR, MAX_AVATAR_BYTES } from './avatarUpload'

/*
 * Checking an uploaded picture.
 *
 * The browser resizes and re-encodes before sending, and none of that is a
 * control - the endpoint takes a POST from anywhere. These are the checks that
 * hold when the sender is curl rather than our own canvas.
 */

const toDataUrl = (type, bytes) => {
  const binary = String.fromCharCode(...bytes)
  return `data:${type};base64,${btoa(binary)}`
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]

describe('decodeAvatar', () => {
  it('accepts each format the profile editor can produce', () => {
    expect(decodeAvatar(toDataUrl('image/jpeg', JPEG))).toMatchObject({ ok: true, ext: 'jpg' })
    expect(decodeAvatar(toDataUrl('image/png', PNG))).toMatchObject({ ok: true, ext: 'png' })
    expect(decodeAvatar(toDataUrl('image/gif', GIF))).toMatchObject({ ok: true, ext: 'gif' })
    expect(decodeAvatar(toDataUrl('image/webp', WEBP))).toMatchObject({ ok: true, ext: 'webp' })
  })

  it('refuses a file whose bytes disagree with its label', () => {
    /*
     * The check that matters most. Without it, something announcing itself as
     * image/png while holding anything else would be stored and then served
     * from our own domain under a name saying it is a picture.
     */
    const lying = toDataUrl('image/png', JPEG)
    expect(decodeAvatar(lying)).toEqual({ ok: false, reason: REJECTED_AVATAR.mismatch })
  })

  it('refuses bytes that are not an image at all', () => {
    const html = [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45] // <!DOCTYPE
    expect(decodeAvatar(toDataUrl('image/png', html))).toEqual({
      ok: false,
      reason: REJECTED_AVATAR.unsupported,
    })
  })

  it('refuses anything that is not a base64 image data URL', () => {
    for (const value of [
      undefined,
      null,
      42,
      '',
      'https://example.com/pic.png',
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:image/png,notbase64',
    ]) {
      expect(decodeAvatar(value)).toEqual({ ok: false, reason: REJECTED_AVATAR.notDataUrl })
    }
  })

  it('refuses a picture past the size cap', () => {
    // Checked from the encoded length before decoding, so an oversized upload
    // is refused without being allocated.
    const huge = 'A'.repeat(Math.ceil((MAX_AVATAR_BYTES + 1024) * 4 / 3))
    expect(decodeAvatar(`data:image/jpeg;base64,${huge}`)).toEqual({
      ok: false,
      reason: REJECTED_AVATAR.tooLarge,
    })
  })

  it('returns the bytes it decoded, not the string it was given', () => {
    const result = decodeAvatar(toDataUrl('image/jpeg', JPEG))
    expect(result.ok).toBe(true)
    expect(Array.from(result.bytes)).toEqual(JPEG)
  })
})
