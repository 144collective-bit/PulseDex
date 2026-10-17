import { describe, expect, it } from 'vitest'
import {
  AFFINITY_WEIGHTS,
  ENGAGER_MIN_DAYS,
  HALF_LIFE_HOURS,
  MAX_AFFINITY,
  affinityMap,
  establishedEngagement,
  rankFeed,
  rankReason,
  recencyWeight,
  scorePost,
} from './feedRank'

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const hoursAgo = (n) => new Date(NOW - n * 3_600_000).toISOString()
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()

const AUTHOR = '0x' + 'a'.repeat(40)
const OTHER = '0x' + 'b'.repeat(40)
const READER = '0x' + 'c'.repeat(40)

/** An address that is not any of the above, by index. */
const addr = (i) => `0x${String(i).repeat(40).slice(0, 40)}`

/** Established, so its engagement counts. */
const established = (i) => [addr(i), daysAgo(ENGAGER_MIN_DAYS + 30)]
/** Created this morning, so it does not. */
const fresh = (i) => [addr(i), daysAgo(1)]

const post = (over = {}) => ({
  id: 1,
  address: AUTHOR,
  createdAt: hoursAgo(1),
  reactions: [],
  ...over,
})

describe('recencyWeight', () => {
  it('is 1 for something posted now', () => {
    expect(recencyWeight(new Date(NOW).toISOString(), NOW)).toBe(1)
  })

  it('halves over the half-life', () => {
    expect(recencyWeight(hoursAgo(HALF_LIFE_HOURS), NOW)).toBeCloseTo(0.5, 6)
    expect(recencyWeight(hoursAgo(HALF_LIFE_HOURS * 2), NOW)).toBeCloseTo(0.25, 6)
  })

  /*
   * The timestamps come from the database's clock and `now` from this one. A
   * row a few hundred milliseconds "ahead" is ordinary skew, and left alone a
   * negative age would make a post worth more than 1 - unboundedly so.
   */
  it('treats a timestamp from the future as new rather than as infinite', () => {
    expect(recencyWeight(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe(1)
  })

  it('is zero for a date it cannot read, rather than throwing', () => {
    for (const value of [null, undefined, '', 'yesterday', {}, NaN]) {
      expect(recencyWeight(value, NOW)).toBe(0)
    }
  })

  it('reads epoch milliseconds as well as an ISO string', () => {
    expect(recencyWeight(NOW - 3_600_000, NOW)).toBeCloseTo(recencyWeight(hoursAgo(1), NOW), 9)
  })
})

describe('affinityMap', () => {
  it('scores each kind of history at its own weight', () => {
    expect(affinityMap({ follows: [AUTHOR] }).get(AUTHOR)).toBe(AFFINITY_WEIGHTS.follow)
    expect(affinityMap({ bookmarked: [AUTHOR] }).get(AUTHOR)).toBe(AFFINITY_WEIGHTS.bookmark)
    expect(affinityMap({ replied: [AUTHOR] }).get(AUTHOR)).toBe(AFFINITY_WEIGHTS.reply)
    expect(affinityMap({ reacted: [AUTHOR] }).get(AUTHOR)).toBe(AFFINITY_WEIGHTS.reaction)
  })

  it('adds the kinds together', () => {
    const scores = affinityMap({ follows: [AUTHOR], reacted: [AUTHOR] })
    expect(scores.get(AUTHOR)).toBeCloseTo(AFFINITY_WEIGHTS.follow + AFFINITY_WEIGHTS.reaction, 9)
  })

  /*
   * Somebody who reacted to forty of one account's posts has told us one
   * thing - that they read that account. Letting it accumulate forty times
   * would make the cap the only thing doing any work.
   */
  it('counts a kind once per author however many rows there are', () => {
    const many = Array.from({ length: 40 }, () => AUTHOR)
    expect(affinityMap({ reacted: many }).get(AUTHOR)).toBe(AFFINITY_WEIGHTS.reaction)
  })

  it('caps one author, so a ranked feed does not become one account', () => {
    const scores = affinityMap({
      follows: [AUTHOR],
      bookmarked: [AUTHOR],
      replied: [AUTHOR],
      reacted: [AUTHOR],
    })
    expect(scores.get(AUTHOR)).toBe(MAX_AFFINITY)
  })

  it('does not care what case an address arrived in', () => {
    expect(affinityMap({ follows: [AUTHOR.toUpperCase()] }).get(AUTHOR)).toBe(
      AFFINITY_WEIGHTS.follow,
    )
  })

  it('ignores anything that is not an address-shaped string', () => {
    const scores = affinityMap({ follows: [null, 42, {}, undefined, AUTHOR] })
    expect(scores.size).toBe(1)
  })

  it('is empty given nothing', () => {
    expect(affinityMap().size).toBe(0)
    expect(affinityMap({}).size).toBe(0)
    expect(affinityMap({ follows: null }).size).toBe(0)
  })
})

describe('establishedEngagement', () => {
  const ages = new Map([established(1), established(2), fresh(3), fresh(4)])

  it('counts established accounts that reacted', () => {
    const p = post({ reactions: [{ address: addr(1) }, { address: addr(2) }] })
    expect(establishedEngagement(p, ages, { now: NOW })).toBe(2)
  })

  /*
   * The whole point of the gate. A feed ranked on raw engagement, on a site
   * about which tokens to buy, is a pump amplifier - and an account here is a
   * wallet address, which is free.
   */
  it('counts no number of brand new wallets', () => {
    const brigade = Array.from({ length: 50 }, (_, i) => ({ address: addr(i + 100) }))
    const youngAges = new Map(brigade.map((r) => [r.address, daysAgo(1)]))
    expect(establishedEngagement(post({ reactions: brigade }), youngAges, { now: NOW })).toBe(0)
  })

  // An unknown age is usually an address nobody has looked up. Treating it as
  // old enough would make the gate satisfiable by wallets made this morning.
  it('does not count an address whose age is unknown', () => {
    const p = post({ reactions: [{ address: addr(9) }] })
    expect(establishedEngagement(p, new Map(), { now: NOW })).toBe(0)
  })

  it('counts one account once however many emoji it used', () => {
    const p = post({
      reactions: [
        { address: addr(1), emoji: '🔥' },
        { address: addr(1), emoji: '👀' },
        { address: addr(1), emoji: '🚀' },
      ],
    })
    expect(establishedEngagement(p, ages, { now: NOW })).toBe(1)
  })

  /*
   * The reader's own reaction is already counted as affinity, at a higher
   * weight. Counting it here too would boost a post for them because they
   * engaged with it, as though a stranger had.
   */
  it('excludes the reader themselves', () => {
    const readerAges = new Map([[READER, daysAgo(ENGAGER_MIN_DAYS + 30)], established(1)])
    const p = post({ reactions: [{ address: READER }, { address: addr(1) }] })
    expect(establishedEngagement(p, readerAges, { viewer: READER, now: NOW })).toBe(1)
  })

  it('counts repliers as well as reactors, and does not double-count one', () => {
    const p = post({ reactions: [{ address: addr(1) }] })
    expect(establishedEngagement(p, ages, { repliers: [addr(2)], now: NOW })).toBe(2)
    expect(establishedEngagement(p, ages, { repliers: [addr(1)], now: NOW })).toBe(1)
  })

  it('counts an account exactly on the floor', () => {
    const onFloor = new Map([[addr(5), daysAgo(ENGAGER_MIN_DAYS)]])
    expect(establishedEngagement(post({ reactions: [{ address: addr(5) }] }), onFloor, { now: NOW })).toBe(1)
  })

  it('survives a post with nothing on it', () => {
    expect(establishedEngagement(null, ages, { now: NOW })).toBe(0)
    expect(establishedEngagement(post({ reactions: null }), ages, { now: NOW })).toBe(0)
    expect(establishedEngagement(post(), undefined, { now: NOW })).toBe(0)
  })
})

describe('scorePost', () => {
  it('is the recency weight when there is no other signal', () => {
    const scored = scorePost(post({ createdAt: hoursAgo(HALF_LIFE_HOURS) }), { now: NOW })
    expect(scored.score).toBeCloseTo(0.5, 6)
    expect(scored.reason).toBeNull()
  })

  it('lifts a post by somebody the reader follows', () => {
    const affinity = affinityMap({ follows: [AUTHOR] })
    const mine = scorePost(post(), { affinity, now: NOW })
    const theirs = scorePost(post({ address: OTHER }), { affinity, now: NOW })
    expect(mine.score).toBeGreaterThan(theirs.score)
  })

  /*
   * The decision this whole file turns on, stated as a test: recency is the
   * spine and bounds every other signal. A post with every signal it can have
   * must not outrank a bare post that is far newer.
   */
  it('keeps a day-old post with every signal below a fresh bare one', () => {
    const loaded = scorePost(
      post({
        createdAt: hoursAgo(24),
        reactions: Array.from({ length: 30 }, (_, i) => ({ address: addr(i + 10) })),
      }),
      {
        affinity: affinityMap({
          follows: [AUTHOR],
          bookmarked: [AUTHOR],
          replied: [AUTHOR],
          reacted: [AUTHOR],
        }),
        walletAges: new Map(Array.from({ length: 30 }, (_, i) => established(i + 10))),
        now: NOW,
      },
    )

    const bare = scorePost(post({ id: 2, address: OTHER, createdAt: hoursAgo(1) }), { now: NOW })

    expect(loaded.score).toBeLessThan(bare.score)
  })

  /*
   * The gate is on who ENGAGES, never on who posts. Penalising young authors
   * would entrench whoever arrived first - the thing fetchActiveProfiles
   * refuses to do on the discovery page - and make this a feed you buy into.
   */
  it('does not care how old the author’s wallet is', () => {
    const ages = new Map([[AUTHOR, daysAgo(0)], [OTHER, daysAgo(900)]])
    const young = scorePost(post({ address: AUTHOR }), { walletAges: ages, now: NOW })
    const old = scorePost(post({ address: OTHER }), { walletAges: ages, now: NOW })
    expect(young.score).toBe(old.score)
  })

  it('reports the parts behind the score, which the log and the label both want', () => {
    const scored = scorePost(post({ reactions: [{ address: addr(1) }] }), {
      affinity: affinityMap({ follows: [AUTHOR] }),
      walletAges: new Map([established(1)]),
      now: NOW,
    })

    expect(scored.affinity).toBe(AFFINITY_WEIGHTS.follow)
    expect(scored.established).toBe(1)
    expect(scored.recency).toBeGreaterThan(0)
  })

  it('scores a post it cannot date at zero rather than throwing', () => {
    expect(scorePost(post({ createdAt: null }), { now: NOW }).score).toBe(0)
    expect(scorePost(null, { now: NOW }).score).toBe(0)
  })

  // Diminishing returns: the difference between nobody and somebody is the
  // informative part, and past a handful the number says more about how many
  // people were awake.
  it('does not pay linearly for a crowd', () => {
    const ages = new Map(Array.from({ length: 40 }, (_, i) => established(i + 10)))
    const reactions = (n) => Array.from({ length: n }, (_, i) => ({ address: addr(i + 10) }))

    const two = scorePost(post({ reactions: reactions(2) }), { walletAges: ages, now: NOW })
    const forty = scorePost(post({ reactions: reactions(40) }), { walletAges: ages, now: NOW })

    expect(forty.score).toBeGreaterThan(two.score)
    expect(forty.score).toBeLessThan(two.score * 2)
  })
})

describe('rankReason', () => {
  it('names affinity first, because it is the signal the reader chose', () => {
    expect(rankReason({ affinity: 1, established: 0 })).toMatch(/somebody you read/i)
  })

  it('names both when both apply', () => {
    const reason = rankReason({ affinity: 1, established: 5 })
    expect(reason).toMatch(/somebody you read/i)
    expect(reason).toMatch(/established/i)
  })

  it('says established accounts rather than a count of reactions', () => {
    // "12 reactions" would send a reader looking for twelve and find thirty:
    // the number is the ones that passed the wallet-age floor.
    expect(rankReason({ affinity: 0, established: 4 })).toBe(
      '4 established accounts engaged with it',
    )
  })

  it('is null when nothing but time put it there, which is most posts', () => {
    expect(rankReason({ affinity: 0, established: 0 })).toBeNull()
    expect(rankReason({ affinity: 0, established: 1 })).toBeNull()
    expect(rankReason()).toBeNull()
  })

  // A ranked feed must not become a way of working out who is reading whom.
  it('never names who engaged', () => {
    for (const established of [2, 9]) {
      const reason = rankReason({ affinity: 1, established })
      expect(reason).not.toMatch(/0x/i)
    }
  })
})

describe('rankFeed', () => {
  it('puts the highest score first', () => {
    const posts = [
      post({ id: 1, address: OTHER, createdAt: hoursAgo(1) }),
      post({ id: 2, address: AUTHOR, createdAt: hoursAgo(2) }),
    ]
    const ranked = rankFeed(posts, { affinity: affinityMap({ follows: [AUTHOR] }), now: NOW })
    expect(ranked.map((p) => p.id)).toEqual([2, 1])
  })

  /*
   * A feed that visibly shuffles while somebody is reading it is worse than
   * one in the wrong order, because they cannot tell whether they already read
   * a post. Two posts with no signals and the same timestamp must not swap.
   */
  it('is stable on ties', () => {
    const posts = [
      post({ id: 7, address: OTHER, createdAt: hoursAgo(3) }),
      post({ id: 9, address: OTHER, createdAt: hoursAgo(3) }),
    ]
    const once = rankFeed(posts, { now: NOW }).map((p) => p.id)
    const twice = rankFeed([...posts].reverse(), { now: NOW }).map((p) => p.id)
    expect(once).toEqual(twice)
    // Newest id first, the order fetchPostPage already uses.
    expect(once).toEqual([9, 7])
  })

  it('attaches the reason so a card can draw it without recomputing', () => {
    const ranked = rankFeed([post()], { affinity: affinityMap({ follows: [AUTHOR] }), now: NOW })
    expect(ranked[0].rank.reason).toMatch(/somebody you read/i)
  })

  it('does not mutate what it was given', () => {
    const posts = [post()]
    rankFeed(posts, { now: NOW })
    expect(posts[0].rank).toBeUndefined()
  })

  it('keeps every post, because ranking is an order and never a filter', () => {
    const posts = [post({ id: 1 }), post({ id: 2, createdAt: null }), post({ id: 3 })]
    expect(rankFeed(posts, { now: NOW })).toHaveLength(3)
  })

  it('survives being given nothing', () => {
    expect(rankFeed(null)).toEqual([])
    expect(rankFeed([])).toEqual([])
  })

  /*
   * The adversarial case, end to end: somebody has bought thirty reactions
   * from wallets they made this morning. The post must not outrank an older
   * one from an account the reader actually follows.
   */
  it('does not let bought reactions beat somebody the reader actually reads', () => {
    const bought = Array.from({ length: 30 }, (_, i) => ({ address: addr(i + 100) }))
    const ages = new Map([
      ...bought.map((r) => [r.address, daysAgo(1)]),
      [AUTHOR, daysAgo(900)],
    ])

    const posts = [
      post({ id: 1, address: OTHER, createdAt: hoursAgo(1), reactions: bought }),
      post({ id: 2, address: AUTHOR, createdAt: hoursAgo(3) }),
    ]

    const ranked = rankFeed(posts, {
      affinity: affinityMap({ follows: [AUTHOR] }),
      walletAges: ages,
      now: NOW,
    })

    expect(ranked[0].id).toBe(2)
  })
})
