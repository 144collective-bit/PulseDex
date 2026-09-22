# Making the social section navigable

The chat is finished as a set of features - rooms, replies, search, token
rooms, dev claims, groups, gating - and is close to unusable as a place. This
is about the second half.

## What is actually wrong

**Nothing can be linked.** `/token/<address>` and `/u/<handle>` are the only
URLs in the app. A room, the feed, a group, the inbox, a single message: none
of them. The consequences are not cosmetic.

- A conversation cannot leave the app. Nobody can paste a room into Telegram,
  which is how anything on a site like this actually spreads.
- A notification cannot open the thing it is about, which is why that item has
  sat unfinished in `social-roadmap.md` since it was written.
- The back button does nothing inside the whole social section.

**The container is called "Chat" and four of its five tabs are not chat.**
Feed, My Profile, Chat Rooms, Discover, Notifications. Somebody looking for
their notifications does not think "Chat".

**Three levels to reach a room.** Chat, then Chat Rooms, then find it in the
sidebar. There is a second and unrelated route to the same room through
Trenches, a token, and that page's CHAT tab - two paths to one place, neither
discoverable from the other.

**Notifications are invisible until you go looking.** The unread badge is on a
sub-tab, so it is only visible once you are already inside the section it
belongs to. On a screener, where people sit watching charts, that is never.

## The decisions

**The trading surfaces are not touched.** Home, Screener, Trenches and
Portfolio stay exactly as they are, and Home stays the landing page. People
come here for charts; a social feed as the front door is a different product,
and that is a decision for another day rather than a side effect of a
navigation cleanup.

**The history API, not a router.** `useTokenRoute` says tabs were kept as
state to avoid "risking the whole shell", and that was right when two surfaces
needed URLs. It is now seven. The answer is to generalise the pattern already
in this codebase - a tested pure parser in `src/utils/`, a thin hook doing the
browser half - rather than to adopt react-router, which would rewrite the
shell this decision exists to protect.

> `vercel.json` already rewrites everything that is not `/api/` to
> `index.html`, so a cold load of `/r/lounge` reaches the app. No
> configuration change is needed for any of this.

**One room concept, one URL shape.** `/r/<slug>` covers a fixed room, a group
and a token room without the caller knowing which it is - `lounge`,
`group-whales` and `token-0x...` are all slugs. The alternative was a path per
kind, which would have put the kind in the URL and made it a thing that
breaks when a room changes kind.

---

## The batches

### Batch 1 - a URL for every surface  <- next

The prerequisite for the rest, and worth shipping alone.

- `src/utils/socialPath.js`: parse and build `/feed`, `/r/<slug>`,
  `/discover`, `/notifications`. Pure and tested, the way
  `src/utils/profilePath.js` already is.
- `src/hooks/useSocialRoute.js`: the browser half - read the path, push a new
  one, stay in step through Back. Same shape as `useProfileRoute`.
- `SocialView` reads the route instead of holding `useState('feed')`, and
  selecting a room pushes `/r/<slug>`.
- A cold load of `/r/group-whales` lands in that room. Back and forward work
  through the whole section.

Done when a room can be pasted into a chat somewhere else and it opens.

### Batch 2 - flatten it

- Five sub-tabs become three: **Feed**, **Rooms**, **Discover**.
- **Profile** moves to the account menu, where every social product puts it.
  Half of this exists already - the menu has "My public profile".
- **Notifications** move to the header as a bell with a count, visible from
  Screener and Portfolio as well. The inbox itself stays at
  `/notifications`.
- The top-level tab stops being called "Chat". It is the social section and
  should say so.

### Batch 3 - one directory instead of three lists

The sidebar is currently three stacked lists - the five, then Groups, then
Tokens - which works at today's sizes and stops working at the first busy
week, because a token room exists for every address anybody opens.

- One Rooms surface with search across rooms, groups and people.
- Sections kept, because the five are permanent and the rest are not, but
  searchable as one thing.
- `/r/<slug>#m<id>` scrolls to a message and marks it. The scrolling and the
  highlight already exist - they were built for jumping to a quoted reply in
  Batch A - so this is the URL half only.

### Batch 4 - what URLs unlock

These are already written down in `social-roadmap.md` as unfinished, and they
are unfinished because they all needed linkable surfaces:

- Notifications open their subject.
- A share affordance on a room and on a message.
- Mention autocomplete in the composer.

## Working on this

One batch, one PR, same as the chat roadmap. Every batch extends
`scripts/stress.mjs`, and navigation has a failure shape that only a browser
catches: a route that renders the right component with the wrong state, a Back
that lands somewhere that no longer exists, a cold load that works from the
dev server and 404s in production.

The scenario worth writing first, and before anything else in Batch 1: cold
load each URL directly, in a fresh page, and assert the right surface is on
screen. That is the check that would have caught every routing bug this
codebase has had.
