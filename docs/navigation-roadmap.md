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

### Batch 1 - a URL for every surface  <- done

- [x] `src/utils/socialPath.js`: parse and build `/feed`, `/me`, `/r/<slug>`,
      `/discover`, `/notifications`. Pure and tested, the way
      `src/utils/profilePath.js` already is.
- [x] `src/hooks/useSocialRoute.js`: the browser half - read the path, push a
      new one, stay in step through Back.
- [x] `SocialView` reads the route instead of holding `useState('feed')`, and
      selecting a room pushes `/r/<slug>`.
- [x] A cold load of `/r/group-whales` lands in that room. Back and forward
      work through the whole section.

**The tab is derived from the URL, not kept beside it.** `shownTab` in
`App.jsx` is `socialRoute ? 'social' : activeTab`. A second copy in state is
the copy that goes stale, and the way that fails is a cold load landing on
Home with the address bar insisting it is in a room.

**A link to a room that no longer exists lands on the rooms surface, not on
the home page.** Shared links outlive the things they point at, so that is the
ordinary case rather than the odd one. The address bar is then corrected with
`replaceState` - push would put the broken link in history for Back to return
to - so whoever copies it next passes on one that works. The round trip pinned
down in `socialPath.test.js` is what stops that correction correcting itself
forever.

**`/me` exists** and is the one surface not in the original plan. Four of five
sub-tabs having URLs and the fifth not would have been a worse inconsistency
than one more path, and it survives Batch 2 - the account menu can point at it.

**Three routers now share one address bar**, and the bug that cost the most
time here came from exactly that: `closeToken` pushes `/` whether or not a
token was open, so the first version of `closeSocial` checked the location,
found it already moved, concluded there was nothing to do, and left the
section mounted over the home page. None of the three can assume the URL is
where it last left it. Unifying them is worth doing and is not Batch 2's job;
if a fourth is ever needed, do that first.

### Batch 2 - flatten it  <- done

- [x] Five sub-tabs become three: **Feed**, **Rooms**, **Discover**.
- [x] **Profile** moves to the account menu, which already had it.
- [x] **Notifications** move to the header as a bell with a count, visible
      from Screener and Portfolio as well. The inbox stays at
      `/notifications`.
- [x] The top-level tab stops being called "Chat".

**The two that left the row still exist and still have URLs.** `/me` and
`/notifications` render inside the section with no tab selected, which is
honest: you are in the section, on something that is not one of the three.
The row is still drawn there. Hiding it would be tidier and would leave
somebody on their own inbox with no way back except the browser's Back
button.

**Why those two and not others.** Your profile and your inbox are not places
to browse - they are things you go to on purpose, from the chrome, which is
where every social product has put them. Leaving them in the row made the row
an account screen with a feed attached. The three that remain are the ones
about the site rather than about you.

**The badge moved rather than being copied.** There is exactly one unread
count and it is the bell. Two places claiming to be the count is how they
drift apart, so the sub-tab badge is gone rather than kept in sympathy.

**The bell is absent when signed out, not empty.** A control that is always
empty teaches people to ignore the one thing in that bar permitted to demand
attention.

**"Social", not "Chat".** The section holds a feed, an inbox, a way to find
people and the rooms. Naming it after one of the four is why nobody looking
for their notifications found them.

### Batch 3 - one directory instead of three lists  <- done

The sidebar was three stacked lists - the five, then Groups, then Tokens -
which works at today's sizes and stops working at the first busy week, because
a token room exists for every address anybody opens.

- [x] One filter above the column, narrowing all three sections at once.
      `src/utils/roomFilter.js`, pure and tested.
- [x] Sections kept, because the five are permanent and the rest are not, but
      searchable as one thing.
- [x] `/r/<slug>#m<id>` scrolls to a message and marks it. The scrolling and
      the highlight already existed - they were built for jumping to a quoted
      reply in Batch A - so this was the URL half only.

**What the list draws has to be what can be typed.** A token room has no name,
only `0xa107…9a27`, and the first version of the haystack matched the slug and
the full address - so somebody reading the label off the screen and typing its
tail found nothing. The shortened form is now split on the ellipsis and both
halves are searchable, because nobody types `…`. That is the rule worth
keeping past this batch: anything a navigation list shows is a search term
somebody will try.

**People-search stayed in Discover, against the plan above.** The plan said
"search across rooms, groups and people". Discover already owns that query -
`searchProfiles`, with its own results, its own empty state and its own
paging - and putting it in the sidebar too would have been two
implementations of one search, which is how two searches start disagreeing
about who exists. So the empty state hands off instead: *"Looking for a
person?"* switches to Discover carrying what was typed. One query, and the
mistake of typing a name into a room filter is answered rather than punished.

**The filter is always there, not revealed past some number of rooms.** A
control that appears when a list gets long is a control nobody knows exists
until the day they need it most.

**Filtering is not navigation.** Narrowing the column does not change the room
being read or touch the address bar, and the room being read is prepended to
the token list when it is not among the busiest eight - otherwise opening a
quiet token room from a chart and then looking at the sidebar shows no room
selected at all.

**`#m<id>` is a fragment, and that is the whole reason it works.**
`/r/lounge#m1234` is the same document as `/r/lounge` to the server and to the
router, so a link to a message is a link to the room plus an instruction about
where to look - which is exactly what it is. A path segment would have made it
a separate route that has to load the room anyway. The jump fires once per id
rather than on every render: the list grows as older pages load and as people
talk, and re-jumping on each of those would drag the reader back to the linked
message every time anybody said anything.

**A link to a message further back than the page reaches says so.** Otherwise
somebody who followed a link and landed on an ordinary-looking room concludes
the link is broken, when what actually happened is that the conversation moved
on past it. The notice clears itself when loading older messages brings the
message into view, because it is computed from what is loaded rather than set
once.

**The stress matrix stopped at scenario 57 and reported exit 0.** A step that
failed part-way left a navigation in flight, and the probe that reads the
final page state threw into a context being torn down - taking the run with
it, so the remaining forty never ran. The four scenarios that failed were
stale expectations from Batch 2, still walking the Notifications sub-tab that
the flattening removed. Both are fixed: the probe retries and records rather
than throwing, and the inbox scenarios go through the bell. The lesson is the
same one as the stale preview in Batch 2 - **a harness that stops early
reports less than one that keeps going, and nobody reads the run that never
finished.**

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
