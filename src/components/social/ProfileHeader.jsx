import { AlertTriangle, CalendarDays, ExternalLink, ImageOff, Loader2, Sprout, UserCheck, UserPlus, Wallet } from 'lucide-react'
import ClaimedTokens from './ClaimedTokens'
import ChatAvatar from './ChatAvatar'
import { useFollow } from '../../hooks/useFollow'
import { useWalletAge } from '../../hooks/useWalletAge'
import { isSafeAvatarSrc } from '../../utils/avatarImage'
import { formatAddress, formatCompactCount } from '../../utils/formatters'
import { FRESH_WALLET_DAYS, isFreshWallet, walletAgeLabel } from '../../utils/walletAge'

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
  onRemovePicture,
  tab,
  onTab,
  /* Opens a claimed token's page. Optional: the header renders inside the
     social section too, which has no route to one, and a claim there is a
     line of text rather than a link. */
  onOpenToken,
  /* Opens /u/<who>/followers or /following. Optional, for the same reason as
     onOpenToken: this header is drawn in places that have no route to a page,
     and there the counts stay as counts. */
  onOpenList,
  /* Whether to draw the tab strip at all. False while a follow list is
     showing: the tabs would be switching a feed that is not on screen, and a
     tab that does nothing when pressed is how a tab strip teaches people it
     is decoration. */
  showTabs = true,
  /** How many posts this account has saved. Only ever its own - the Saved
   *  tab exists only on your own page. */
  savedCount = null,
}) {
  const { counts, following, canFollow, busy, error, toggle } = useFollow(address)

  /*
   * How old the wallet is. Cached on the profile row once anybody has looked
   * it up, so this is a read almost every time - see useWalletAge.
   */
  const firstSeenAt = useWalletAge(address, profile?.firstSeenAt)
  const ageLabel = walletAgeLabel(firstSeenAt)
  const fresh = isFreshWallet(firstSeenAt)

  const name = profile?.handle || formatAddress(address)
  const uploaded = isSafeAvatarSrc(profile?.bannerUrl)

  return (
    <header className="xp-head">
      {/*
        An uploaded banner when there is one, a gradient drawn from the address
        when there is not - so a profile that has never uploaded anything is
        still distinguishable, and the upload is an upgrade rather than a
        requirement.

        Checked before it reaches a style, even though it came from our own
        database: the column is readable with the anon key, and the cost of
        checking is a regex against the cost of one bad write becoming a URL
        the browser fetches.
      */}
      <div
        className={`xp-banner ${uploaded ? 'is-image' : ''}`}
        style={uploaded ? { backgroundImage: `url(${JSON.stringify(profile.bannerUrl)})` } : bannerStyle(address)}
        aria-hidden="true"
      />

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
          {/*
            No edit control here, deliberately.
            
            This page is what everybody else sees, and putting an editor on it
            makes that ambiguous - you end up unsure whether you are looking at
            your profile or working on it. Editing lives in one place, behind
            the account button, so the page is only ever the finished thing.
          */}
          {canFollow && (
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
          )}

          {isModerator && !isMine && (profile?.avatarUrl || uploaded) && (
            <button type="button" className="xp-btn is-danger" onClick={onRemovePicture}>
              <ImageOff size={13} />
              Remove images
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

        {/*
          What this account has claimed. Under the bio rather than beside the
          name: a badge next to somebody's display name is read as a property
          of the person, and this is a property of some tokens they sent
          transactions for.
        */}
        <ClaimedTokens address={address} onOpenToken={onOpenToken} />

        <div className="xp-meta font-mono">
          {profile?.createdAt && (
            <span className="xp-meta-item" title={new Date(profile.createdAt).toLocaleString()}>
              <CalendarDays size={12} />
              Joined {formatJoined(profile.createdAt)}
            </span>
          )}

          {/*
            When the chain first saw this address, beside when they joined
            here - and the pair is the point. "Joined last week" with "first
            seen March 2024" is somebody who has been around and only just
            signed up; both saying last week is a wallet created to say
            whatever it is about to say.

            Drawn only when we know. An address nobody has looked up yet, or
            one the explorer has no record of, shows nothing rather than a
            guess - walletAgeLabel returns null and this renders nothing,
            because "first seen" with the wrong date is worse than silence on
            a page read to decide whether to trust somebody.
          */}
          {ageLabel && (
            <span
              className="xp-meta-item"
              title={`${new Date(firstSeenAt).toLocaleString()} - the first transaction this address appears in, according to the block explorer`}
            >
              <Wallet size={12} />
              {ageLabel}
            </span>
          )}

          {/*
            A new wallet is said in words, not left to arithmetic on a date.

            This is the one piece of on-chain identity that earns its place on
            every profile by default: the risk this site carries is somebody
            being talked into a token by an account that did not exist last
            month, and a reader should not have to work that out from a month
            name. Never the inverse claim - nothing here says an account is
            trustworthy for being old.
          */}
          {fresh && (
            <span className="xp-meta-item is-fresh" title={`Under ${FRESH_WALLET_DAYS} days old`}>
              <Sprout size={12} />
              New wallet
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
            to stop and parse.

            Pressable now, each one opening its own URL. They have been on this
            page since 0008 and have never been openable, which made them
            trivia - a number you cannot follow is a number you cannot do
            anything with, and on a site this small a follower list is how the
            next person worth reading gets found. */}
        <div className="xp-counts font-mono">
          <Count
            value={counts.following}
            label="Following"
            onOpen={onOpenList && (() => onOpenList('following'))}
          />
          <Count
            value={counts.followers}
            label={counts.followers === 1 ? 'Follower' : 'Followers'}
            onOpen={onOpenList && (() => onOpenList('followers'))}
          />
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

      {/*
        Posts and Replies, because somebody's half of ten conversations is not
        the same as the things they chose to write.

        Two, not four. The roadmap asks for Media and Likes as well, and both
        are deliberately absent until there is something behind them:

        - Media would be empty on every profile in the app, because a post
          cannot carry an image yet. That is Batch 3's work. A tab that is
          always empty is worse than no tab - it reads as a feature that is
          broken rather than one that has not arrived.
        - Likes has nothing to list either. Reactions exist on chat messages
          and not on posts; there is no `post_reactions` table. Adding the tab
          first would mean inventing the table to fill it, which is a different
          batch's decision.

        Both are in docs/social-roadmap.md, in the batch that can actually
        deliver them.
      */}
      {showTabs && (
        <nav className="xp-tabs" role="tablist">
          <Tab id="posts" current={tab} onSelect={onTab} count={postCount}>
            Posts
          </Tab>
          <Tab id="replies" current={tab} onSelect={onTab} count={replyCount}>
            Replies
          </Tab>
          {/* Batch 3 delivers the thing this tab lists, which is why it
              appears now and was deliberately absent before: a tab that is
              empty on every profile in the app reads as a broken feature
              rather than an unbuilt one. */}
          <Tab id="media" current={tab} onSelect={onTab} count={null}>
            Media
          </Tab>
          {/*
            "Reacted", not "Likes".
            
            There is no single like on this site - there are six reactions,
            and 👀 "Watching" on a scam warning is not an endorsement of it.
            A tab called Likes would be claiming an approval nobody gave, so
            it is named for what it actually lists and each row says which
            reaction it was.
          */}
          <Tab id="reacted" current={tab} onSelect={onTab} count={null}>
            Reacted
          </Tab>
          {/*
            Only on your own page, because only you can see it.
            
            `post_bookmarks` has no read policy for any browser-facing role -
            see 0020 - so there is nothing for this tab to show on anybody
            else's profile, and offering it would be offering a tab that is
            always empty for a reason nobody could discover.
          */}
          {isMine && (
            <Tab id="saved" current={tab} onSelect={onTab} count={savedCount}>
              Saved
            </Tab>
          )}
        </nav>
      )}
    </header>
  )
}

/**
 * One of the two counts.
 *
 * A button when there is somewhere to go and plain text when there is not,
 * rather than a button that does nothing - this header is drawn inside the
 * chat as well, where there is no route to a page, and a pressable number
 * that ignores the press is worse than a number.
 */
function Count({ value, label, onOpen }) {
  const body = (
    <>
      <strong>{formatCompactCount(value)}</strong> {label}
    </>
  )

  if (!onOpen) return <span>{body}</span>

  return (
    <button type="button" className="xp-count" onClick={onOpen}>
      {body}
    </button>
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
