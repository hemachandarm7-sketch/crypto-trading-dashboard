import { describe, it, expect } from 'vitest'
import { classifyTradeOutcome, getAnalytics, buildExitMethodOutcomeAnalysis } from './analytics'
import type { Trade } from '../types'

// Note: classifyTradeOutcomeForFilter is tested in App.test.ts
// as it's used in the App component for filtering

/**
 * Test suite for trade outcome classification
 * Verifies that outcomes are determined by PNL, not by closeReason
 */

function createMockTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'test-' + Math.random(),
    symbol: 'BTC/USDT',
    exchange: 'Bybit',
    marketType: 'Perpetual',
    direction: 'LONG',
    position: 'LONG',
    leverage: 5,
    quantity: 1,
    size: 50000,
    margin: 10000,
    avgEntry: 50000,
    ltp: 51000,
    liquidationPrice: 40000,
    takeProfit: 55000,
    stopLoss: 45000,
    openTime: '2024-01-01T00:00:00Z',
    closeTime: '2024-01-02T00:00:00Z',
    closePrice: 51000,
    holdingDurationSeconds: 86400,
    holdingDurationDisplay: '1d',
    pnlAmount: 1000,
    pnlPercentage: 10,
    status: 'CLOSED',
    closeReason: 'TP_HIT',
    setup: 'Test setup',
    notes: 'Test trade',
    exchangePositionId: '12345',
    openTransactionId: 'open-123',
    closeTransactionId: 'close-123',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    ...overrides,
  }
}

describe('classifyTradeOutcome', () => {
  it('should classify profitable trade as WIN', () => {
    const trade = createMockTrade({ pnlAmount: 100, status: 'CLOSED' })
    expect(classifyTradeOutcome(trade)).toBe('WIN')
  })

  it('should classify losing trade as LOSS', () => {
    const trade = createMockTrade({ pnlAmount: -100, status: 'CLOSED' })
    expect(classifyTradeOutcome(trade)).toBe('LOSS')
  })

  it('should classify breakeven trade as BREAKEVEN', () => {
    const trade = createMockTrade({ pnlAmount: 0, status: 'CLOSED' })
    expect(classifyTradeOutcome(trade)).toBe('BREAKEVEN')
  })

  it('should classify liquidated trade as LIQUIDATION regardless of PNL', () => {
    const trade = createMockTrade({ status: 'LIQUIDATED', pnlAmount: -500 })
    expect(classifyTradeOutcome(trade)).toBe('LIQUIDATION')
  })

  it('should treat missing PNL as BREAKEVEN', () => {
    const trade = createMockTrade({ pnlAmount: null })
    expect(classifyTradeOutcome(trade)).toBe('BREAKEVEN')
  })
})

describe('Trade Outcome Classification - Exit Methods', () => {
  it('Test 1: Profitable manual close should count as WIN, not manualClosures', () => {
    const trade = createMockTrade({
      pnlAmount: 100,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('WIN')
    expect(analytics.profitableManual).toBe(1)
    // Win rate should include this trade
    expect(analytics.winRate).toBe(100)
  })

  it('Test 2: Losing manual close should count as LOSS, not manualClosures', () => {
    const trade = createMockTrade({
      pnlAmount: -100,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('LOSS')
    expect(analytics.losingManual).toBe(1)
    // Loss rate should include this trade
    expect(analytics.lossRate).toBe(100)
  })

  it('Test 3: TP hit with profit should be counted', () => {
    const trade = createMockTrade({
      pnlAmount: 50,
      status: 'CLOSED',
      closeReason: 'TP_HIT',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('WIN')
    expect(analytics.tpHits).toBe(1)
    expect(analytics.profitableWithTp).toBe(1)
  })

  it('Test 4: SL hit with loss should be counted', () => {
    const trade = createMockTrade({
      pnlAmount: -50,
      status: 'CLOSED',
      closeReason: 'SL_HIT',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('LOSS')
    expect(analytics.slHits).toBe(1)
    expect(analytics.losingWithSl).toBe(1)
  })

  it('Test 5: Liquidated trade should be separate', () => {
    const trade = createMockTrade({
      pnlAmount: -200,
      status: 'LIQUIDATED',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('LIQUIDATION')
    expect(analytics.liquidations).toBe(1)
    expect(analytics.liquidationLoss).toBe(200)
  })

  it('Test 6: Breakeven manual close', () => {
    const trade = createMockTrade({
      pnlAmount: 0,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('BREAKEVEN')
    expect(analytics.breakEvenTrades).toBe(1)
  })

  it('Test 7: Partial close with profit should count as WIN based on PNL', () => {
    const trade = createMockTrade({
      quantity: 0.5,
      pnlAmount: 75,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const analytics = getAnalytics([trade])
    
    expect(classifyTradeOutcome(trade)).toBe('WIN')
    expect(analytics.profitableManual).toBe(1)
    expect(analytics.winRate).toBe(100)
  })

  it('Test 8: Mixed manual closes should have correct win rate', () => {
    const profitableManual = createMockTrade({
      pnlAmount: 100,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const losingManual = createMockTrade({
      id: 'test-2',
      pnlAmount: -100,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    const breakeven = createMockTrade({
      id: 'test-3',
      pnlAmount: 0,
      status: 'CLOSED',
      closeReason: 'MANUAL_CLOSE',
    })
    
    const analytics = getAnalytics([profitableManual, losingManual, breakeven])
    
    // Should have: 1 win, 1 loss, 1 breakeven
    expect(analytics.winRate).toBe(33.33333333333333) // 1 / 3
    expect(analytics.lossRate).toBe(33.33333333333333) // 1 / 3
    expect(analytics.profitableManual).toBe(1)
    expect(analytics.losingManual).toBe(1)
    expect(analytics.breakEvenTrades).toBe(1)
    // manualClosures should be 3 (total manual closes)
    expect(analytics.manualClosures).toBe(3)
  })
})

describe('buildExitMethodOutcomeAnalysis', () => {
  it('should show profitable vs losing breakdown for TP hits', () => {
    const profitableTp = createMockTrade({
      pnlAmount: 100,
      closeReason: 'TP_HIT',
    })
    const losingTp = createMockTrade({
      id: 'test-2',
      pnlAmount: -50,
      closeReason: 'TP_HIT',
    })
    
    const analysis = buildExitMethodOutcomeAnalysis([profitableTp, losingTp])
    
    expect(analysis.tpHits.total).toBe(2)
    expect(analysis.tpHits.profitable).toBe(1)
    expect(analysis.tpHits.losing).toBe(1)
  })

  it('should show losing breakdown for SL hits', () => {
    const losingSl = createMockTrade({
      pnlAmount: -75,
      closeReason: 'SL_HIT',
    })
    const profitableSl = createMockTrade({
      id: 'test-2',
      pnlAmount: 25,
      closeReason: 'SL_HIT',
    })
    
    const analysis = buildExitMethodOutcomeAnalysis([losingSl, profitableSl])
    
    expect(analysis.slHits.total).toBe(2)
    expect(analysis.slHits.losing).toBe(1)
    expect(analysis.slHits.profitable).toBe(1)
  })

  it('should separate profitable, losing, and breakeven manual closes', () => {
    const trades = [
      createMockTrade({
        pnlAmount: 100,
        closeReason: 'MANUAL_CLOSE',
      }),
      createMockTrade({
        id: 'test-2',
        pnlAmount: -50,
        closeReason: 'MANUAL_CLOSE',
      }),
      createMockTrade({
        id: 'test-3',
        pnlAmount: 0,
        closeReason: 'MANUAL_CLOSE',
      }),
    ]
    
    const analysis = buildExitMethodOutcomeAnalysis(trades)
    
    expect(analysis.manualCloses.total).toBe(3)
    expect(analysis.manualCloses.profitable).toBe(1)
    expect(analysis.manualCloses.losing).toBe(1)
    expect(analysis.manualCloses.breakeven).toBe(1)
  })
})

describe('Analytics Summary Consistency', () => {
  it('should have win rate that matches actual winning trades', () => {
    const winningTrade = createMockTrade({ pnlAmount: 100 })
    const losingTrade = createMockTrade({
      id: 'test-2',
      pnlAmount: -50,
    })
    
    const analytics = getAnalytics([winningTrade, losingTrade])
    
    // 1 winning, 1 losing = 50% win rate
    expect(analytics.winRate).toBe(50)
    expect(analytics.lossRate).toBe(50)
  })

  it('should not duplicate count partial closes in PNL', () => {
    const partialClose = createMockTrade({
      quantity: 0.5,
      pnlAmount: 100,
    })
    
    const analytics = getAnalytics([partialClose])
    
    expect(analytics.totalProfit).toBe(100)
    expect(analytics.totalPnl).toBe(100)
  })

  it('should handle zero PNL correctly', () => {
    const zeroPnl = createMockTrade({ pnlAmount: 0 })
    
    const analytics = getAnalytics([zeroPnl])
    
    expect(analytics.totalPnl).toBe(0)
    expect(analytics.totalProfit).toBe(0)
    expect(analytics.totalLoss).toBe(0)
    expect(analytics.breakEvenTrades).toBe(1)
  })

  it('should track liquidations separately from regular losses', () => {
    const regularLoss = createMockTrade({
      pnlAmount: -100,
      status: 'CLOSED',
    })
    const liquidation = createMockTrade({
      id: 'test-2',
      pnlAmount: -200,
      status: 'LIQUIDATED',
    })
    
    const analytics = getAnalytics([regularLoss, liquidation])
    
    // Total loss includes both regular losses and liquidations
    expect(analytics.totalLoss).toBe(300)
    // But liquidation loss is also tracked separately for analysis
    expect(analytics.liquidations).toBe(1)
    expect(analytics.liquidationLoss).toBe(200)
    // Total PNL should include both
    expect(analytics.totalPnl).toBe(-300)
  })
})
