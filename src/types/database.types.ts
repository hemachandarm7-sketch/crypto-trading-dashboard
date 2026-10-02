export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] }
type TradeRow = {
  id: string; user_id: string; trade_code: string | null; coin: string | null; symbol: string; exchange: string | null; market_type: string | null
  direction: 'LONG' | 'SHORT'; leverage: number | null; quantity: number | null; size: number | null
  margin: number | null; avg_entry: number | null; ltp: number | null; liquidation_price: number | null
  take_profit: number | null; stop_loss: number | null; open_time: string | null; close_time: string | null
  holding_duration_seconds: number | null; holding_duration_display: string | null; close_price: number | null
  pnl_amount: number | null; pnl_percentage: number | null; status: 'OPEN' | 'CLOSED'
  close_reason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'UNKNOWN' | null; setup: string | null
  notes: string | null; exchange_position_id: string | null; open_transaction_id: string | null; close_transaction_id: string | null; created_at: string; updated_at: string
}
type ScreenshotRow = {
  id: string; user_id: string; trade_id: string | null; storage_path: string; screenshot_type: 'OPEN_TRANSACTION' | 'CLOSE_TRANSACTION' | 'PNL' | 'POSITION_DETAILS' | 'UNKNOWN'
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

export interface Database {
  public: {
    Tables: {
      trades: Table<TradeRow, Partial<TradeRow> & Pick<TradeRow, 'user_id' | 'symbol' | 'direction'>, Partial<TradeRow>>
      screenshots: Table<ScreenshotRow, Partial<ScreenshotRow> & Pick<ScreenshotRow, 'user_id' | 'storage_path' | 'sha256' | 'original_name' | 'content_type' | 'size_bytes'>, Partial<ScreenshotRow>>
      trade_events: Table<TradeEventRow, Partial<TradeEventRow> & Pick<TradeEventRow, 'user_id' | 'trade_id' | 'event_type'>, Partial<TradeEventRow>>
      user_settings: Table<UserSettingsRow, Partial<UserSettingsRow> & Pick<UserSettingsRow, 'user_id'>, Partial<UserSettingsRow>>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      trade_direction: 'LONG' | 'SHORT'
      trade_status: 'OPEN' | 'CLOSED'
      trade_close_reason: 'TP_HIT' | 'SL_HIT' | 'MANUAL_CLOSE' | 'UNKNOWN'
      screenshot_type: 'OPEN_TRANSACTION' | 'CLOSE_TRANSACTION' | 'PNL' | 'POSITION_DETAILS' | 'UNKNOWN'
      screenshot_extraction_status: 'UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'MATCHED' | 'COMPLETED' | 'FAILED'
      trade_event_type: 'OPEN' | 'CLOSE' | 'PNL' | 'POSITION_DETAILS'
    }
    CompositeTypes: Record<string, never>
  }
}
