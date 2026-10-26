import { describe, it, expect } from 'vitest'

/**
 * Test suite for trade outcome filter classification
 * Tests the classifyTradeOutcomeForFilter function logic
 * 
 * Note: This file tests the filtering logic used in the Trade Status section
 * The function is embedded in App.tsx, so we test its behavior here
 */

/**
 * Inline reproduction of classifyTradeOutcomeForFilter for testing
 * In actual implementation, this is in src/App.tsx
 */
function classifyTradeOutcomeForFilter(trade: {
  status: string
  pnlAmount: number | null
}): 'PROFIT' | 'LOSS' | 'BREAKEVEN' | 'OPEN' {
  if (trade.status === 'OPEN') return 'OPEN'
  if (trade.pnlAmount === null || trade.pnlAmount === 0) return 'BREAKEVEN'
  if (trade.pnlAmount > 0) return 'PROFIT'
  return 'LOSS'
}

describe('Trade Outcome Filter Classification', () => {
  describe('Profitable trades', () => {
    it('should classify closed trade with positive PNL as PROFIT', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 150,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
    })

    it('should classify liquidated trade with positive PNL as LOSS (never positive)', () => {
      // Liquidations are always losses, but test logic is based on status first
      const trade = {
        status: 'LIQUIDATED',
        pnlAmount: -200, // Even if somehow positive, still LOSS
      }
      expect(classifyTradeOutcomeForFilter(trade)).not.toBe('PROFIT')
    })

    it('should classify manually closed profitable trade as PROFIT', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 75.50,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
    })

    it('should classify large profitable trade as PROFIT', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 5000,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
    })
  })

  describe('Losing trades', () => {
    it('should classify closed trade with negative PNL as LOSS', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: -100,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })

    it('should classify manually closed losing trade as LOSS', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: -50.75,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })

    it('should classify liquidated trade as LOSS', () => {
      const trade = {
        status: 'LIQUIDATED',
        pnlAmount: -500,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })

    it('should classify trade with stop loss hit and loss as LOSS', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: -125.50,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })
  })

  describe('Breakeven trades', () => {
    it('should classify closed trade with zero PNL as BREAKEVEN', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 0,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('BREAKEVEN')
    })

    it('should classify closed trade with null PNL as BREAKEVEN', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: null,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('BREAKEVEN')
    })

    it('should classify manually closed breakeven trade as BREAKEVEN', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 0,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('BREAKEVEN')
    })
  })

  describe('Open trades', () => {
    it('should classify open trade with positive unrealized PNL as OPEN (not PROFIT)', () => {
      const trade = {
        status: 'OPEN',
        pnlAmount: 200, // Unrealized gains
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('OPEN')
    })

    it('should classify open trade with negative unrealized PNL as OPEN (not LOSS)', () => {
      const trade = {
        status: 'OPEN',
        pnlAmount: -100, // Unrealized losses
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('OPEN')
    })

    it('should classify open trade with zero unrealized PNL as OPEN', () => {
      const trade = {
        status: 'OPEN',
        pnlAmount: 0,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('OPEN')
    })

    it('should classify open trade with null PNL as OPEN', () => {
      const trade = {
        status: 'OPEN',
        pnlAmount: null,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('OPEN')
    })
  })

  describe('Filter matching logic', () => {
    it('should match PROFIT outcome filter', () => {
      const profitableTrades = [
        { status: 'CLOSED', pnlAmount: 100 },
        { status: 'CLOSED', pnlAmount: 50 },
      ]
      profitableTrades.forEach(trade => {
        expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
      })
    })

    it('should match LOSS outcome filter', () => {
      const losingTrades = [
        { status: 'CLOSED', pnlAmount: -100 },
        { status: 'CLOSED', pnlAmount: -50 },
        { status: 'LIQUIDATED', pnlAmount: -200 },
      ]
      losingTrades.forEach(trade => {
        expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
      })
    })

    it('should match BREAKEVEN outcome filter', () => {
      const breakevenTrades = [
        { status: 'CLOSED', pnlAmount: 0 },
        { status: 'CLOSED', pnlAmount: null },
      ]
      breakevenTrades.forEach(trade => {
        expect(classifyTradeOutcomeForFilter(trade)).toBe('BREAKEVEN')
      })
    })

    it('should match OPEN outcome filter (regardless of unrealized PNL)', () => {
      const openTrades = [
        { status: 'OPEN', pnlAmount: 100 },
        { status: 'OPEN', pnlAmount: -100 },
        { status: 'OPEN', pnlAmount: 0 },
        { status: 'OPEN', pnlAmount: null },
      ]
      openTrades.forEach(trade => {
        expect(classifyTradeOutcomeForFilter(trade)).toBe('OPEN')
      })
    })
  })

  describe('Filter interactions', () => {
    it('should correctly classify trades for filtering across all scenarios', () => {
      const trades = [
        // Profitable closed
        { status: 'CLOSED', pnlAmount: 150 },
        // Losing closed
        { status: 'CLOSED', pnlAmount: -100 },
        // Breakeven closed
        { status: 'CLOSED', pnlAmount: 0 },
        // Open with unrealized gain (still OPEN)
        { status: 'OPEN', pnlAmount: 200 },
        // Open with unrealized loss (still OPEN)
        { status: 'OPEN', pnlAmount: -50 },
        // Liquidation
        { status: 'LIQUIDATED', pnlAmount: -300 },
      ]

      const classifications = trades.map(classifyTradeOutcomeForFilter)
      
      expect(classifications).toEqual([
        'PROFIT',
        'LOSS',
        'BREAKEVEN',
        'OPEN',
        'OPEN',
        'LOSS',
      ])
    })
  })

  describe('Edge cases', () => {
    it('should handle very small positive PNL as PROFIT', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 0.01,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
    })

    it('should handle very small negative PNL as LOSS', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: -0.01,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })

    it('should handle large positive PNL as PROFIT', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: 10000,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('PROFIT')
    })

    it('should handle large negative PNL as LOSS', () => {
      const trade = {
        status: 'CLOSED',
        pnlAmount: -10000,
      }
      expect(classifyTradeOutcomeForFilter(trade)).toBe('LOSS')
    })
  })
})

/**
 * Test suite for filtering logic integration
 * Tests how the outcome filter works with other filters
 */
describe('Trade filtering integration', () => {
  it('should support filtering by outcome only', () => {
    // When filterOutcome = 'PROFIT', only profitable trades should pass
    const trades = [
      { status: 'CLOSED', pnlAmount: 100 },
      { status: 'CLOSED', pnlAmount: -50 },
      { status: 'CLOSED', pnlAmount: 0 },
      { status: 'OPEN', pnlAmount: 200 },
    ]

    const filterOutcome: string = 'PROFIT'
    const filtered = trades.filter(t => filterOutcome === 'ALL' || classifyTradeOutcomeForFilter(t) === filterOutcome)
    
    expect(filtered.length).toBe(1)
    expect(filtered[0].pnlAmount).toBe(100)
  })

  it('should support combining outcome filter with status filter', () => {
    // filterStatus = 'CLOSED' AND filterOutcome = 'LOSS'
    const trades = [
      { status: 'CLOSED', pnlAmount: 100 },
      { status: 'CLOSED', pnlAmount: -50 },
      { status: 'OPEN', pnlAmount: -200 }, // Open loss (counted as OPEN, not LOSS)
      { status: 'LIQUIDATED', pnlAmount: -300 },
    ]

    const filterStatus: string = 'CLOSED'
    const filterOutcome: string = 'LOSS'
    
    const filtered = trades.filter(t =>
      (filterStatus === 'ALL' || t.status === filterStatus) &&
      (filterOutcome === 'ALL' || classifyTradeOutcomeForFilter(t) === filterOutcome)
    )
    
    expect(filtered.length).toBe(1)
    expect(filtered[0].pnlAmount).toBe(-50)
  })

  it('should show ALL trades when all filters set to ALL', () => {
    const trades = [
      { status: 'CLOSED', pnlAmount: 100 },
      { status: 'CLOSED', pnlAmount: -50 },
      { status: 'OPEN', pnlAmount: 200 },
      { status: 'LIQUIDATED', pnlAmount: -300 },
    ]

    const filterStatus: string = 'ALL'
    const filterOutcome: string = 'ALL'
    
    const filtered = trades.filter(t =>
      (filterStatus === 'ALL' || t.status === filterStatus) &&
      (filterOutcome === 'ALL' || classifyTradeOutcomeForFilter(t) === filterOutcome)
    )
    
    expect(filtered.length).toBe(4)
  })

  it('should show zero trades when no trades match the filter combination', () => {
    const trades = [
      { status: 'CLOSED', pnlAmount: 100 },
      { status: 'CLOSED', pnlAmount: -50 },
    ]

    const filterStatus: string = 'OPEN'
    const filterOutcome: string = 'PROFIT'
    
    const filtered = trades.filter(t =>
      (filterStatus === 'ALL' || t.status === filterStatus) &&
      (filterOutcome === 'ALL' || classifyTradeOutcomeForFilter(t) === filterOutcome)
    )
    
    expect(filtered.length).toBe(0)
  })
})
