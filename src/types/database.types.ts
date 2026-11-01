export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] }
type TradeRow = {
  id: string; user_id: string; trade_code: string | null; coin: string | null; symbol: string; exchange: string | null; market_type: string | null
  direction: 'LONG' | 'SHORT' | null; leverage: number | null; quantity: number | null; size: number | null
  margin: number | null; avg_entry: number | null; ltp: number | null; liquidation_price: number | null
  take_profit: number | null; stop_loss: number | null; open_time: string | null; close_time: string | null
  holding_duration_seconds: number | null; holding_duration_display: string | null; close_price: number | null
  pnl_amount: number | null; pnl_percentage: number | null; status: 'OPEN' | 'CLOSED' | 'LIQUIDATED'
  close_reason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'UNKNOWN' | null; setup: string | null
  notes: string | null; exchange_position_id: string | null; open_transaction_id: string | null; close_transaction_id: string | null; created_at: string; updated_at: string
}
type ScreenshotRow = {
  id: string; user_id: string; trade_id: string | null; storage_path: string; screenshot_type: 'OPEN_TRANSACTION' | 'CLOSE_TRANSACTION' | 'ROCKET_TRADE' | 'PNL' | 'POSITION_DETAILS' | 'LIQUIDATION' | 'UNKNOWN'
  uploaded_at: string; extracted_at: string | null; extraction_status: 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'MATCHED' | 'COMPLETED' | 'FAILED'
  extraction_raw_data: Json | null; extraction_confidence: number | null; sha256: string; original_name: string; content_type: string; size_bytes: number; created_at: string
}
type TradeEventRow = {
  id: string; user_id: string; trade_id: string | null; event_type: 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'; event_time: string | null
  price: number | null; percentage: number | null; raw_data: Json; screenshot_id: string | null; created_at: string
}
type UserSettingsRow = {
  user_id: string; default_leverage: number; default_exchange: string; default_market: string
  currency: string; theme: 'dark' | 'light'; default_range: string; analytics_view: string; updated_at: string
}

type IpoTradeRow = {
  id: string; user_id: string; company_name: string; symbol: string | null; exchange: string | null
  ipo_type: 'MAINBOARD' | 'SME' | null; mandate_type: 'ASBA' | 'UPI' | null; bid_type: 'CUTOFF' | 'LIMIT' | null
  application_number: string | null; dp_id: string | null; client_id: string | null; hold_account_masked: string | null
  open_date: string | null; close_date: string | null; price_band_low: number | null; price_band_high: number | null
  cutoff_price: number | null; applied_price: number | null; issue_price: number | null; lot_size: number | null
  lots: number | null; quantity: number | null; application_amount: number | null; blocked_amount: number | null
  status: 'APPLIED' | 'ALLOTTED' | 'PARTIALLY_ALLOTTED' | 'NOT_ALLOTTED' | 'LISTED'
  allotment_date: string | null; allotted_quantity: number | null; refund_amount: number | null
  listing_date: string | null; listing_price: number | null
  current_price: number | null; current_price_at: string | null; current_price_source: 'MANUAL' | 'SCREENSHOT' | 'PROVIDER' | null
  exit_price: number | null; exit_quantity: number | null; exit_date: string | null; exit_charges: number | null
  notes: string | null; created_at: string; updated_at: string
}
type IpoExtractionRow = {
  id: string; user_id: string; ipo_trade_id: string | null; kind: 'APPLICATION' | 'ALLOTMENT' | 'PRICE' | 'UNKNOWN'
  status: 'EXTRACTED' | 'CONFIRMED' | 'REJECTED'; original_name: string | null; sha256: string | null; raw_text: string
  ocr_confidence: number | null; parsed: Json; confirmed: Json | null; created_at: string
}

export interface Database {
  public: {
    Tables: {
      trades: Table<TradeRow, Partial<TradeRow> & Pick<TradeRow, 'user_id' | 'symbol' | 'direction'>, Partial<TradeRow>>
      screenshots: Table<ScreenshotRow, Partial<ScreenshotRow> & Pick<ScreenshotRow, 'user_id' | 'storage_path' | 'sha256' | 'original_name' | 'content_type' | 'size_bytes'>, Partial<ScreenshotRow>>
      trade_events: Table<TradeEventRow, Omit<Partial<TradeEventRow>, 'trade_id'> & Pick<TradeEventRow, 'user_id' | 'event_type'> & { trade_id: string }, Partial<TradeEventRow>>
      user_settings: Table<UserSettingsRow, Partial<UserSettingsRow> & Pick<UserSettingsRow, 'user_id'>, Partial<UserSettingsRow>>
      ipo_trades: Table<IpoTradeRow, Partial<IpoTradeRow> & Pick<IpoTradeRow, 'user_id' | 'company_name'>, Partial<IpoTradeRow>>
      ipo_extractions: Table<IpoExtractionRow, Partial<IpoExtractionRow> & Pick<IpoExtractionRow, 'user_id' | 'kind'>, Partial<IpoExtractionRow>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      trade_direction: 'LONG' | 'SHORT'
      trade_status: 'OPEN' | 'CLOSED' | 'LIQUIDATED'
      trade_close_reason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'UNKNOWN'
      screenshot_type: 'OPEN_TRANSACTION' | 'CLOSE_TRANSACTION' | 'ROCKET_TRADE' | 'PNL' | 'POSITION_DETAILS' | 'LIQUIDATION' | 'UNKNOWN'
      screenshot_extraction_status: 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'MATCHED' | 'COMPLETED' | 'FAILED'
      trade_event_type: 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'
    }
    CompositeTypes: Record<string, never>
  }
}
