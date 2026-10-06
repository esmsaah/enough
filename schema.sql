-- Enough — D1 schema. Apply with:
--   npx wrangler d1 execute enough --remote --file=schema.sql

-- One researched profile per merchant name, shared by every user.
CREATE TABLE IF NOT EXISTS merchant_profiles (
  key TEXT PRIMARY KEY,          -- sanitized merchant name, e.g. "maxi"
  profile TEXT NOT NULL,         -- validated ResearchProfile JSON
  kind TEXT NOT NULL,
  confidence REAL NOT NULL,
  researched_at TEXT NOT NULL    -- ISO time, re-researched after 30 days (subscriptions only)
);

-- Daily AI spend for the budget cap.
CREATE TABLE IF NOT EXISTS ai_spend (
  day TEXT PRIMARY KEY,          -- yyyy-mm-dd UTC
  usd REAL NOT NULL DEFAULT 0,
  calls INTEGER NOT NULL DEFAULT 0
);

-- Cost per call, no request content.
CREATE TABLE IF NOT EXISTS ai_calls (
  at TEXT NOT NULL,
  kind TEXT NOT NULL,            -- research | research-web | analyse
  usd REAL NOT NULL
);
