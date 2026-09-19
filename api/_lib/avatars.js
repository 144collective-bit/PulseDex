import { MAX_AVATAR_BYTES } from '../../src/utils/avatarUpload.js'

/**
 * Where profile pictures are kept, and the three things anything does to them.
 *
 * Shared rather than living in the upload endpoint, because removal has two
 * other callers and they must not each have their own idea of what removal
 * means. A moderator taking down a picture and a block landing on an account
 * have to clear the same bytes from the same bucket as the owner deleting it
 * themselves - if one of them only nulls the column, the picture is still
 * sitting on a public CDN URL that the last person to see it can still open.
 */

/*
 * Public, so the CDN serves the file straight to an `<img>`. Nothing here is
 * private: a profile picture is shown to everyone by definition, and so is a
 * banner.
 *
 * Two buckets rather than one with prefixes, so a size limit and an allowed
 * type list can differ between them - a banner is legitimately several times
 * an avatar, and one bucket would have to permit the larger for both.
 */
export const AVATAR_BUCKET = 'avatars'
export const BANNER_BUCKET = 'banners'

/*
 * Whether the bucket has been confirmed to exist on this instance.
 *
 * A serverless instance handles many requests, and asking Storage to create a
 * bucket that already exists on every upload is a round trip spent learning
 * something that cannot change. Module scope, so it survives between
 * invocations on a warm instance and costs one call on a cold one.
 */
const bucketsReady = new Set()

/**
 * Make sure the bucket exists.
 *
 * Done here, with the service role key, rather than as a step in the
 * migrations. Buckets live in the `storage` schema, and whether a SQL editor
 * session may write to it depends on who is pasting - so a migration step
 * would work for some people and fail for others. This always works, and
 * means there is nothing to set up by hand.
 *
 * An "already exists" answer is success. Two cold instances racing on a first
 * upload is the ordinary case, not an error.
 */
async function ensureBucket(db, bucket, fileSizeLimit) {
  if (bucketsReady.has(bucket)) return

  const { error } = await db.storage.createBucket(bucket, {
    public: true,
    // Enforced by Storage as well as by decodeAvatar, so the limit holds even
    // if something reaches this bucket by a route that skipped the check.
    fileSizeLimit,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  })

  if (error && !/exists/i.test(error.message)) throw new Error(error.message)
  bucketsReady.add(bucket)
}

/** Everything currently stored for one address. */
async function existingObjects(db, bucket, address) {
  const { data, error } = await db.storage.from(bucket).list(address)
  if (error) return []
  return (data || []).map((entry) => `${address}/${entry.name}`)
}

/**
 * Store a picture and answer with the URL it can be read at.
 *
 * The filename is the upload time, not something fixed like `avatar.jpg`, and
 * the reason is the CDN in front of the bucket. A stable path means a changed
 * picture keeps the URL it was cached under, so the old face stays on screen
 * for however long the edge decides - which is exactly the bug somebody
 * reports as "I changed my picture and nothing happened". A new name is a new
 * URL and is never stale.
 *
 * The old files are removed after the new one is stored rather than before, so
 * a failed upload leaves the account with the picture it already had instead
 * of with nothing.
 *
 * @param {{ bytes: Uint8Array, type: string, ext: string }} image
 * @returns {Promise<string>} the public URL
 */
export async function storeImage(db, { bucket, address, image, maxBytes = MAX_AVATAR_BYTES }) {
  await ensureBucket(db, bucket, maxBytes)

  const previous = await existingObjects(db, bucket, address)
  const path = `${address}/${Date.now()}.${image.ext}`

  const { error } = await db.storage
    .from(bucket)
    .upload(path, image.bytes, { contentType: image.type, upsert: false })

  if (error) throw new Error(error.message)

  if (previous.length) await db.storage.from(bucket).remove(previous)

  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** The avatar case, named, because three callers say it and none of them
 *  should have to remember which bucket avatars live in. */
export const storeAvatar = (db, address, image) =>
  storeImage(db, { bucket: AVATAR_BUCKET, address, image })

/**
 * Take an address's picture down: the files, then the column.
 *
 * In that order, and the order matters. Clearing the column first and then
 * failing to delete leaves a file nothing points at, which is untidy; deleting
 * the file first and then failing to clear leaves a column pointing at a URL
 * that 404s, which is a broken image on every message that account ever
 * posted. Untidy beats broken.
 *
 * Does not fail when there is nothing to remove. Every caller reaches this
 * after deciding a picture should not exist, and "it already did not" is that
 * outcome rather than a problem.
 */
export async function removeImage(db, { bucket, address, column, maxBytes = MAX_AVATAR_BYTES }) {
  await ensureBucket(db, bucket, maxBytes)

  const objects = await existingObjects(db, bucket, address)
  if (objects.length) await db.storage.from(bucket).remove(objects)

  const { error } = await db
    .from('profiles')
    .update({ [column]: null, updated_at: new Date().toISOString() })
    .eq('address', address)

  if (error) throw new Error(error.message)
}

/** Taking a picture down, named for the same reason as storeAvatar - and
 *  because a block calls it, where getting the bucket wrong would mean a
 *  silenced account keeping its face. */
export const removeAvatar = (db, address) =>
  removeImage(db, { bucket: AVATAR_BUCKET, address, column: 'avatar_url' })
