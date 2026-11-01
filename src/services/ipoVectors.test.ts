import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeIpoFinancials } from './ipoCalculations'
import { ipoVectorInputs } from './ipoVectorInputs'
import { emptyIpoDraft } from '../types/ipo'

/** The committed vectors are the cross-platform contract (Android must reproduce them). They must never drift from the code. */
describe('docs/ipo-calculation-vectors.json stays in sync with the calculator', () => {
  const file = JSON.parse(readFileSync(resolve(__dirname, '../../docs/ipo-calculation-vectors.json'), 'utf8')) as { cases: { name: string; input: object; expected: unknown }[] }
  it('covers every input case', () => { expect(file.cases.map(c => c.name)).toEqual(ipoVectorInputs.map(c => c.name)) })
  it.each(ipoVectorInputs.map(c => [c.name, c] as const))('%s', (_name, c) => {
    const recorded = file.cases.find(item => item.name === c.name)
    expect(recorded?.expected).toEqual(JSON.parse(JSON.stringify(computeIpoFinancials({ ...emptyIpoDraft(), ...c.input }))))
  })
})
