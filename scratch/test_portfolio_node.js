import { fetchWalletPortfolio } from '../src/services/portfolio.js'

async function run() {
  console.log('Testing portfolio query for address 0x5280d53D84854B7414902324976735232938833e...')
  const res = await fetchWalletPortfolio('0x5280d53D84854B7414902324976735232938833e')
  console.log('Result:', JSON.stringify(res, null, 2))
}

run()
