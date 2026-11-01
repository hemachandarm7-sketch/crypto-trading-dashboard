/** Generates docs/ipo-calculation-vectors.json from the TypeScript calculator (the source of truth). Run: npx vite-node scripts/generate-ipo-vectors.ts */
import { writeFileSync } from 'node:fs'
import { computeIpoFinancials } from '../src/services/ipoCalculations'
import { emptyIpoDraft } from '../src/types/ipo'
import { ipoVectorInputs } from '../src/services/ipoVectorInputs'

const cases = ipoVectorInputs.map(({ name, input }) => ({ name, input: { ...emptyIpoDraft(), ...input }, expected: computeIpoFinancials({ ...emptyIpoDraft(), ...input }) }))
writeFileSync('docs/ipo-calculation-vectors.json', `${JSON.stringify({ currency: 'INR', note: 'Generated from src/services/ipoCalculations.ts. Null means unknown and must stay null.', cases }, null, 2)}\n`)
console.log(`wrote ${cases.length} cases`)
