import Identicon from './Identicon'
import { PRESET_AVATARS } from '../../context/UserProfileContext'
import { isSafeAvatarSrc } from '../../utils/avatarImage'

/**
 * Whoever posted this, as a 32-pixel circle.
 *
 * Three sources in a fixed order, and the order is the whole content of this
 * file. An uploaded picture wins, because choosing one is the most deliberate
 * thing anybody does here. A preset comes next. The generated mark is last and
 * is what almost everyone gets.
 *
 * Extracted from ChatMessageRow once the profile card needed the same three
 * cases. Two copies of a precedence rule drift, and the way this one drifts is
 * that a picture shows in the chat and a preset shows on the card - so the
 * face beside the message and the face on the profile it opens are different
 * people's.
 *
 * Marked aria-hidden throughout. Every place that draws one states the author
 * in text beside it, and "image" announced before a name that follows is a
 * stop for nothing.
 */
export default function ChatAvatar({ address, avatarUrl, avatarId, size = 32 }) {
  /*
   * Checked even though it came from our own database, because the column is
   * readable with the anon key and this string is going into an `<img src>`.
   * The cost of checking is a regex; the cost of not is that the one path that
   * ever writes something else to that column is the whole of the defence.
   */
  if (isSafeAvatarSrc(avatarUrl)) {
    return (
      <img
        className="chat-avatar-img"
        style={{ width: size, height: size, flexBasis: size }}
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        /* Somebody else's face, from a CDN we do not want telling that CDN
           which page the reader is on. */
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
      />
    )
  }

  const preset = PRESET_AVATARS.find((a) => a.id === avatarId)
  if (preset) {
    return (
      <div
        className="chat-avatar"
        style={{ background: preset.bg, width: size, height: size, flexBasis: size }}
        aria-hidden="true"
      >
        <span style={{ fontSize: Math.round(size * 0.47) }}>{preset.icon}</span>
      </div>
    )
  }

  return <Identicon address={address} size={size} />
}
