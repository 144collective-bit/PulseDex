import { AlertTriangle, CalendarDays, ExternalLink, ImageOff, Loader2, Settings2, UserCheck, UserPlus } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { useFollow } from '../../hooks/useFollow'
import { formatAddress, formatCompactCount } from '../../utils/formatters'

/**
 * The top of somebody's page.
 *
 * Laid out the way every social profile has been since Twitter settled it: a
 * banner, an avatar overlapping its lower edge, the name and handle beneath,
 * then bio, then metadata, then counts, with the action on the right at the
 * same height as the avatar. That arrangement is worth copying because people
 * already know where to look - the eye goes to the picture, then left to
 * right across the name, and the Follow button is where the hand expects it.
 *
 * The colours are this app's, not X's. Everything here sits on the same glass
 * and brand gradients as the rest of PulseDex, because a page that borrowed
 * another product's palette would look like an embed rather than a page.
 *
 * The banner is generated from the address rather than uploaded. A banner
 * upload is a second image pipeline - storage, moderation, a second thing to
 * take down when somebody posts something vile - for decoration. Derived from
 * the address, every profile is distinguishable and none of that applies.
 */
export default function ProfileHeader({
  profile,
  address,
  postCount,
  replyCount,
  isMine,
  isModerator,
  onEditProfile,
  onRemovePicture,
  tab,
  onTab,
}) {
  const { counts, following, canFollow, busy, error, toggle } = useFollow(address)

  const name = profile?.handle || formatAddress(address)

  return (
    <header className="xp-head">
      {/* Derived from the address, so two profiles are never the same and
          nothing had to be uploaded to make that true. */}
      <div className="xp-banner" style={bannerStyle(address)} aria-hidden="true" />

      <div className="xp-identity">
        <div className="xp-avatar">
          <ChatAvatar
            address={address}
            avatarUrl={profile?.avatarUrl}
            avatarId={profile?.avatarId}
            size={84}
          />
        </div>

        <div className="xp-actions">
          {isMine ? (
            <button type="button" className="xp-btn" onClick={onEditProfile}>
              <Settings2 size={13} />
              Edit profile
            </button>
          ) : (
            canFollow && (
              /*
               * Reads "Following" when you are, and the hover state says
               * "Unfollow" - the pattern everybody already knows, and the
               * reason it exists: a button that says "Unfollow" at rest looks
               * like an instruction rather than a state.
               */
              <button
                type="button"
                className={`xp-btn ${following ? 'is-following' : 'is-follow'}`}
                onClick={toggle}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={13} className="chat-spin" />
                ) : following ? (
                  <UserCheck size={13} />
                ) : (
                  <UserPlus size={13} />
                )}
                <span className="xp-btn-label">{following ? 'Following' : 'Follow'}</span>
                <span className="xp-btn-hover">Unfollow</span>
              </button>
            )
          )}

          {isModerator && !isMine && profile?.avatarUrl && (
            <button type="button" className="xp-btn is-danger" onClick={onRemovePicture}>
              <ImageOff size={13} />
              Remove picture
            </button>
          )}
        </div>
      </div>

      <div className="xp-body">
        <h1 className="xp-name">{name}</h1>

        {/*
         * The address, in full, under the name where a handle would go on X.
         * It is what identifies anyone here - a display name is chosen, and on
         * a site about which tokens to buy, being mistaken for somebody
         * trusted is worth money. Selectable, because the reason to show it is
         * so somebody can compare it with one they already hold.
         */}
        <p className="xp-address font-mono">{address}</p>

        {profile?.bio && <p className="xp-bio">{profile.bio}</p>}

        <div className="xp-meta font-mono">
          {profile?.createdAt && (
            <span className="xp-meta-item" title={new Date(profile.createdAt).toLocaleString()}>
              <CalendarDays size={12} />
              Joined {formatJoined(profile.createdAt)}
            </span>
          )}

          {profile?.links?.map((link) => (
            <a
              key={link.url}
              className="xp-meta-item is-link"
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
            >
              <ExternalLink size={12} />
              {link.host}
            </a>
          ))}
        </div>

        {/* Counts read as one line, following then followers, which is the
            order every social profile uses and therefore the one nobody has
            to stop and parse. */}
        <div className="xp-counts font-mono">
          <span>
            <strong>{formatCompactCount(counts.following)}</strong> Following
          </span>
          <span>
            <strong>{formatCompactCount(counts.followers)}</strong>{' '}
            {counts.followers === 1 ? 'Follower' : 'Followers'}
          </span>
        </div>

        <p className="chat-profile-warning">
          <AlertTriangle size={11} />
          Anyone can write anything here. Check the address, not the name.
        </p>

        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Posts and Replies, because somebody's half of ten conversations is
          not the same as the things they chose to write. */}
      <nav className="xp-tabs" role="tablist">
        <Tab id="posts" current={tab} onSelect={onTab} count={postCount}>
          Posts
        </Tab>
        <Tab id="replies" current={tab} onSelect={onTab} count={replyCount}>
          Replies
        </Tab>
      </nav>
    </header>
  )
}

function Tab({ id, current, onSelect, count, children }) {
  const active = current === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`xp-tab ${active ? 'active' : ''}`}
      onClick={() => onSelect(id)}
    >
      {children}
      {count !== null && count !== undefined && <span className="xp-tab-count">{count}</span>}
    </button>
  )
}

/**
 * A banner from an address.
 *
 * Two hues taken from different slices of the address, so the pair is stable
 * for one account and different between accounts, kept dark enough that white
 * text over it stays readable - a generated banner that sometimes comes out
 * pale is a page that is sometimes unreadable.
 */
function bannerStyle(address) {
  const seed = (address || '').slice(2)
  const a = parseInt(seed.slice(0, 6) || '0', 16) % 360
  const b = parseInt(seed.slice(6, 12) || '0', 16) % 360

  return {
    background:
      `linear-gradient(120deg, hsl(${a} 55% 22%), hsl(${b} 60% 16%)),` +
      ' radial-gradient(120% 140% at 15% 0%, rgba(0, 229, 255, 0.25), transparent 60%)',
  }
}

function formatJoined(iso) {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return 'recently'
  return new Date(at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
