import type { BuiltinSkill } from "../types"

export const CRYPTO_ONCHAIN_SKILL_NAME = "crypto-onchain"

export const CRYPTO_ONCHAIN_SKILL_DESCRIPTION =
  "Crypto on-chain analysis and DeFi expertise: MVRV, NVT, SOPR, exchange flows, whale tracking, network health metrics, tokenomics analysis, DeFi protocol assessment (TVL, yield, impermanent loss, protocol risk), and blockchain fundamentals. Triggers: 'on-chain', 'onchain', 'blockchain metrics', 'DeFi', 'TVL', 'tokenomics', 'whale', 'exchange inflow', 'MVRV', 'NVT'."

export const cryptoOnchainSkill: BuiltinSkill = {
  name: CRYPTO_ONCHAIN_SKILL_NAME,
  description: CRYPTO_ONCHAIN_SKILL_DESCRIPTION,
  template: `# Crypto On-Chain Analysis & DeFi — Expert Framework

## ON-CHAIN MARKET METRICS

### Valuation Metrics
| Metric | Formula | Signal |
|--------|---------|--------|
| **MVRV Ratio** | Market Cap / Realized Cap | >3.5 = historically overbought; <1 = deep undervalue (accumulation zone) |
| **NVT Ratio** | Network Value / Transaction Volume | High NVT = overvalued vs usage; Low NVT = undervalued |
| **NVT Signal** | NVT with 90-day MA of TX volume | More responsive than standard NVT; >150 sell signal |
| **Puell Multiple** | Daily issuance $ / 365-day MA of daily issuance $ | >4 = miner selling pressure; <0.5 = miner capitulation (buy zone) |
| **Stock-to-Flow** | Existing supply / Annual production | S2F deflation model; deviation tracks premium/discount |

### Holder Behavior
| Metric | Definition | Signal |
|--------|------------|--------|
| **SOPR** | Spent Output Profit Ratio — profit/loss of moved coins | >1 = selling in profit; <1 = selling at loss (capitulation) |
| **LTH-SOPR** | SOPR for coins held >155 days | <1 = long-term holders capitulating (extreme buy signal) |
| **STH-SOPR** | SOPR for coins held <155 days | Sensitive to market sentiment; mean reverts quickly |
| **HODL Waves** | Age distribution of coin supply | Increasing older bands = accumulation; younger bands increase = distribution |
| **CDD** | Coin Days Destroyed — old coins moving | Spike = long-term holders distributing (bearish) |

### Exchange Flows
| Signal | Bullish | Bearish |
|--------|---------|---------|
| **Exchange Inflow** | Low / decreasing → coins leaving exchanges | High / increasing → selling pressure incoming |
| **Exchange Netflow** | Negative (outflows > inflows) | Positive (inflows > outflows) |
| **Exchange Balance** | Declining → HODLing | Rising → potential selling |
| **Stablecoin Ratio** | High stablecoin ratio on exchanges → buying power available | Low ratio → limited buying powder |

### Miner Metrics
| Metric | Signal |
|--------|--------|
| **Hash Rate** | Rising = network security growing / confidence; Falling = miner stress |
| **Miner Revenue** | Declining for extended period = miner capitulation risk |
| **Difficulty Adjustment** | Negative adjustments = miners going offline (bearish short-term) |
| **Miner Outflows** | High miner outflows to exchanges = selling pressure; Low = accumulating |

## WHALE & LARGE HOLDER TRACKING

### Interpretation Framework
\`\`\`
Whale accumulation signals:
- Exchange balance decreasing while price stable/falling
- Large wallet count (>1000 BTC) increasing
- OTC desk activity elevated (dark pool buying)
- Negative exchange netflow during price consolidation

Whale distribution signals:
- Exchange inflows spike from known whale wallets
- Rising large transaction count (>$1M)
- Exchange balance increasing during price rallies
- On-chain age bands shifting younger (old coins moving)
\`\`\`

### Key Data Sources
| Source | Best For |
|--------|---------|
| Glassnode | BTC/ETH deep on-chain; MVRV, SOPR, exchange flows |
| Nansen | Wallet labeling; smart money tracking; NFT analytics |
| Dune Analytics | Custom SQL queries on EVM chains; protocol analytics |
| Arkham | Entity identification; cross-chain wallet tracking |
| Santiment | Social sentiment + on-chain correlation |
| IntoTheBlock | Multi-chain; in-the-money (ITM) analysis |
| CryptoQuant | Exchange flows; miner data; derivatives |

## TOKENOMICS ANALYSIS

### Supply Schedule Assessment
\`\`\`
Red flags:
- Team/investor allocation >40% of total supply
- Short cliff periods (<6 months) with large unlock events
- Inflation rate >10% annually without corresponding demand growth
- No supply cap (unlimited inflation model)

Green flags:
- Supply cap with decreasing issuance (Bitcoin model)
- Long vesting schedules (3-4 years with 1-year cliff)
- Burn mechanisms linked to protocol revenue
- Community/ecosystem allocation >50%
\`\`\`

### Token Unlock Calendar
| Risk Level | Unlock Type | Action |
|------------|------------|--------|
| High | Team/investor unlock (>5% of circulating supply) | Reduce position 2–4 weeks before; re-enter post-dump |
| Medium | Foundation unlock | Monitor wallet activity |
| Low | Community/ecosystem release | Usually absorbed; no action needed |
| Opportunity | Exchange listing of locked tokens | Potential buy if undervalued pre-unlock |

### Value Accrual Mechanisms
| Mechanism | Examples | Analysis Focus |
|-----------|---------|----------------|
| Fee Revenue → Token | GMX, dYdX, Uniswap (proposal) | Revenue/FDV ratio; PE equivalent |
| Burn Mechanism | ETH (EIP-1559), BNB | Net issuance = inflation - burned |
| Staking Yield | ETH staking, SOL, AVAX | Real yield vs inflationary yield distinction |
| Governance Premium | Compound, AAVE | Voting power value; treasury size |
| Buyback & Burn | Binance (BNB) | Quarterly buyback schedule; transparency |

## DEFI PROTOCOL ANALYSIS

### TVL & Protocol Health
\`\`\`
Key metrics (via DeFiLlama):
- TVL trend: Growing = capital inflow; declining = outflow
- TVL/Market Cap ratio: Low = undervalued vs usage; High = speculation premium
- Revenue/TVL: Protocol efficiency metric
- Active Users: DAU/MAU ratio; retention
- Protocol Revenue vs Token Emissions: "Real yield" protocols sustainable; emission-dependent = Ponzi risk
\`\`\`

### DeFi Risk Matrix
| Risk Type | Description | Assessment |
|-----------|-------------|------------|
| **Smart Contract Risk** | Code exploits / bugs | Audit status, audit firm reputation, bug bounty, age of code |
| **Liquidity Risk** | Thin pools = high slippage / bank runs | TVL depth, pool concentration, withdrawal limits |
| **Oracle Risk** | Price feed manipulation | Oracle provider (Chainlink preferred), TWAP vs spot, circuit breakers |
| **Governance Risk** | Malicious governance attack | Token distribution, voting power concentration, timelock delays |
| **Regulatory Risk** | Protocol shutdown / sanctions | Jurisdiction, team identity, compliance stance |
| **Composability Risk** | Cascade failures across protocols | Exposure to multiple dependent protocols |

### Impermanent Loss (IL) Calculator
\`\`\`
IL = 2√(price_ratio) / (1 + price_ratio) - 1

Price change 2× → IL ≈ 5.7%
Price change 4× → IL ≈ 20%
Price change 10× → IL ≈ 42%

IL Mitigation:
- Concentrated liquidity: only in highly correlated pairs (ETH/WBTC)
- Stablecoin pairs: minimal IL; yield = fees only
- Asymmetric positions: more of the asset expected to outperform
- Hold until fees accumulated > IL (track via APY vs IL curve)
\`\`\`

### Yield Farming Assessment Framework
\`\`\`
Step 1: Identify yield source
  - Fee revenue → sustainable
  - Inflation (token emissions) → unsustainable; timing matters

Step 2: Calculate real yield
  Real APY = Nominal APY - Token inflation rate - IL estimate

Step 3: Assess exit liquidity
  - Can I exit at this TVL without significant slippage?
  - What happens if TVL drops 50%?

Step 4: Protocol survivability
  - How long can emissions sustain at current rate?
  - What's the treasury runway?
\`\`\`

## MACRO CRYPTO FRAMEWORK

### Market Cycle Phases
\`\`\`
Accumulation: MVRV <1, exchange outflows high, sentiment = fear, low volatility
→ Best: Spot buying; DCA entry

Markup: Rising MVRV (1–3), trending price, rising OI, moderate sentiment
→ Best: Trend following; scaling in

Distribution: MVRV >3.5, exchange inflows rising, funding rate high, euphoria sentiment
→ Best: Reduce exposure; take profit on alts; hold BTC/ETH heavy

Markdown: Declining MVRV, capitulation events, LTH-SOPR <1, panic sentiment
→ Best: Stable; watch for SOPR reset and LTH capitulation completion
\`\`\`

### Halving Cycle Awareness
| Period | Historical Pattern |
|--------|-------------------|
| Pre-halving (-12 months) | Accumulation; miners and smart money position |
| Halving month | Initial spike then correction (sell the news) |
| Post-halving (+6–18 months) | Major bull run (supply shock + increased demand) |
| Post-peak (+18–30 months) | Bear market / accumulation phase resumes |
`,
}
