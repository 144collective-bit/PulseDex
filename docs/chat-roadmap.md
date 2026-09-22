# The chat, and where it goes next

Companion to `social-roadmap.md`, which covers the feed, profiles and
notifications. This one is about the rooms.

Read it before starting chat work; update it when you finish a batch, and
write down what the plan got wrong.

---

## What exists

Five rooms - Lounge, Trading, Trenches, HEX, Help - defined in
`src/config/rooms.js` as a frozen array rather than a table. That was a
deliberate trade and the file says so: one source of truth that the sidebar,
the endpoint and the tests all read, no admin screen to build, and no way for
the database to contain a room the app has never heard of.

It also predicted its own end:

> It stops being the right shape the moment rooms need to be created by
> anyone who is not holding a git checkout.

That moment is this document.

Working today: 500-character messages, realtime inserts, soft deletion so
moderation is reversible, editing with `edited_at`, emoji reactions, a live
presence count, per-address blocking, per-message removal, rate limits, and
profile cards.

Missing, and the gap is wider than a feature list suggests:

- **No unread state.** Nothing says which room has anything new in it, so the
  sidebar is five identical words and a guess.
- **No typing indicator.** Presence exists but only counts heads.
- **No threads.** A busy room is unreadable.
- **No search, no images, no pinned messages.**
- **Nothing ties the chat to a token**, which is the only thing that would
  make a chat inside a DEX screener different from a chat anywhere else.

---

## Decisions

**Rooms become a table.** Seeded with the five that exist, so `messages.room`
keeps working and can take a foreign key.

**Three kinds of room**, one table: `core` (the five), `token` (one per token
address), `group` (made by hand). Same messages, same moderation, same
everything - the kind decides who may enter and who moderates, nothing else.

**Token rooms are created on first use**, not for every token that exists.
There are tens of thousands of tokens and almost none of them will ever have a
conversation in them.

**Holders-only rooms are in scope.** A room may require a minimum balance of
its token. See the batch for what that actually costs.

**Groups are moderator-made, at first.** Anybody creating them means spam,
squatted names, and tooling to deal with both before anyone has established
that people want groups at all. Starting closed is reversible; starting open
is not.

**A dev claims a token from the deploying wallet, and nothing else.** Signing
from the address that sent the creation transaction. It is provable from chain
data, it still works when ownership has been renounced, and no contract can
lie about it - `owner()` is whatever the contract says it is, and a hostile one
can say anything.

> **The badge is a scam vector, and has to be built as one.** Get it wrong and
> this site's credibility is lending itself to a rugger. So: it says exactly
> what it proves - *controls the deploying wallet* - and never "official" or
> "verified" unqualified. It is revocable by a moderator, because the case it
> will be tested on is a dev who claims and then rugs. And the deploying
> wallet is not the team, is sometimes a factory, and is sometimes a burner:
> the badge claims control of an address, which is all it can honestly claim.

---

## The batches

### Batch A - a room you can actually follow  <- done

No new concepts; this is what makes the rest worth having. A room nobody can
tell has new messages in it is a room nobody comes back to.

Done, in `0011_room_reads.sql` and the code around it:

- [x] Unread per room, counted server-side and badged in the list
- [x] Opening a room marks it read; staying in one keeps it read
- [x] A room list that shows where the activity is

- [x] Typing indicators, over the presence channel that already existed
- [x] Jump-to-latest carries a count of what arrived while you were away

Done, in `0012_message_replies.sql`, `0013_message_search.sql` and the code
around them:

- [x] Reply-to-message, quoted above the reply and clickable back to it
- [x] Message search within a room

**Migrations 0011, 0012 and 0013 have to run before this deploys.** Not a
nicety: `0012` adds `messages.reply_to`, and the chat asks for that column on
every read. Against a database without it, PostgREST refuses the query and
every room says it could not be loaded - so the order is run the migrations,
then deploy, and `/api/health` on the deployment will say which of them landed.

**What the plan got wrong.** Jump-to-latest was already built. The button has
been there since the chat shipped; what it lacked was a number, and on a busy
room that is the whole point - "Jump to latest" says there is a bottom, "12
new messages" says whether going there is worth losing your place.

Three things were decided while building the rest, and are worth not
re-deciding.

Unread state is server-side. localStorage was the tempting shortcut and would
have meant reading on a laptop and then arriving on a phone to five rooms
shouting about messages already read. It belongs to the account, not the
device - which also makes it private, so it goes through an endpoint like the
inbox does.

Typing is broadcast with a name, not as "somebody is typing". The room
otherwise reports only a head count, so this does reveal more than it did -
but only about a person one keystroke away from sending a message with their
name on it. It tells nobody anything they were not about to be told.

Replies are one message pointing at another, not a thread. `posts.parent_id`
cascades on delete because a thread belongs to its post; `messages.reply_to`
sets null instead, because a chat reply is its own remark that happens to
point somewhere. Deleting what somebody was answering should leave their
answer standing with nothing above it, not delete it. Depth is unlimited for
the same reason it is capped on posts: a room renders no tree, so a reply to a
reply is two rows each quoting one thing.

You can only go to a message that is on screen. Both the quote above a reply
and a search result offer "go to it" when the room is holding that message and
say nothing when it is not - rather than a control that scrolls nowhere. The
alternative was loading the page around the target, which would leave the room
showing fifty messages from March and then today with no marker of the gap.

Search is scoped to one room, and that is a privacy decision as much as a
technical one. Searching every room answers "has anyone ever said this", which
turns a conversation somebody had in a quiet corner into something that
surfaces from anywhere. Within a room it finds what was said in a conversation
the reader is already in.

Searching hides the conversation rather than unmounting it. Everything in the
panel - the loaded pages, the scroll position, a half-typed message - is there
again when the box is cleared. Unmounting would make searching a way to lose
your place.

The count comes from one `unread_counts` function rather than a query per
room. Five rooms would have made per-room queries fine; a room per token
would not, and the shape of the answer does not change. The function falls
back to the account's creation date rather than the beginning of time, so
somebody signing in for the first time is not greeted by every message ever
posted marked unread.

### Batch B - a room per token

The thing that makes this chat belong to this app.

- `rooms` table, seeded with the five, `messages.room` gains its foreign key
- A token room created the first time somebody opens one
- A Chat tab on the token page, which is where people already are when they
  have a question about a token
- Message volume fed back to the screener: "being talked about" is a signal
  the rest of the app can show

### Batch C - the dev claim

- Read the creation transaction for a token, get the deploying address
- A claim flow: sign from that address, and the signature is checked against
  what the chain says rather than against anything the client sent
- One claim per token, revocable, with an audit row for who revoked it and why
- The badge, worded as above, on the profile and beside their messages in
  their own token's room
- Moderator powers for the claimant, **in that room only**

### Batch D - groups, and gating

Smaller than it was, because groups start moderator-made.

- Creating a group, naming rules, a directory
- The creator moderates their own group
- **Holders-only rooms**: a `min_balance` on the room, checked server-side at
  post time

The gating is the hard half, and the honest version of it looks like this:

- The check belongs on the **write**, not on entry. A check on join is a
  snapshot that is wrong the moment somebody sells.
- Which means an RPC read of `balanceOf` in the posting path, so the write now
  depends on a node answering. It needs a cache with a short life, and a
  decision about what happens when the read fails - refusing every post
  because an RPC is slow is worse than letting a seller talk for two minutes.
- Selling costs the ability to post, not the messages already written. History
  is not rewritten because somebody's balance changed.
- It must be server-side. A client-side balance check is decoration.

---

## Working on this

Read `CLAUDE.md`, then this. One batch, one PR.

Every batch extends `scripts/stress.mjs`. Rooms have the failure shape that
only a browser catches: an unread count that drifts, a realtime channel that
outlives its room, a gated room that lets the wrong person post.

Migrations are numbered and forward-only. `0006` is deliberately absent - it
belongs to a parked branch.

Preview deployments now verify their own database queries before merge, so a
new select or embed is proven at the pull request rather than after it.
