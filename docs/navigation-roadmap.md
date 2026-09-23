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

### Batch 4 - what URLs unlock  <- done

These were already written down in `social-roadmap.md` as unfinished, and they
were unfinished because they all needed linkable surfaces:

- [x] Notifications open their subject.
- [x] A share affordance on a room, a message and a post.
- [x] Mention autocomplete in the composer.

**A post got a URL, which was not in the plan and had to be.** A mention or a
reply points at a post, and posts had no address of their own - a thread
opened inline in the feed. So "open its subject" was unbuildable for two of
the four kinds until `/p/<id>` existed. It is a path rather than a fragment on
the feed, which is the opposite of the choice made for a message in Batch 3,
and the difference is what each surface is for: `/r/lounge#m12` is a link to a
room plus where to look inside it, and the room is still worth landing on once
the message has scrolled away. A post is the thing itself, and `/feed#p12`
would find nothing the moment the post is a day old - which is when most links
get clicked.

**Gone and never-existed are answered the same way.** Telling a stranger which
one it is would say that something was deleted, and who deleted a post is not
a fact that page owes anybody.

**A notification with nowhere to go stays as text.** A reaction is addressed by
room and id together, and the id alone is not a location - which is what a
deployment whose query predates the room embed sends. Drawing that row as a
button would read as the site being broken rather than as the thing being
gone. `src/utils/notificationTarget.js` decides, and the rule is checked by
`postId` rather than by kind, so a mention that somehow carries a message does
not open a room the reader was never mentioned in.

**The share control copies rather than calling `navigator.share`.** The native
sheet looks better on a phone, is absent on most desktops, needs a gesture it
sometimes rejects anyway, and gives no answer when somebody dismisses it - so
the control would silently do nothing on exactly the machines where it is
hardest to work around. One behaviour everywhere beats a better one that is
sometimes missing. Both copy paths can still be refused, so the failure is
said out loud and the link is offered to be copied by hand.

**A message carries its own room into the link.** Taken from the message
rather than from the panel around it, so a row rendered in a search result or
on a token page's chat tab hands over a link that lands in the right place.

**Mention autocomplete is in the post composer and deliberately not the chat
one.** A chat message records no mentions and notifies nobody - see
`api/_routes/chat/messages.js`, which calls none of the notify helpers - so
the same list there would invite naming a person who would never be told.
Better no affordance than one that quietly does nothing.

**The query allows spaces, which is the whole reason the picker exists.**
`post_mentions` stores addresses because a handle here may contain one, so
"@Pulse Trader" cannot be parsed out of a post by any rule. A picker that
stopped at the first space could never offer the accounts it is the only way
to reach. The endpoint has accepted picked addresses since the table existed;
nothing was sending any.

**A name picked and then deleted notifies nobody.** `keepPicked` filters the
list against what the draft still says at send time. Without it, picking a
name and removing it puts a notification in somebody's inbox with no trace of
it anywhere they can see - which done deliberately is a way to message
somebody unaccountably.

**Escape had to be remembered, not just handled.** The first version closed
the list on Escape and the very next `keyup` reopened it: the draft still held
the same half-typed name, so re-reading it found the same query. A dismissal
that undoes itself within one keystroke is not a dismissal. The `@` that was
dismissed is now remembered until the caret moves to a different one.

**Moderation moved into `usePostActions` when a post got a second surface.**
Removing, reporting and blocking are the last things in this app that should
exist twice - the copy nobody is looking at is the one that stops confirming
before it deletes. Extracting it also exposed how thin the safety net is:
lint and 1005 unit tests both passed a version of `FeedPanel` with a leftover
handler referencing three deleted imports, which would have thrown the moment
anybody pressed Block. Only a browser catches that.

### Batch 5 - the backlog this leaves  <- done

- [x] No way to delete a room or edit a gate once it exists.
- [x] The screener has no "being talked about" signal, although the rooms now
      know.
- [x] Three routers still share one address bar. Unify them before a fourth.

**One address bar, one piece of state.** `useTokenRoute`, `useProfileRoute`
and `useSocialRoute` are gone; `src/hooks/useRoute.js` replaces all three and
`src/utils/route.js` decides which surface a path belongs to. Each of the old
hooks was right on its own and the set was not, because none could assume the
URL was where it last left it - that is what three writers to one variable
produce, not a mistake anybody made twice.

What it actually buys: there is no `closeToken`, `closeProfile` or
`closeSocial` any more. Going to a token leaves a profile because there is one
route and it is now a token. `selectTab` was three calls plus a fourth line
for every surface somebody added; it is one navigation. The per-surface
parsers stayed where they were - splitting it the other way would have put
four unrelated regexes in one function and made every surface's rules
everybody else's business.

**Archived, never deleted.** `messages.room` is a foreign key to `rooms`, so a
real delete either cascades - taking every message with it - or is refused. A
room is taken down because of what is in it or because it was a mistake, and
in the first case the conversation is the evidence: deleting it destroys the
record of the thing that justified the deletion. The room leaves the sidebar
because 0018 narrows the anon read policy to live rooms; the messages stay
readable, so a link somebody was sent still works.

**A gate change is refused if it cannot be recorded.** Everywhere else here a
failed audit row is swallowed so it cannot cost somebody their post - the
opposite call, and right there, because the post is the valuable thing. Here
the audit *is* the valuable thing: it answers "why can I no longer post in a
room I was posting in yesterday", and a gate change nobody can account for is
worse than one that did not happen.

**The notice is a banner, not a message.** `messages.address` is not null and
references `profiles`, so posting a system message would mean inventing a
system account with an address, a profile and the standing to be
impersonated. A banner says the same thing, stays put rather than scrolling
away from the people it is for, and needs none of that. It is drawn for
everybody in the room: somebody who still qualifies is entitled to know the
room now has a requirement.

**The gate is replaced wholesale, never patched field by field.** A gate is a
token and an amount together, and an endpoint that let one change without the
other would be a way to leave a room gated on an amount in the wrong scale.
Sending no token opens the room, which is recorded like any other change -
opening a room is as much a change to who may speak in it as closing one.

**The screener signal is what `message_count` was denormalised for.** 0014
wrote it down at the time: "'Which token is being talked about' is a question
the screener wants to ask about a hundred tokens at once while it draws a
list. As a count over `messages` that is a hundred aggregates; as a column it
is one read of a small table." The badge is only on rows with something to
say - a badge on every row is a column of zeroes - and pressing it opens the
room rather than the chart, which is the loop finally closing in both
directions.

**Two bugs the safety net did not catch, again.** A leftover handler in
`FeedPanel` referencing deleted imports in Batch 4, and this time a
`useCallback` dependency array naming a `const` declared sixteen lines below
it - a `ReferenceError` on every render of the social section. Lint passed
both. The unit suite passed both. Only a browser catches this class, which is
the whole argument for `scripts/stress.mjs` existing.

**And one I caused myself:** rebuilding `dist` while the matrix was running,
which 404'd the assets under the runner mid-scenario. A red result from a
build swapped underneath is as worthless as the green one against a stale
preview in Batch 2, and for the same reason. Do not touch the build while a
run is in flight.

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
