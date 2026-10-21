import { describe, it, expect } from 'vitest'

describe('LIQUIDATION Confirmation End-to-End Flow', () => {
  it('should trace the exact flow from liquidationPatch to database payload', () => {
    // Simulate the exact liquidationPatch construction from screenshotExtractionService.ts line 640-651

    // Step 1: evidenceData (from reconstructTradeEvidence)
    const evidenceData = {
      symbol: 'RECALL/USDT',
      direction: 'LONG',
      liquidationPrice: 0.025,
      pnlAmount: -49.337,
      eventTime: '2024-10-21T14:30:00Z',
    }

    // Step 2: matched trade from database
    const matchedTrade = {
      id: 'trade-uuid-123',
      symbol: 'RECALL/USDT',
      direction: 'LONG',
      status: 'OPEN',
      openTime: '2024-10-20T10:00:00Z',
      avgEntry: 0.037,
    }

    // Step 3: Construct liquidationPatch (exact code from line 640-651)
    const basePatch = {} // nonNullPatch(evidence) returns empty or partial object

    const liquidationPatch = {
      ...basePatch,
      status: 'LIQUIDATED' as const,
      closeTime: evidenceData.eventTime ?? null,
      closePrice: evidenceData.liquidationPrice ?? null,
      closeReason: null,
      closeTransactionId: null,
      pnlAmount: evidenceData.pnlAmount ?? null,
      pnlPercentage: -128.0,
      holdingDurationSeconds: 37800, // 10.5 hours
      holdingDurationDisplay: '10h 30m',
    }

    console.log('[LIQUIDATION_PATCH]', {
      status: liquidationPatch.status,
      statusType: typeof liquidationPatch.status,
      patchHasStatus: 'status' in liquidationPatch,
    })

    expect(liquidationPatch.status).toBe('LIQUIDATED')
    expect(typeof liquidationPatch.status).toBe('string')
    expect('status' in liquidationPatch).toBe(true)

    // Step 4: Simulate toTradeRow conversion
    function toTradeRow(trade: any) {
      const fields: any = {}
      const mapping = {
        status: 'status',
        closeTime: 'close_time',
        closePrice: 'close_price',
        closeReason: 'close_reason',
        closeTransactionId: 'close_transaction_id',
        pnlAmount: 'pnl_amount',
        pnlPercentage: 'pnl_percentage',
        holdingDurationSeconds: 'holding_duration_seconds',
        holdingDurationDisplay: 'holding_duration_display',
      } as const

      for (const [key, column] of Object.entries(mapping)) {
        if (key in trade) {
          fields[column] = trade[key]
          console.log(`[toTradeRow] Including ${column} = ${JSON.stringify(trade[key])}`)
        }
      }
      return fields
    }

    const payload = toTradeRow(liquidationPatch)

    console.log('[PAYLOAD_AFTER_toTradeRow]', {
      payloadHasStatus: 'status' in payload,
      status: payload.status,
      statusType: typeof payload.status,
      payloadFull: JSON.stringify(payload, null, 2),
    })

    // Step 5: Validation (what my new code does)
    const validStatuses = ['OPEN', 'CLOSED', 'LIQUIDATED']
    const isValidStatus = validStatuses.includes(payload.status as string)

    console.log('[PRE_UPDATE_VALIDATION]', {
      statusValue: payload.status,
      isValidStatus,
      willFail: !isValidStatus,
    })

    // Assertions
    expect(payload).toHaveProperty('status')
    expect(payload.status).toBe('LIQUIDATED')
    expect(typeof payload.status).toBe('string')
    expect(isValidStatus).toBe(true)
    expect(payload.close_time).toBe(evidenceData.eventTime)
    expect(payload.close_price).toBe(0.025)
    expect(payload.pnl_amount).toBe(-49.337)
  })

  it('should detect if status becomes null or undefined anywhere in the flow', () => {
    const scenarios = [
      {
        name: 'Normal liquidation',
        liquidationPatch: { status: 'LIQUIDATED' as const, closePrice: 0.025 },
        shouldPass: true,
      },
      {
        name: 'Status is null',
        liquidationPatch: { status: null, closePrice: 0.025 },
        shouldPass: false,
      },
      {
        name: 'Status is undefined',
        liquidationPatch: { closePrice: 0.025 }, // status not in object
        shouldPass: false, // toTradeRow won't include it
      },
      {
        name: 'Status is empty string',
        liquidationPatch: { status: '', closePrice: 0.025 },
        shouldPass: false,
      },
      {
        name: 'Status has whitespace',
        liquidationPatch: { status: ' LIQUIDATED ', closePrice: 0.025 },
        shouldPass: false,
      },
      {
        name: 'Status is LIQUIDATED (uppercase - correct)',
        liquidationPatch: { status: 'LIQUIDATED', closePrice: 0.025 },
        shouldPass: true,
      },
    ]

    function toTradeRow(trade: any) {
      const fields: any = {}
      if ('status' in trade) {
        fields.status = trade.status
      }
      return fields
    }

    for (const scenario of scenarios) {
      const payload = toTradeRow(scenario.liquidationPatch)
      const validStatuses = ['OPEN', 'CLOSED', 'LIQUIDATED']
      const isValid = 'status' in payload && validStatuses.includes(payload.status as string)

      console.log(`[SCENARIO] ${scenario.name}:`, {
        hasStatus: 'status' in payload,
        statusValue: payload.status,
        isValid,
        expectedPass: scenario.shouldPass,
      })

      if (scenario.shouldPass) {
        expect(isValid).toBe(true)
      } else {
        expect(isValid).toBe(false)
      }
    }
  })

  it('should verify matching logic finds the OPEN trade correctly', () => {
    // Simulate the trades list
    const trades = [
      {
        id: 'trade1',
        symbol: 'RECALL/USDT',
        direction: 'LONG',
        status: 'OPEN',
      },
      {
        id: 'trade2',
        symbol: 'SIREN/USDT',
        direction: 'SHORT',
        status: 'OPEN',
      },
      {
        id: 'trade3',
        symbol: 'RECALL/USDT',
        direction: 'SHORT',
        status: 'OPEN',
      },
    ]

    // Simulate findOpenTradeForClose
    function findOpenTradeForClose(trades: any[], data: any) {
      const symbol = data.symbol?.toUpperCase()
      if (!symbol) return null

      const candidates = trades.filter(
        trade =>
          trade.status === 'OPEN' &&
          (!data.direction || trade.direction === data.direction) &&
          trade.symbol === symbol
      )

      return candidates.length === 1 ? candidates[0] : null
    }

    // Test data from liquidation
    const liquidationData = {
      symbol: 'RECALL/USDT',
      direction: 'LONG',
    }

    const matched = findOpenTradeForClose(trades, liquidationData)

    console.log('[MATCHING_RESULT]', {
      found: !!matched,
      matchedId: matched?.id,
      expectedId: 'trade1',
    })

    expect(matched).not.toBeNull()
    expect(matched?.id).toBe('trade1')
    expect(matched?.status).toBe('OPEN')
  })

  it('should identify if no matching trade is found (INSERT fallback)', () => {
    const trades = [
      {
        id: 'trade1',
        symbol: 'SIREN/USDT', // Different symbol
        direction: 'SHORT',
        status: 'OPEN',
      },
    ]

    function findOpenTradeForClose(trades: any[], data: any) {
      const symbol = data.symbol?.toUpperCase()
      if (!symbol) return null

      const candidates = trades.filter(
        trade =>
          trade.status === 'OPEN' &&
          (!data.direction || trade.direction === data.direction) &&
          trade.symbol === symbol
      )

      return candidates.length === 1 ? candidates[0] : null
    }

    const liquidationData = {
      symbol: 'RECALL/USDT',
      direction: 'LONG',
    }

    const matched = findOpenTradeForClose(trades, liquidationData)

    console.log('[NO_MATCH - WILL_INSERT]', {
      found: !!matched,
      willCreateNewTrade: !matched,
    })

    expect(matched).toBeNull()
  })
})
