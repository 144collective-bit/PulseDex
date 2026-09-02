/**
 * pump.tires bonding-curve launchpad configuration.
 *
 * Tokens on pump.tires live on a bonding curve until they "graduate" — once
 * TOKENS_FOR_SALE have been bought, liquidity migrates to a PulseX pair and the
 * token trades like any other DEX asset.
 *
 * The API is public (no key, `Access-Control-Allow-Origin: *`) but undocumented,
 * so every call site treats a bad shape as empty rather than throwing.
 */
export const PUMP_TIRES_API = 'https://api2.pump.tires'

/** Bunny CDN in front of the launchpad's IPFS pins. Takes a bare CID. */
export const IPFS_CDN = 'https://ipfs-pump-tires.b-cdn.net/ipfs/'

/** Every launch mints the same supply. */
export const TOTAL_SUPPLY = 1_000_000_000

/** Tokens buyable on the curve; the rest seeds the liquidity pool at launch. */
export const TOKENS_FOR_SALE = 820_000_000

/**
 * The curve prices against a virtual reserve rather than circulating supply, so
 * quoted market value is `price * (tokens_sold + VIRTUAL_TOKEN_RESERVE)`.
 * Verified against the live feed — the ratio holds exactly on every token.
 */
export const VIRTUAL_TOKEN_RESERVE = 200_000_000

/**
 * The three board columns. Each is the same /api/tokens endpoint with a
 * different sort, which is how the launchpad's own terminal drives them.
 */
export const TRENCH_COLUMNS = [
  {
    id: 'new',
    title: 'New Launches',
    /*
     * What the heading says when the column is too narrow for the real title.
     *
     * Three columns are kept side by side even on a phone, because the
     * comparison between them is the point of the board - which leaves each
     * heading about 190px. At that width the full titles were being cut to
     * "NEW LAUNCH..." and "KING OF THE HI...", and a title truncated mid-word
     * tells a reader less than a short one chosen on purpose. These are the
     * names this audience already uses.
     */
    shortTitle: 'New',
    filter: 'created_timestamp',
    /*
     * Orderings this column can ask the feed for.
     *
     * `latest_activity_timestamp` is undocumented but real - it is the only
     * other value the endpoint accepts, and it turns this column into a
     * "recently traded" board. Everything else (market_value, total_volume_usd,
     * price, tokens_sold) comes back empty, which is why sorting by those is
     * done on the client over loaded rows instead.
     */
    feeds: ['created_timestamp', 'latest_activity_timestamp'],
    accent: 'cyan',
  },
  {
    id: 'koth',
    title: 'King of the Hill',
    shortTitle: 'KOTH',
    filter: 'top_bonding',
    feeds: ['top_bonding'],
    accent: 'yellow',
  },
  {
    id: 'grad',
    title: 'Graduations',
    shortTitle: 'Grads',
    filter: 'launch_timestamp',
    feeds: ['launch_timestamp'],
    accent: 'green',
  },
]

/** Page size per column fetch. */
export const COLUMN_PAGE_SIZE = 15

/**
 * Poll intervals in ms. The launchpad terminal refreshes token lists every 30s
 * and the trade tape every 15s; matching that keeps us well inside whatever
 * unpublished rate limit the API enforces.
 */
export const POLL_TOKENS = 30_000
export const POLL_ACTIVITY = 15_000
export const POLL_PRICE = 60_000

/** Candle intervals offered in the token detail chart, in seconds. */
export const CANDLE_INTERVALS = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1H', value: 3600 },
  { label: '4H', value: 14400 },
]
