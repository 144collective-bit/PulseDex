import { Loader2, UserCheck, UserPlus } from 'lucide-react'
import ChatAvatar from './ChatAvatar'
import { useFollow } from '../../hooks/useFollow'
import { formatAddress } from '../../utils/formatters'

/**
 * One person, in a list of people.
 *
 * The row a discovery page is made of: face, name, a line of bio, and the
 * button. Deliberately not the profile card from the chat - that one is a
 * dialog opened deliberately about one person, so it can afford the full
 * address and a warning. This is scanned, ten at a time, and every extra line
 * is one fewer person visible.
 *
 * The whole row opens the profile except the button, which does not. A row
 * where the action also navigates is a row you cannot press without leaving.
 */
export default function PersonCard({ profile, onOpenProfile }) {
  const { following, canFollow, busy, toggle } = useFollow(profile.address)

  return (
    <div className="person-card">
      <button
        type="button"
        className="person-main"
        onClick={() => onOpenProfile(profile)}
        aria-label={`Profile for ${profile.handle || formatAddress(profile.address)}`}
      >
        <ChatAvatar
          address={profile.address}
          avatarUrl={profile.avatarUrl}
          avatarId={profile.avatarId}
          size={40}
        />

        <span className="person-text">
          <span className="person-name">
            {profile.handle || formatAddress(profile.address)}
          </span>
          <span className="person-address font-mono">{formatAddress(profile.address, 6, 4)}</span>
          {/* One line, clipped. A bio is up to 300 characters and this is a
              list - the full thing is on the page this row opens. */}
          {profile.bio && <span className="person-bio">{profile.bio}</span>}
        </span>
      </button>

      {canFollow && (
        <button
          type="button"
          className={`xp-btn ${following ? 'is-following' : 'is-follow'}`}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={12} className="chat-spin" />
          ) : following ? (
            <UserCheck size={12} />
          ) : (
            <UserPlus size={12} />
          )}
          <span className="xp-btn-label">{following ? 'Following' : 'Follow'}</span>
          <span className="xp-btn-hover">Unfollow</span>
        </button>
      )}
    </div>
  )
}
