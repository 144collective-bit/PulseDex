-- The dev claim.
--
-- Run after 0014_token_rooms.sql, against the same project. Safe to run twice.
--
-- A row here says one thing and it is worth being exact about what: the
-- account named by `address` proved control of the wallet that sent this
-- token's creation transaction. Not that they are the team, not that the
-- token is safe, not that anybody should buy it. The badge this drives is
-- worded to match, and the wording is not decoration - a badge that reads as
-- an endorsement is this site lending its credibility to whoever claims next.
--
-- Which is also why every row is revocable and nothing is ever deleted. The
-- case this will be tested on is a dev who claims a token and then rugs it,
-- and the question that afternoon is "who vouched for this and when", which
-- only an append-only table can answer.

create table if not exists public.token_claims (
  id bigserial primary key,

  /* The token. Lowercase hex, like every address in this schema - the
     checksummed form is what gets copied out of a block explorer, and two
     casings of one address would be two claimable tokens. */
  token_address text not null,

  /* Who claimed it. */
  address text not null references public.profiles(address) on delete cascade,

  /*
   * What the chain said when the claim was granted, recorded rather than
   * merely checked.
   *
   * `deployer` is the `from` of the creation transaction and should always
   * equal `address` - the endpoint refuses the claim otherwise. Storing it
   * anyway means a later argument about whether a claim should have been
   * granted can be settled by reading the row and the chain, instead of by
   * trusting that the check ran correctly on the day.
   *
   * `creation_tx` is where it came from, so anybody can check it themselves.
   */
  deployer text not null,
  creation_tx text,

  claimed_at timestamptz not null default now(),

  /*
   * Revocation, in the same row.
   *
   * A separate audit table was the alternative and would have been worse:
   * two places to look, and a revocation that could go missing without the
   * claim looking any different. A revoked claim is a row with these three
   * columns filled in, and the partial unique index below lets the token be
   * claimed again afterwards without the history going anywhere.
   */
  revoked_at timestamptz,
  revoked_by text references public.profiles(address) on delete set null,
  /* Written by a moderator, for whoever reads this table in six months.
     Never shown to the claimant - see the select policy. */
  revoked_reason text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'token_claims_token_shape') then
    alter table public.token_claims
      add constraint token_claims_token_shape
        check (token_address ~ '^0x[0-9a-f]{40}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'token_claims_deployer_shape') then
    alter table public.token_claims
      add constraint token_claims_deployer_shape
        check (deployer ~ '^0x[0-9a-f]{40}$');
  end if;

  /* A revocation is a time, a person and a reason, or it is none of them. A
     row with `revoked_at` set and nobody named is exactly the row that makes
     the audit worthless. */
  if not exists (select 1 from pg_constraint where conname = 'token_claims_revoked_together') then
    alter table public.token_claims
      add constraint token_claims_revoked_together
        check ((revoked_at is null) = (revoked_by is null));
  end if;
end $$;

/*
 * One live claim per token.
 *
 * Partial on `revoked_at`, which is what makes the table append-only and
 * re-claimable at the same time: any number of revoked rows may name a token,
 * and at most one row that has not been revoked. A plain unique constraint
 * would have meant deleting the old row to let somebody claim after a
 * revocation, which is deleting the only record of the revocation.
 */
create unique index if not exists token_claims_one_live_idx
  on public.token_claims (token_address)
  where revoked_at is null;

/* Everything one account has claimed, for the badge on their profile. */
create index if not exists token_claims_address_idx
  on public.token_claims (address)
  where revoked_at is null;

alter table public.token_claims enable row level security;

/*
 * Live claims are public. Revoked ones are not.
 *
 * The first half is the point of the table - the badge is drawn in the
 * browser, over the anon key, beside somebody's messages in their own token's
 * room.
 *
 * The second half is the part worth arguing about, because transparency
 * pushes the other way: a reader might reasonably want to know that this
 * token's claim was revoked. It is withheld because `revoked_reason` is a
 * moderator's note about a person, written for other moderators - "reported
 * for a rug, address matches three other launches" - and publishing that over
 * an anon key readable by anyone is publishing an accusation. Revocations
 * reach the people who need them through the service role.
 *
 * The honest consequence: a revoked claim looks, to the browser, exactly like
 * a token nobody ever claimed. That is the right failure - the badge goes
 * away and nothing accuses anybody.
 */
drop policy if exists "anyone may read live claims" on public.token_claims;
create policy "anyone may read live claims"
  on public.token_claims for select to anon, authenticated using (revoked_at is null);

/*
 * No insert, update or delete policy for any role.
 *
 * Claiming goes through api/_routes/token/claim.js, which checks a fresh
 * signature against what the chain says. An insert policy here would let the
 * anon key in the bundle write the badge directly, which is the entire thing
 * this is built to prevent.
 */
