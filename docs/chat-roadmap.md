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

### Batch B - a room per token  <- done, bar the screener signal

The thing that makes this chat belong to this app.

Done, in `0014_token_rooms.sql` and the code around it:

- [x] `rooms` table, seeded with the five, `messages.room` gains its foreign key
- [x] A token room created the first time somebody posts in one
- [x] A Chat tab on the token page, which is where people already are when they
      have a question about a token
- [x] The token rooms with something happening in them, listed under the five
      in the sidebar, with a way back to the chart from each

Not done:

- [ ] Message volume fed back to the screener: "being talked about" is a signal
      the rest of the app can show

The data for it is in place - `rooms.message_count` and `rooms.last_message_at`
are maintained by the posting endpoint, and `rooms_token_idx` is the index a
screener asking about a list of tokens would use. What is missing is the
design decision: where on a screener row a chat signal goes without pushing
out a number somebody is trading on. That is a screener question, not a chat
one, and guessing at it here would have meant shipping a badge nobody had
looked at.

**Migration 0014 has to run before this deploys**, and it is the first one
that will refuse to run against a database in the wrong state: it adds a
foreign key from `messages.room` to `rooms.slug`, so any message in a room
that is not one of the five stops the migration. It adopts those rooms first
rather than failing, but the adoption is worth reading before running it.

**Rooms created by posting, not by opening.** Opening a token's chat tab
writes nothing: a room with no messages is a room that does not exist, which
is also what it looks like from the reader's side - the empty state. The
alternative was creating one on open, which would have meant a write on every
chart anybody glanced at and a table filled by whoever felt like walking the
address space.

**A token room has no name, and deliberately never will.** A name would have
to come from somebody - realistically whoever posted first - which is a text
field attached to a stranger's token, shown to everybody: "OFFICIAL", "DO NOT
BUY". They are titled by their address, and by the symbol on the one page that
already knows it.

**Anyone signed in can create a room by posting in it.** That is the feature,
and it is also the moderation surface this batch adds: `rooms.created_by`
records who, and the existing post rate limit is what bounds it. There is no
way to delete a room yet, which is the next thing this will want.

**The token page was unstyled when reached directly**, and this batch found
it: `trenches.css` was imported only by the board's view, so a cold load of
`/token/<address>` rendered the whole page as unformatted markup. Same cause
as the public profile bug - Vite attaches a stylesheet to whichever chunk
imports it, and these are two lazy routes. Importing it in the component that
uses it puts it in both. A stress scenario now fails if the page loads without
its own padding.

### Batch C - the dev claim  <- done, needs one check in production

Done, in `0015_token_claims.sql` and the code around it:

- [x] Read the creation transaction for a token, get the deploying address
- [x] A claim flow: sign from that address, and the signature is checked against
      what the chain says rather than against anything the client sent
- [x] One claim per token, revocable, with an audit row for who revoked it and why
- [x] The badge, worded as above, on the profile and beside their messages in
      their own token's room
- [x] Moderator powers for the claimant, **in that room only**

**Migration 0015 has to run before this deploys.**

**The deploying wallet is the creation transaction's sender, not the
contract's creator.** The plan said "read the creation transaction" and that
turns out to be load-bearing rather than loose phrasing. A token launched on a
bonding curve was *created* by the launchpad's factory - an address nobody
holds a key to - so a claim checked against the contract's creator would be
impossible for exactly the tokens this site is mostly about. The `from` of the
transaction that asked for the launch is the person. For a directly deployed
token the two are the same address, so one rule covers both, and "whoever sent
the creation transaction" is also what the badge can honestly say.

**The one thing that cannot be checked from a development machine**, and the
reason this batch is not simply "done": the deployer lookup calls a node, and
this sandbox has no outbound network. The code asks Otterscan's
`ots_getContractCreator` first and falls back to a Blockscout explorer, both
overridable by `PULSECHAIN_RPC_URL` and `PULSECHAIN_EXPLORER_API`, because
`ots_*` is an extension not every node exposes. Whether the configured
PulseChain node answers it has not been observed. **Someone has to attempt one
real claim against production and watch what happens.** The failure mode if
neither source answers is that nobody can claim - the endpoint refuses rather
than guessing - which is the right direction but is also silent.

**The badge is built as a scam vector, because it is one.** It says
*Deployer*, never "verified" or "official"; it carries the sentence "Controls
the wallet that sent this token's creation transaction. Not a safety check,
and not an endorsement." wherever there is room and in its tooltip where there
is not; and it is styled quieter than the brand's own accents, because a badge
that glows is a badge that recommends. A stress scenario fails the build if
any of that wording changes to include a word the claim cannot support.

**A claim buys removal in one room and nothing else.** Not blocking, which
silences an account across the whole site. The endpoint reads the room from
the message being removed rather than from the request, so the scope cannot be
widened by asking differently. The case this exists for is a dev whose room
fills with impersonators posting a fake contract address at two in the
morning.

**Revocation needs a reason and nothing is ever deleted.** A revoked claim is
the same row with three more columns filled in, and a partial unique index
lets the token be claimed again without the history going anywhere. The
claimant cannot revoke their own - a dev who has just rugged should not be
able to erase the record that this site showed a badge for them.

**A revoked claim looks, from the browser, exactly like a token nobody ever
claimed.** `revoked_reason` is a moderator's note about a person and the anon
key is readable by everybody, so the select policy hides revoked rows
entirely. Transparency argues the other way here and lost: publishing "revoked
- reported for a rug" over a public key is publishing an accusation. The badge
goes away and nothing accuses anybody.

### Batch D - groups, and gating  <- done, needs one check in production

Done, in `0016_groups_and_gating.sql` and the code around it:

- [x] Creating a group, naming rules, a directory
- [x] The creator moderates their own group
- [x] **Holders-only rooms**: a `min_balance` on the room, checked server-side at
      post time

Every line of the gating plan survived contact, which is worth recording
because it is unusual:

- [x] The check is on the **write**. Nothing is checked on entry, and reading
      a gated room is not restricted at all - a gate is about who may write,
      and a holders-only room nobody else can read is a different and more
      exclusionary feature than anybody asked for.
- [x] `balanceOf` sits in the posting path, cached per serverless instance for
      sixty seconds.
- [x] Selling costs the ability to post and nothing else. No message is ever
      touched because a balance changed.
- [x] It is server-side. The browser draws the rule; it never decides it.

**Migration 0016 has to run before this deploys.**

**What happens when the node does not answer** was the open question, and the
answer is asymmetric on purpose. Somebody whose last known balance was enough
keeps posting for ten minutes - they were in the room a minute ago and an RPC
timeout is not evidence that they sold. Somebody with no cached reading at all
is refused, because "we could not check" must never mean "come in" for a
person nobody has ever checked; that turns every outage into an open door.
Somebody whose last reading was *too small* stays refused: the grace window
keeps people in, never lets them in. That rule is `gateDecision` in
`src/utils/gate.js` and has a test per branch.

**Every amount is a BigInt, everywhere.** A gate of a thousand 18-decimal
tokens is 10^21 base units, which a JavaScript number renders as `1e+21` and
compares wrongly well before that. The human amount is converted once, at
creation, using the token's own `decimals()` read from the chain - so the
comparison at post time is two integers and never a rescaling. `min_balance`
is `numeric(78,0)` because a uint256 has 78 digits and a bigint holds 19.

**The gate is stated before anybody types**, above the composer, in units a
person recognises. Nothing about that is enforcement. It exists so a refusal
is not the first anybody hears of the rule - writing three sentences and then
being told the room is for holders is a worse experience than knowing going
in. The sidebar shows a padlock and deliberately not the amount: a navigation
column listing minimum holdings reads as a price list.

**The same production check Batch C needs, for the same reason.** The balance
read calls a node and this machine has no outbound network, so
`readBalance` has never been observed against a real RPC. Unlike the deployer
lookup there is no fallback source - `balanceOf` is standard, so the risk is
lower - but **somebody should create one gated group and try to post in it**.
If the node is unreachable the room refuses everybody who has not posted
recently, which is safe and silent.

**A group's name and its gate cannot be edited.** Changing who may speak in a
room people are already in wants an audit row and a notice to the room, and
neither exists. A group with the wrong gate is left alone and another made.
That is a real limitation and the first thing to fix if groups get used.

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
