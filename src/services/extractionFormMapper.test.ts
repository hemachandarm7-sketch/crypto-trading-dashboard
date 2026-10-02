import { describe, expect, it } from 'vitest'
import { mapExtractionToForm } from './extractionFormMapper'

describe('mapExtractionToForm', () => {
  it('maps the normalized RARE position fields without substituting defaults', () => {
    const result = mapExtractionToForm({
      screenshotType: 'POSITION_DETAILS', symbol: 'RARE/USDT', direction: 'SHORT',
      leverage: 10, quantity: 8073, size: 136.353, margin: 18.379,
      avgEntry: 0.0227, ltp: 0.01689, liquidationPrice: 0.02463,
      takeProfit: 0.01255, stopLoss: 0.01795,
    })

    expect(result).toMatchObject({
      symbol: 'RARE/USDT', direction: 'SHORT',
      values: {
        leverage: '10', quantity: '8073', size: '136.353', margin: '18.379',
        avgEntry: '0.0227', ltp: '0.01689', liquidationPrice: '0.02463',
        takeProfit: '0.01255', stopLoss: '0.01795',
      },
    })
    expect(result.eventTime).toBe('')
    expect(result.values.transactionPrice).toBe('')
    expect(result.values.closePrice).toBe('')
    expect(result.values.pnlAmount).toBe('')
    expect(result.values.pnlPercentage).toBe('')
    expect(result.values.grossPnlAmount).toBe('')
    expect(result.values.feeAmount).toBe('')
  })

  it('keeps absent symbol and direction empty instead of showing fake extracted values', () => {
    expect(mapExtractionToForm({ screenshotType: 'UNKNOWN' })).toEqual({
      symbol: '', direction: '', eventTime: '',
      values: {
        transactionPrice: '', closePrice: '', leverage: '', quantity: '', size: '', margin: '',
        avgEntry: '', ltp: '', liquidationPrice: '', takeProfit: '', stopLoss: '', pnlAmount: '', pnlPercentage: '',
        grossPnlAmount: '', feeAmount: '', entryNotional: '',
      },
    })
  })
})
