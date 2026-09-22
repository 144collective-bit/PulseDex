-- Replying to a message.
--
-- Run after 0011_room_reads.sql, against the same project. Safe to run twice.

/*
 * Which message this one is answering, if any.
 *
 * A busy room is a single column of unrelated sentences, and the usual repair
 * is quoting the first few words of whatever you are answering. That works
 * and it is a worse version of this: the quote goes stale when the original
 * is edited, says nothing when it is removed, and cannot be clicked.
 *
 * `on delete set null` rather than cascade, which is the opposite of the
 * choice `posts.parent_id` makes and deliberately so. A thread under a post
 * belongs to that post and goes with it. A chat reply is its own remark that
 * happens to point at another - deleting what somebody was answering should
 * not delete their answer, it should leave it standing with nothing above it.
 *
 * Messages here are removed rather than erased anyway, so this fires rarely:
 * the ordinary case is a parent with `deleted_at` set, still present, and the
 * quote line above the reply saying the message was removed.
 */
alter table public.messages
  add column if not exists reply_to bigint references public.messages(id) on delete set null;

/*
 * Depth is not limited, and does not need to be.
 *
 * `posts` refuses a reply to a reply, because a feed renders a thread as a
 * tree and a tree without a bound is unreadable on a phone. A room renders
 * nothing of the sort: every message is its own row with at most one quoted
 * line above it, so a reply to a reply to a reply is three rows, each quoting
 * one thing. There is no structure to get away from anybody.
 */

/*
 * Finding the replies to a message.
 *
 * Not needed to draw a room - the reply rides along with its own message -
 * but "how many people answered this" is the obvious next question and this
 * is the index it would ask through. Partial, because a null here is the
 * common case by a long way and there is no reason to carry every ordinary
 * message in an index about replies.
 */
create index if not exists messages_reply_to_idx
  on public.messages (reply_to)
  where reply_to is not null;
