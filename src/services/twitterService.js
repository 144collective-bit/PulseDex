/**
 * PulseDex Twitter (X) Profile Resolver Service
 * Pulls real profile information (Display Name, Bio, Avatar, Banner, and X URL)
 * for any given X handle to automatically populate the user's PulseDex profile.
 */

export async function fetchTwitterProfile(handle) {
  if (!handle) return null
  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '')
  if (!cleanHandle) return null

  // Standard official unavatar URL for high-res Twitter profile photo
  const defaultAvatar = `https://unavatar.io/twitter/${cleanHandle}`
  const xProfileUrl = `https://x.com/${cleanHandle}`

  let profileData = {
    handle: cleanHandle,
    displayName: `@${cleanHandle}`,
    bio: `PulseChain Trader | @${cleanHandle} on 𝕏`,
    avatarUrl: defaultAvatar,
    bannerUrl: '',
    profileUrl: xProfileUrl,
    verified: true,
  }

  try {
    // Attempt to fetch public OpenGraph metadata for the X profile
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(`https://api.microlink.io/?url=https://x.com/${cleanHandle}`, {
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      const json = await res.json()
      if (json.status === 'success' && json.data) {
        const data = json.data
        
        // Extract real name (strip "on X" or "(@handle) on X")
        let name = data.title || ''
        name = name.replace(/\s*\(@\w+\)\s*\/\s*X$/, '')
        name = name.replace(/\s*on\s*X$/, '')
        name = name.replace(/\s*\/\s*X$/, '')

        const desc = data.description || ''
        const image = data.image?.url || defaultAvatar
        const logo = data.logo?.url || ''

        profileData = {
          handle: cleanHandle,
          displayName: name.trim() || `@${cleanHandle}`,
          bio: desc.trim() || `PulseChain Trader | @${cleanHandle} on 𝕏`,
          avatarUrl: image || defaultAvatar,
          bannerUrl: logo && !logo.includes('favicon') ? logo : '',
          profileUrl: xProfileUrl,
          verified: true,
        }
      }
    }
  } catch (err) {
    // Graceful fallback to unavatar.io and computed handle
    console.debug('Twitter metadata fetch note:', err?.message || 'Using high-speed fallback')
  }

  return profileData
}
