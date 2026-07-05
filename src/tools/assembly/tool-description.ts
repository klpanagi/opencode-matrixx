/** Assembly tool description for LLM consumption */
export const TOOL_DESCRIPTION = `
Spawns multiple AI agents (voters) with different model providers to independently analyze a question or decision, then synthesizes their reasoning into a unified consensus.

## When to use
- Making critical decisions that benefit from multiple perspectives
- Evaluating complex tradeoffs where bias reduction matters
- Validating architectural choices through multi-model reasoning
- When you need confidence scoring on analysis

## How it works
1. **Voter selection**: Auto-selects N models from configured providers (or use your override)
2. **Independent voting**: Each voter independently analyzes the question
3. **Synthesis**: All voter outputs are fed to a synthesis round that identifies agreement, disagreement, and confidence
4. **Multi-round**: Optionally repeat synthesis for deeper convergence

## Output format
Returns a structured consensus with:
- Unified answer/conclusion
- Confidence level (high/medium/low)
- Key disagreements between voters
- Per-voter reasoning traces
`
