# The social side of PulseDex

A plan that outlives any one working session. Read this before starting
social work; update it and commit when you finish a batch.

It exists because this is a long build split across many sessions, and a plan
held only in a conversation is a plan that gets re-litigated every time.

---

## Where this stands

Roughly 6,650 lines across 36 components in `src/components/social/`, and
sixteen tables. Migrations `0001` through `0020`.

| table | holds |
| --- | --- |
| `profiles` | handle, avatar (preset id or uploaded url), banner, bio, links, pinned post, wallet age, the holdings switch |
| `posts` | the feed, its replies via `parent_id`, quotes via `quote_id`, one image, and `edited_at` |
| `post_mentions` | who a post names, as rows rather than as text to parse |
| `post_reactions` | emoji, per address per post |
| `post_bookmarks` | **private** — no read policy for any browser-facing role |
| `link_previews` | what a linked page says about itself, fetched once by us |
| `follows` | one-way, follower → followee |
| `notifications` | mention, reply, follow, reaction |
| `messages` | chat rooms |
| `message_reactions` | emoji, per address per message |
| `room_reads` | how far each account has read in each room |
| `rooms` | the fixed five, a room per token, and groups |
| `room_gate_changes` | every change to who may speak in a room, append-only |
| `token_claims` | the dev claim, revocable, with an audit row |
| `blocked` | moderator action against an address |
| `post_reports` | what readers have flagged |

Working today: posting with an image, replying in a real thread, quoting,
reacting, saving privately, editing inside a five-minute window, following,
mentions with an autocomplete, an inbox with unread counts that opens what each
notification is about, link previews fetched server-side, chat rooms with
realtime and per-room unread counts, a room per token reachable from its page,
the dev claim, groups and holders-only rooms, search within a room, a URL for
every surface, and profiles with a pinned post, five tabs, browsable follower
lists, wallet age, and holdings when the account asks for them.

**What the first version of this section said was missing — notifications,
mentions, unread state, search — now exists, and so does everything Batch 3
asked for.** What is left is the two batches below: moderation is still one
human reading a queue, and the feed is reverse-chronological with no ranking.
The one thing deferred out of a finished batch is a public track record (the
"called it" badge), which needs a trade-history index this app does not have —
see Batch 2.

---

## Decisions already made

Recorded so they are not re-opened without a reason.

**On-chain identity is the differentiator.** Reversing an earlier "nothing
on-chain" call. This is a DEX screener: it can show things about an account
that a general social network cannot, and can show them provably. See the
privacy note in Batch 2 before building any of it.

**Direct messages are parked.** They could not be end-to-end encrypted
against the site operator without wallet-key encryption, which breaks when
somebody loses wallet access and makes search impossible. Holding private
messages that the operator can read is a responsibility nobody asked for
yet. Revisit when people actually ask.

**Follows stay one-way.** No mutual-approval model.

**Nothing rendered from a link's own text.** A link shows its host, always.
An account supplying its own label is how a link reading `pulsex.com` goes
somewhere that is not pulsex.com. This holds everywhere links are displayed.

---

## The batches

Each is one session's work, shippable on its own, in this order. Order is not
arbitrary: each one makes the next worth more.

### Batch 1 — the return loop  ← done

Nothing else compounds until this exists.

Done, in `0010_notifications.sql` and the code around it:

- [x] `post_mentions` and `notifications` tables
- [x] Mentions on posts, and notifications for mention, reply, follow, reaction
- [x] `/api/notifications` — read the inbox, mark it read
- [x] A Notifications tab with an unread badge, polled once a minute
- [x] Mentions drawn as links in a post, by address rather than by name

Finished in the navigation batches:

- [x] An autocomplete in the composer, which is what makes a handle
      containing a space mentionable at all — the schema and the endpoint
      already took picked addresses, so this was a client change. In the post
      composer only: a chat message records no mentions and notifies nobody,
      so the same list there would invite naming somebody who would never be
      told.
- [x] The badge in the main navigation, not only on the social tab strip
- [x] A notification opens the thing it is about, not just the profile — which
      needed a URL for a post first, at `/p/<id>`, because a thread had only
      ever opened inline in the feed

**What the plan got wrong.** It assumed mentions could be parsed out of a post
at render time. They cannot: a handle here may contain spaces, so
`@Pulse Trader` has no unambiguous reading, and `profilePath.js` matches
handles loosely on purpose so that no account is unreachable by its own name.
Mentions are therefore stored as rows — which turned out better than the plan,
because a row holds an address and a mention now survives its target renaming.

The notifications table has no row-level security policy at all, for a reason
worth remembering before adding another private surface: sign-in here is a
cookie this app sets rather than Supabase auth, so `auth.uid()` is null in
every request and RLS cannot express "your own rows". Anything private has to
go through an endpoint with the service role.

### Batch 2 — profiles worth visiting  ← done

Migration `0019_profile_depth.sql`, which must run before this merges.

- [x] A pinned post. One per account, as a column on `profiles` rather than a
      flag on `posts` — the rule is "one per account", and that is what a
      single column on the account enforces.
- [x] Followers and following as browsable lists at `/u/<who>/followers` and
      `/u/<who>/following`.
- [x] Empty states that say something. Five sentences where there was one.
- [x] **Wallet age**, shown on every profile, and a plain "New wallet" marker
      under thirty days.
- [x] **A holdings panel, opt-in**, off for every account until they turn it
      on in profile settings.
- [ ] Media and Likes tabs — moved to the batches that can deliver them, for
      the reason below.
- [ ] Realised PnL and a "called it" badge — not built, for the reason below.

> **Privacy, stated once and then proceeded from.** Addresses and balances
> are already public — a block explorer shows them to anybody. What changes
> here is *findability*: binding a handle to an address makes a person's
> holdings reachable by name rather than only by address, and that erodes
> pseudonymity in a way the chain itself does not. Decide per field whether
> it is shown by default or opted into, and write the reasoning down next to
> the code. Wallet age is not the same kind of disclosure as holdings.

**The privacy decision, per field.** Wallet age is on for everybody; holdings
are off until asked for. A date is not a balance: "first seen March 2024" says
nothing about what somebody has or did, and it is the single most useful thing
a reader can know about a stranger recommending a token, because the wallet
created this morning is the one about to take their money. Holdings are the
opposite — publishing them under a handle does not change what is *knowable*,
it changes what is *findable*, and being findable by anyone who read one of
your posts is a change in exposure that is not ours to make on somebody's
behalf. The switch writes immediately rather than on Save, which is the one
exception to how the rest of that form behaves: a draft is exactly what a
privacy decision must not be. And the sentence next to it says what it
actually does, including that turning it off hides the panel and cannot
un-see anything already seen.

**An unknown age is never rendered as a date, and never as an old wallet.**
`walletAgeLabel` returns null for a missing value and `isFreshWallet` returns
false — one-sided on purpose. The whole exposure this site carries is somebody
trusting an account they should not have, so "we have not looked this up" must
read as nothing rather than as reassurance.

**Media and Likes are deliberately absent rather than empty.** Media would be
empty on every profile in the app, because a post cannot carry an image until
Batch 3. Likes has nothing to list at all: reactions exist on chat messages
and there is no `post_reactions` table, so adding the tab would mean inventing
the table to fill it. A tab that is always empty reads as a feature that is
broken rather than one that has not arrived, and a stress scenario now fails
the build if a third or fourth tab appears before the thing it would list.

**Realised PnL is not built, and "if it can be computed honestly" is why.** It
needs a cost basis, which needs every buy and sell a wallet ever made. This app
has no indexer for that — it reads balances now and prices now. A number
derived from partial history would be confidently wrong about somebody's money
on a page strangers use to judge whether to follow their trades, which is worse
than no number. It belongs in whatever batch brings a trade-history index, not
this one.

**The "called it" badge is not built either, and the reason is adversarial
rather than technical.** A badge awarded for naming a token before it moved is
farmable by naming every token: post forty addresses, delete the thirty-nine
that went nowhere, keep the badge for the one that went up. Making it honest
means scoring every call an account ever made, including the ones they deleted,
which is a different feature — a public track record — with its own design and
its own decisions about what deletion means. Worth building. Not worth
shipping half of.

**The follow graph needed its constraint names written down.** Reading
`follows` with the person attached means naming a foreign key by string,
because `follows` reaches `profiles` twice. Those names were whatever Postgres
generated for 0008's inline `references` and had never been stated anywhere —
and this project has already lost a day to a constraint name it assumed. So
0019 raises if they are not there, `/api/health` checks both directions from
the deployment, and `src/config/queries.js` says where they come from.

**One bug got through lint and 1129 unit tests and was caught by the browser,
again.** The pinned post was drawn twice: the pin and the feed are two queries
that both legitimately return the same row, so every unit test passed and the
page showed one post under the word "Pinned" and again in date order. That is
the fourth of these — a handler referencing deleted imports, a dependency array
naming a `const` below it, a doubled `+` making a select the literal `"NaN"`,
and now this. Each one needed a running page to see.

### Batch 3 — posts worth making  ← done

Migration `0020_posts_worth_making.sql`, which must run before this merges.

- [x] **Images**, fitted and stripped of EXIF in the browser — and the **Media
      tab** that was deferred from Batch 2 for want of them.
- [x] **Link previews**, fetched server-side, text only.
- [x] **Quote-posts**, as a column on `posts` rather than a table.
- [x] **Bookmarks**, private, on a table with no read policy at all.
- [x] **An edit window** of five minutes, with every edit marked.
- [x] **A real thread view**: the author marked, consecutive replies grouped,
      the count stated, and the same controls on a reply as on a post.
- [x] **Reactions on posts**, and the profile tab that lists them — named
      **Reacted**, not Likes.
- [x] Links in a post body are links at all, which they were not before.

**The plan was wrong about `edited_at`.** It said the column was "already in
the schema". It was not: `0007` added `edited_at` to `messages`, and nothing
ever added it to `posts`. Worth recording, because a plan that is confidently
wrong about the schema is how a feature gets built against a column that is
not there.

**The edit window is five minutes, and a post with a reply cannot be edited at
all.** The time limit is the compromise; the reply rule is what actually stops
the abuse. Rewriting a post that has an answer under it makes the answer look
like a response to something nobody said — the clock protects readers in
general, the reply rule protects the specific person who replied. Every edit
stamps `edited_at` and the marker sits beside the *original* timestamp rather
than replacing it: both facts matter, and the date a reply is measured against
is the first one.

**Link previews are text, and that absence is the design.** An og:image is the
obvious thing to put on a preview card and the one thing that would undo the
reason the preview is fetched on the server at all: rendering it means the
reader's browser requests it from the linked site, which hands that site the IP
address of everybody who scrolled past the post. On a site where a post might
link to a token's page, that is a list of this app's readers handed to whoever
wrote the link. `link_previews` has no image column, so adding one is a
migration somebody has to write and think about.

**The preview fetch is the only server-side request forgery surface in this
app, and it is four layers deep.** The URL's shape (https, no credentials,
default port, no internal hostname, no literal address in a reserved range),
then every address the hostname resolves to, then both of those again on every
redirect hop, then HTML-only with a cap and a deadline. The residual risk is
written down in `api/_lib/linkPreview.js` rather than left to be discovered:
between resolving a hostname and connecting to it, `fetch` resolves it again,
so DNS rebinding is open. Closing it means connecting to a validated literal
address with the Host header set by hand, which `fetch` does not expose.

**Bookmarks are the first private thing in this schema.** `post_bookmarks` has
no row-level security policy for any browser-facing role — that blank space is
the whole security model, because `auth.uid()` is null here and a policy
comparing against it would empty the table rather than restrict it. The Saved
tab appears only on your own profile, since there is nothing it could show on
anybody else's.

**"Reacted", not "Likes".** There is no single like on this site; there are six
reactions, and 👀 "Watching" on a scam warning is not an endorsement of it. A
tab that flattened all six into "Likes" would be claiming an approval nobody
gave, so it is named for what it lists and every row says which reaction it
was. A stress scenario fails the build if a "Likes" tab appears.

**A quote of a removed post says so and shows none of it.** The row carries the
body; the card must not. Showing the text of something taken down, inside
somebody else's post, would make a quote the way around a removal — and saying
nothing at all would make the quoting post look like it was always just those
words, which turns a removal into a quiet rewrite of whoever quoted it.

**Text is still required, even with an image.** `posts.body` is NOT NULL with a
minimum of 1 by `0005`, and rather than widen it, the composer keeps the
requirement: the body is what makes a post searchable, quotable and readable to
somebody using a screen reader. A picture with no words is a post that says
nothing to a third of the people who might read it.

**Two pre-existing bugs fixed in passing.** `fileToCroppedDataUrl` took
`width`, `height` and `quality` and used none of them — the canvas was
hardcoded to 256 square — so every profile banner was a 256×256 JPEG stretched
across a 1200×400 box. Three unused-parameter lint warnings said exactly that
and had been read as noise for months. And `createImageBitmap` was called
without `imageOrientation: 'from-image'`, so the canvas re-encode stripped the
EXIF rotation tag *without applying it* — which is what turns a portrait phone
photo sideways. Stripping metadata is the feature; applying orientation before
stripping it is what stops the feature breaking the picture.

**`notificationTarget` had a hole this batch opened and closed.** A reaction on
a post is `kind: 'reaction'` with `post_id` set — no new kind and no migration,
because `0010` gave `notifications` two nullable id columns precisely so one
kind could point at either thing. But the reaction branch looked only at
`messageId` and returned null, so a notification about somebody reacting to
your post would have arrived as a row with nowhere to go.

### Batch 4 — chat  ← done

Moved out to **`docs/chat-roadmap.md`**, which outgrew a bullet list the
moment rooms stopped being five fixed strings. It covers unread state and
threads, a room per token, the dev claim, groups, and holders-only rooms — all
of which shipped in the chat batches.

### Batch 5 — safety that scales past one person

Moderation is currently one human reading reports.

- Mute, which is a reader's own choice, distinct from block, which is a
  moderator's
- A report queue with a review view, not a table nobody opens
- Auto-hide past a report threshold, pending review — reversible
- Per-account rate limits the account can actually see
- An audit trail for every moderator action

### Batch 6 — feed quality

- "For you" is reverse-chronological today; give it ranking
- Follow suggestions that react to behaviour
- Trending inside the app

---

## How to work on this

**Read this file first.** Then `CLAUDE.md` for how code here is written.

**One batch, one PR.** They are sized to be reviewable.

**Extend `scripts/stress.mjs` with every batch.** This is not optional and it
is not ceremony. Three production bugs in one day passed lint, 815 tests,
the build and the deployment smoke, because not one of those opens a page.
Notifications and unread counts have exactly that shape of failure: correct
in isolation, wrong on screen.

**Migrations are numbered and forward-only.** `0006` is deliberately absent —
it belongs to a parked X-account-link branch. Do not reuse it.

**Update this file at the end of a batch** — tick it off, and write down what
turned out to be wrong about the plan. The second half is the useful half.
