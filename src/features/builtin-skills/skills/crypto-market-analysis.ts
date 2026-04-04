import type { BuiltinSkill } from "../types"

export const CRYPTO_MARKET_ANALYSIS_SKILL_NAME = "crypto-market-analysis"

export const CRYPTO_MARKET_ANALYSIS_SKILL_DESCRIPTION =
  "Professional crypto market analysis: technical analysis (RSI, MACD, Bollinger Bands, volume, Fibonacci), chart patterns, market structure (S/R, order blocks, FVG), candlestick patterns, multi-timeframe analysis. Triggers: 'technical analysis', 'TA', 'chart', 'indicators', 'price action', 'market structure', 'support resistance'."

export const cryptoMarketAnalysisSkill: BuiltinSkill = {
  name: CRYPTO_MARKET_ANALYSIS_SKILL_NAME,
  description: CRYPTO_MARKET_ANALYSIS_SKILL_DESCRIPTION,
  template: `# Crypto Market Analysis — Technical & Structural Framework

## TECHNICAL INDICATORS

### Momentum
| Indicator | Signal | Settings |
|-----------|--------|----------|
| **RSI** | Overbought >70, Oversold <30; Divergence signals reversals | 14-period |
| **MACD** | Bullish: MACD crosses above signal; Bearish: crosses below. Histogram expansion = momentum | 12/26/9 |
| **Stochastic** | %K/%D crossovers; extremes: >80 overbought, <20 oversold | 14/3/3 |
| **MFI** | Volume-weighted RSI; divergence = high-conviction signal | 14-period |

### Volatility
| Indicator | Signal | Settings |
|-----------|--------|----------|
| **Bollinger Bands** | Price at upper band = overbought; Squeeze → breakout incoming | 20 SMA, ±2σ |
| **ATR** | Measure volatility for stop-loss sizing (1-3× ATR). High ATR = wide stops | 14-period |
| **Keltner Channels** | BB outside KC = strong trend (squeeze breakout) | 20 EMA, 1.5× ATR |

### Trend
| Indicator | Signal | Settings |
|-----------|--------|----------|
| **EMA Stack** | 20 > 50 > 200 EMA = strong uptrend; Death/Golden Cross on 50/200 | 20, 50, 200 |
| **Ichimoku** | Price above cloud = bullish; TK cross = entry signal; Kumo twist = trend change | 9/26/52/26 |
| **VWAP** | Price above VWAP = buyers in control; Institutions use VWAP for execution | Daily/Weekly |
| **ADX** | >25 = trend; >40 = strong trend; <20 = ranging market | 14-period |

### Volume
| Metric | Signal |
|--------|--------|
| **Volume Profile** | High-Volume Node (HVN) = strong S/R; Low-Volume Node (LVN) = fast moves |
| **OBV** | Divergence with price = accumulation/distribution hidden |
| **CVD** | Cumulative volume delta: buying vs selling pressure imbalance |
| **Funding Rate** | Positive = longs paying shorts (bearish lean); Negative = shorts paying longs (bullish lean) |

## CHART PATTERNS

### Reversal Patterns
| Pattern | Signal | Target |
|---------|--------|--------|
| Head & Shoulders | Bearish reversal; neckline break = entry | Height of head from neckline |
| Double Top / Bottom | Reversal at key level; volume confirms | Height of formation |
| Rising/Falling Wedge | Rising wedge = bearish; Falling wedge = bullish | Back to breakout point |
| Broadening Formation | Distribution / accumulation; volatility expansion | Pattern height |

### Continuation Patterns
| Pattern | Signal | Target |
|---------|--------|--------|
| Bull/Bear Flag | Consolidation before continuation; tight range + volume drop | Flag pole height |
| Ascending/Descending Triangle | Horizontal resistance broken = bull; horizontal support broken = bear | Triangle height |
| Symmetrical Triangle | Neutral coil; breakout direction = trade direction | Pattern height |
| Cup & Handle | Bullish accumulation; handle breakout entry | Cup depth projected up |

## MARKET STRUCTURE

### Trend Analysis
\`\`\`
Uptrend:   HH (Higher High) → HL (Higher Low) → HH → HL
Downtrend: LH (Lower High) → LL (Lower Low) → LH → LL
Reversal:  Break of Structure (BOS) — a swing low broken in uptrend signals reversal
\`\`\`

### Key Concepts
- **Order Blocks (OB)**: Last bearish candle before bullish impulse (bullish OB) = institutional buy zone
- **Fair Value Gaps (FVG)**: 3-candle imbalance; price tends to return to fill gaps
- **Liquidity Pools**: Equal highs/lows = stop clusters; price hunts liquidity before reversing
- **Premium / Discount**: Above equilibrium (0.5 Fib) = premium; below = discount. Buy discount, sell premium
- **Change of Character (CHoCH)**: Minor structure break signaling potential trend shift (earlier warning than BOS)

## FIBONACCI LEVELS

| Level | Usage |
|-------|-------|
| 0.236, 0.382 | Shallow retracement in strong trend — add to position |
| 0.5 | 50% retracement = equilibrium / fair value |
| 0.618 | Golden ratio — most significant retracement level |
| 0.786 | Deep retracement — last defense before trend invalidation |
| 1.0, 1.272, 1.414, 1.618 | Extension targets for take-profit levels |

## MULTI-TIMEFRAME ANALYSIS (MTF)

\`\`\`
Top-Down Hierarchy:
1. Weekly/Monthly → Macro trend & major structure (bias)
2. Daily         → Primary trend & key S/R levels
3. 4H            → Swing structure & entry refinement
4. 1H            → Entry timing & confirmation
5. 15M/5M        → Precision entry, stop placement

Rule: Never trade against the higher timeframe trend. Only enter on LTF alignment with HTF.
\`\`\`

## CANDLESTICK PATTERNS

| Pattern | Signal | Confirmation |
|---------|--------|--------------|
| Doji / Pin Bar | Indecision / rejection at key level | High-volume + key S/R location |
| Engulfing (Bull/Bear) | Strong reversal signal | Next candle close + volume |
| Hammer / Shooting Star | Bullish/Bearish rejection wicks | At support/resistance |
| Morning/Evening Star | 3-candle reversal | Volume + structure context |
| Inside Bar | Consolidation / squeeze; breakout = direction | Volume expansion on break |

## CORRELATION ANALYSIS

| Pair | Correlation | Implication |
|------|-------------|-------------|
| BTC / ETH | High positive (~0.85) | BTC leads; ETH confirms |
| BTC / S&P 500 | Moderate positive (risk-on/off) | Macro risk sentiment driver |
| BTC / DXY | Negative | Strong USD = crypto headwind |
| BTC / Gold | Moderate positive | "Digital gold" narrative |
| Altcoins / BTC.D | Inverse | Bitcoin dominance up = alts bleed |
`,
}
