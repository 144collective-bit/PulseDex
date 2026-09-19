/**
 * A picture of an address.
 *
 * Most people never choose an avatar, so a room full of defaults was a wall of
 * identical marks - which makes a conversation harder to follow than having no
 * avatars at all, because the eye keeps trying to use them and cannot.
 *
 * Generated rather than fetched or chosen: every address already has one,
 * nobody has to configure anything, and two accounts cannot look alike unless
 * their addresses collide. That fits a product where the address is the
 * identity in the first place.
 *
 * Written by hand rather than pulled from jazzicon or blockies. It is a pure
 * function of a string, so it belongs in the same place as the rest of this
 * chat's rules and can be tested the same way - and it draws from the app's
 * own palette instead of a generic one, which is the whole point of doing this
 * for the look rather than for the feature.
 */

/**
 * The palette a mark is built from.
 *
 * The brand colours, not arbitrary hues. A generated avatar that reaches
 * outside the palette is exactly the thing that makes generated avatars look
 * cheap next to art-directed surfaces.
 */
const PALETTE = [
  '#00ff9d', // pulse green
  '#00e5ff', // pulse cyan
  '#d946ef', // pulse purple
  '#0066ff', // brand blue
  '#8a2be2', // brand purple
  '#fbbf24', // pulse yellow
  '#f43f5e', // pulse red
  '#22d3ee',
]

/** The grid a mark is drawn on. Five is enough to be distinctive and few
 *  enough to stay legible at 32px, where these are actually seen. */
const GRID = 5

/**
 * A number from a string, stable across runs and machines.
 *
 * FNV-1a, because the alternatives are a dependency or `Math.random`, and a
 * mark that changes between renders is worse than no mark. Kept to 32 bits
 * with `>>> 0` so the arithmetic stays in the range JavaScript does exactly.
 *
 * Not a security primitive and not used as one - it decides which squares are
 * filled in a picture. It is finalised through `avalanche` below, without
 * which sampling one bit of it is unsafe - see the note there.
 */
function hash(value) {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return avalanche(h)
}

/**
 * Spread a hash's entropy across all of its bits.
 *
 * FNV-1a alone is not safe to sample a single bit from, and bit zero is the
 * worst one to pick: the prime it multiplies by is odd, so multiplication
 * never changes the lowest bit, and that bit ends up being nothing more than
 * the parity of the characters XORed in.
 *
 * That is not theoretical. The first version of this took `& 1` directly, and
 * 0x1111...1111 and 0x2222...2222 drew *the same avatar* - forty '1's and
 * forty '2's have the same parity, so every cell decision matched. Two
 * accounts looking identical is precisely the failure these exist to prevent,
 * and a test caught it.
 *
 * This is the standard 32-bit finaliser: shift, multiply, repeat. After it,
 * every output bit depends on every input bit, so any single bit is a fair
 * coin.
 */
function avalanche(h) {
  let x = h >>> 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d) >>> 0
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b) >>> 0
  x ^= x >>> 16
  return x >>> 0
}

/**
 * The mark for an address: a colour, and which cells are filled.
 *
 * Mirrored down the vertical axis, which is what makes these read as a face or
 * a glyph rather than as noise. Only the left three columns are decided; the
 * right two are the first two reflected.
 *
 * @param {unknown} seed an address, or anything else stable
 * @returns {{ color: string, background: string, cells: boolean[] }}
 *   cells is GRID*GRID, row-major
 */
export function identicon(seed) {
  const text = typeof seed === 'string' && seed.length > 0 ? seed.toLowerCase() : 'anonymous'
  const h = hash(text)

  const color = PALETTE[h % PALETTE.length]
  // A second, different-feeling colour for the backdrop, taken far enough
  // along the palette that it is rarely the same hue family as the first.
  const background = PALETTE[(h >>> 8) % PALETTE.length]

  const half = Math.ceil(GRID / 2)
  const cells = new Array(GRID * GRID).fill(false)

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < half; x += 1) {
      /*
       * One bit per cell, from a re-hash of the coordinates rather than by
       * consuming bits of `h` in order. A 5x3 half-grid needs fifteen bits and
       * a 32-bit hash has thirty-two, so taking them in sequence would work -
       * but it ties the layout to the grid size, and changing GRID would then
       * silently change every existing mark.
       */
      const filled = (hash(`${text}:${x}:${y}`) & 1) === 1
      cells[y * GRID + x] = filled
      // Mirrored, which is what stops these reading as noise.
      cells[y * GRID + (GRID - 1 - x)] = filled
    }
  }

  return { color, background, cells }
}

/** The grid size, exported so a renderer does not have to guess it from the
 *  length of `cells`. */
export const IDENTICON_GRID = GRID
