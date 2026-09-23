# The social side of PulseDex

A plan that outlives any one working session. Read this before starting
social work; update it and commit when you finish a batch.

It exists because this is a long build split across many sessions, and a plan
held only in a conversation is a plan that gets re-litigated every time.

---

## Where this stands

Roughly 2,650 lines across 18 components in `src/components/social/`, and
seven tables.

| table | holds |
| --- | --- |
| `profiles` | handle, avatar (preset id or uploaded url), banner, bio, links |
| `posts` | the feed and its replies, via `parent_id` |
| `follows` | one-way, follower → followee |
| `messages` | chat rooms |
| `message_reactions` | emoji, per address per message |
| `blocked` | moderator action against an address |
| `post_reports` | what readers have flagged |

Working today: posting, replying, following, reacting, chat rooms with
realtime, public profiles at `/u/<address>` and `/u/@handle`, Discover,
moderator blocking and report capture, rate limiting.

**What is missing is the part that makes a social product work.** There are
no notifications, no mentions, no unread state, and no search. Somebody
posts, and unless another person happens to be looking at the feed in that
moment it may as well not have happened. Nothing brings anybody back.

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

### Batch 1 — the return loop  ← in progress

Nothing else compounds until this exists.

Done, in `0010_notifications.sql` and the code around it:

- [x] `post_mentions` and `notifications` tables
- [x] Mentions on posts, and notifications for mention, reply, follow, reaction
- [x] `/api/notifications` — read the inbox, mark it read
- [x] A Notifications tab with an unread badge, polled once a minute
- [x] Mentions drawn as links in a post, by address rather than by name

Still to do:

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

### Batch 2 — profiles worth visiting

Today a profile is a banner, a bio and a list of posts. What it needs:

- A pinned post
- Tabs that mean something: Posts, Replies, Media, and later Likes
- Followers and following as browsable lists, not just counts
- An empty state that tells a new account what to do next
- **On-chain identity**, the differentiator:
  - wallet age ("first seen on PulseChain, March 2024")
  - tokens held, and a holdings panel
  - realised PnL, if it can be computed honestly
  - a "called it" badge when a post named a token before it moved

> **Privacy, stated once and then proceeded from.** Addresses and balances
> are already public — a block explorer shows them to anybody. What changes
> here is *findability*: binding a handle to an address makes a person's
> holdings reachable by name rather than only by address, and that erodes
> pseudonymity in a way the chain itself does not. Decide per field whether
> it is shown by default or opted into, and write the reasoning down next to
> the code. Wallet age is not the same kind of disclosure as holdings.

### Batch 3 — posts worth making

- Images, cropped and stripped of EXIF in the browser as avatars already are
- Link previews, fetched server-side so the reader's IP never reaches the
  target
- Quote-posts and bookmarks
- An edit window, with `edited_at` already in the schema and shown
- A real thread view rather than a flat reply list

### Batch 4 — chat

Moved out to **`docs/chat-roadmap.md`**, which outgrew a bullet list the
moment rooms stopped being five fixed strings. It covers unread state and
threads, a room per token, the dev claim, groups, and holders-only rooms.

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
