import type { BuiltinSkill } from "../types"

export const CRYPTO_TRADING_SKILL_NAME = "crypto-trading"

export const CRYPTO_TRADING_SKILL_DESCRIPTION =
  "Professional crypto trading strategies and risk management: trend following, mean reversion, breakout, swing/scalping, position sizing, stop-loss placement, portfolio allocation, futures/perpetuals (funding rates, basis), options strategies. Triggers: 'trading strategy', 'position sizing', 'risk management', 'futures', 'perpetuals', 'stop loss', 'take profit', 'entry exit'."

export const cryptoTradingSkill: BuiltinSkill = {
  name: CRYPTO_TRADING_SKILL_NAME,
  description: CRYPTO_TRADING_SKILL_DESCRIPTION,
  template: `# Crypto Trading — Strategies & Risk Management

## TRADING STRATEGY TAXONOMY

### Trend Following
- **Entry**: After confirmed Higher High / Higher Low structure break; EMA stack aligned (20>50>200)
- **Filter**: ADX >25 confirms trend strength; avoid flat markets
- **Stop**: Below last Higher Low (for longs); above last Lower High (for shorts)
- **Target**: Fibonacci extensions (1.272, 1.618) or next major resistance
- **Best on**: Daily / 4H timeframes; works in crypto bull cycles

### Mean Reversion
- **Entry**: RSI <30 (oversold) at key support / demand zone; RSI >70 at resistance
- **Filter**: Confirmed sideways market (ADX <20); Bollinger Band squeeze exit
- **Stop**: Beyond the S/R level being traded
- **Target**: VWAP, midpoint of range, opposite band
- **Best on**: Range-bound markets; avoid during strong trends

### Breakout Trading
- **Entry**: Close above resistance / below support with volume expansion (>1.5× average)
- **Filter**: Volume Profile confirms LVN above = fast move; prior consolidation ≥5 candles
- **Stop**: Back inside the broken level (invalidation)
- **Target**: Range height projected from breakout + next HVN from Volume Profile
- **Trap detection**: Fakeout = wick through level + immediate reversal; wait for retest confirmation

### Swing Trading
- **Timeframe**: 4H–Daily
- **Setup**: Pull back to 0.5–0.618 Fibonacci in trending market; bullish candle confirmation
- **Hold**: 3–14 days; partial profit at 1:1, trail stop on rest
- **Risk**: 1–2% of portfolio per swing; no more than 4–5 concurrent swings

### Scalping
- **Timeframe**: 1M–15M
- **Setup**: Order flow imbalance + delta divergence at key intraday level
- **R:R**: Minimum 1.5:1; high win rate (≥60%) required
- **Risk**: 0.25–0.5% per trade; strict time-based stop (exit if not moving within X bars)

## RISK MANAGEMENT FRAMEWORK

### Position Sizing
\`\`\`
Kelly Criterion (conservative, ½ Kelly):
f* = (W/L × WinRate - LossRate) / (W/L) × 0.5

Fixed Fractional (recommended):
Position Size = (Account Risk $) / (Entry - Stop Loss)
Example: $10,000 × 1% risk / ($0.50 stop) = 200 units

Max position = never exceed 10% of portfolio in a single asset
Max correlated exposure = never exceed 25% in same sector (e.g., L1s)
\`\`\`

### Stop-Loss Placement
| Method | Formula | Use Case |
|--------|---------|----------|
| **ATR-Based** | Entry ± (1.5–2.5 × ATR14) | Volatility-adjusted; adapts to market conditions |
| **Structure-Based** | Below last swing low / above swing high | Most logical; aligns with market structure |
| **Percentage-Based** | Entry × (1 - stop%) | Simple; use only with max 2–3% for crypto |
| **Invalidation-Based** | Below order block / FVG | High-conviction setups; tight but meaningful |

### Take Profit Strategy
\`\`\`
Pyramid Exits (recommended):
- 30% at 1:1 R:R (risk neutralization)
- 40% at 2:1 R:R (core profit)
- 30% trail to 3:1+ or until trailing stop triggered

Move stop to breakeven after 1:1 hit (free trade)
\`\`\`

### Portfolio Allocation (Crypto)
| Category | Allocation | Examples |
|----------|------------|---------|
| Large Cap (BTC, ETH) | 50–60% | Core; lowest volatility within crypto |
| Mid Cap Sector Leaders | 20–30% | SOL, AVAX, BNB, ARB |
| High-Risk/High-Return | 10–20% | Altcoins, new narratives, memecoins |
| Stablecoins (dry powder) | 10–20% | USDC, USDT — deploy on dips |

## FUTURES & PERPETUALS

### Key Concepts
| Term | Definition | Implication |
|------|------------|-------------|
| **Funding Rate** | Periodic payment between longs and shorts | Positive = longs pay shorts (crowd is long = be cautious) |
| **Open Interest (OI)** | Total open contracts in market | Rising OI + rising price = healthy; Rising OI + falling price = bearish |
| **Long/Short Ratio** | Proportion of longs vs shorts | Extreme ratios = contrarian signal (crowded trade) |
| **Basis** | Spot vs futures price spread | Positive basis = futures premium; negative = backwardation (bearish sentiment) |
| **Liquidation Levels** | Price at which leveraged positions are force-closed | Cascade liquidations drive sharp moves; track via Coinglass |

### Leverage Guidelines
| Market Condition | Max Leverage | Rationale |
|------------------|-------------|----------|
| High volatility (BTC ±5%/day) | 2–3× | Avoid liquidation cascade |
| Normal conditions | 3–5× | Balanced risk |
| Low volatility range | 5–10× | Only for experienced traders |
| Never | >20× | Guaranteed ruin over time |

### Funding Rate Strategy
- Funding >0.1% per 8h → Crowd heavily long → Fade rallies, look for long squeeze
- Funding <-0.05% per 8h → Crowd heavily short → Accumulate spot, look for short squeeze
- Neutral funding (±0.01%) → No directional signal from funding

## TRADING PSYCHOLOGY FRAMEWORK

### Bias Management
| Bias | Symptom | Fix |
|------|---------|-----|
| Confirmation bias | Only see signals supporting existing view | Write opposing thesis before trading |
| FOMO | Chasing parabolic moves without setup | Pre-define entry criteria; no criteria = no trade |
| Revenge trading | Doubling down after loss | Mandatory cooling-off period (24h) after 2+ consecutive losses |
| Anchoring | Fixating on entry price after invalidation | "What would I do if I had no position?" |
| Recency bias | Overweighting last few trades | Track all trades in journal; evaluate by expectancy |

### Trade Journal (Mandatory Fields)
\`\`\`
Date | Asset | Direction | Timeframe | Setup | Entry | Stop | Target | R:R | Result | Notes
\`\`\`

### Pre-Trade Checklist
- [ ] Higher timeframe trend direction identified
- [ ] Key S/R levels mapped on daily/4H
- [ ] Setup matches defined strategy criteria
- [ ] Position size calculated (≤1-2% account risk)
- [ ] Stop loss level defined (not "I'll see how it goes")
- [ ] Minimum 1.5:1 R:R confirmed
- [ ] News/events checked (CoinGecko, CryptoCalendar)
- [ ] Sector correlation checked (not doubling up correlated exposure)
`,
}
