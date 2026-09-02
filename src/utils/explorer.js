import { pulsechain } from '../config/pulsechain'

/**
 * Links into the block explorer.
 *
 * Read from the chain definition rather than written out, so the explorer is
 * named in one place. A submitted transaction is the only proof a user has that
 * anything happened, and a link is what turns a hash into something they can
 * check for themselves.
 *
 * Thirteen components currently hardcode the same base URL. They are left alone
 * here - this is where they should eventually point.
 */
const BASE = pulsechain.blockExplorers?.default?.url ?? ''

const link = (path, value) => (value && BASE ? `${BASE}/${path}/${value}` : null)

export const explorerTxUrl = (hash) => link('tx', hash)
export const explorerAddressUrl = (address) => link('address', address)
export const explorerTokenUrl = (address) => link('token', address)

/** The explorer's name, for link text that says where it goes. */
export const EXPLORER_NAME = pulsechain.blockExplorers?.default?.name ?? 'Explorer'
