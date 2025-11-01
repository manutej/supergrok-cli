# SuperGrok Multi-Agent Orchestration Guide

**Last Updated:** 2025-11-01
**Version:** 2.0.0-alpha.1

---

## Overview

The SuperGrok multi-agent orchestration system allows you to maximize the utility of your 2 SuperGrok Heavy subscriptions by distributing work intelligently across both accounts. The system features:

- **Hierarchical Agent System**: SuperAgent → SubAgents
- **Smart Load Balancing**: Round-robin, least-loaded, or cost-optimized strategies
- **Conversation Persistence**: All conversations, documents, and prompts saved to SQLite
- **Prompt Library**: Reusable templates with variable substitution
- **Multi-Model Support**: Automatic model selection based on task complexity

---

## Quick Start

### 1. Initialize Orchestration

First, configure your orchestration with both API keys:

```bash
supergrok orchestrate init \
  --account1-key xai-YOUR-KEY-1 \
  --account2-key xai-YOUR-KEY-2 \
  --account1-name "Primary" \
  --account2-name "Secondary" \
  --strategy least-loaded \
  --max-concurrent 10 \
  --rate-limit 60
```

This creates a configuration file at `~/.supergrok/orchestration-config.json`.

**Parameters:**
- `--account1-key`: API key for first account (required)
- `--account2-key`: API key for second account (required)
- `--account1-name`: Friendly name for account 1 (default: "Primary")
- `--account2-name`: Friendly name for account 2 (default: "Secondary")
- `--strategy`: Load balancing strategy (default: "least-loaded")
  - `round-robin`: Alternate between accounts
  - `least-loaded`: Use account with fewer active requests
  - `cost-optimized`: Use cheaper account when possible
- `--max-concurrent`: Max concurrent requests per account (default: 10)
- `--rate-limit`: Requests per minute per account (default: 60)

---

### 2. Run Your First Task

Execute a task using multi-agent orchestration:

```bash
supergrok orchestrate run \
  --task "Analyze the authentication system and suggest improvements" \
  --context "Focus on security best practices" \
  --complexity medium \
  --priority 3 \
  --sub-agents 5 \
  --strategy adaptive
```

**Parameters:**
- `--task, -t`: Task description (required)
- `--context, -c`: Additional context for the task
- `--complexity`: Task complexity (simple, medium, complex) - default: medium
- `--priority`: Task priority 1-5 - default: 3
- `--sub-agents`: Max sub-agents to spawn - default: 5
- `--strategy`: Execution strategy (parallel, sequential, adaptive) - default: adaptive
- `--no-save`: Don't save conversation history

**Execution Strategies:**
- `parallel`: All sub-tasks execute simultaneously (fastest)
- `sequential`: Sub-tasks execute one after another (more coherent)
- `adaptive`: Simple tasks in parallel, complex tasks sequentially (balanced)

---

### 3. View Statistics

Check usage across both accounts:

```bash
supergrok orchestrate stats
```

Output:
```
📊 Orchestration Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Conversations: 1,234
Total Documents: 567
Total Prompts: 12
Total Agents: 89

Account Usage:
  Account 1: 45 agents
  Account 2: 44 agents
```

---

### 4. View Conversation History

See recent conversations:

```bash
supergrok orchestrate history --limit 10
```

---

## Prompt Library

The prompt library allows you to save and reuse prompt templates across your agents.

### Initialize Default Templates

Create 8 pre-loaded templates:

```bash
supergrok library init
```

Default templates include:
- `code-review`: Code review with security focus
- `documentation-generator`: Generate comprehensive documentation
- `task-breakdown`: Break down complex tasks
- `bug-analysis`: Analyze and debug issues
- `architecture-review`: Review system architecture
- `test-generator`: Generate comprehensive tests
- `refactoring-suggestions`: Suggest refactorings
- `api-design`: Design RESTful APIs

---

### List Available Prompts

```bash
# List all prompts
supergrok library list

# Filter by category
supergrok library list --category code-generation
```

---

### Search Prompts

```bash
supergrok library search "code review"
```

---

### Show a Specific Prompt

```bash
supergrok library show code-review
```

Output:
```
📄 Prompt Template
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: code-review
Category: code-analysis
Description: Perform comprehensive code review with security focus
Usage Count: 5

Template:
────────────────────────────────────────────────────────────
Please perform a comprehensive code review of the following code:

{{code}}

Focus areas:
- Security vulnerabilities
- Performance issues
- Code quality and best practices
- Potential bugs
────────────────────────────────────────────────────────────
```

---

### Save a Custom Prompt

```bash
supergrok library save \
  --name "my-custom-prompt" \
  --content "Analyze this code for {{focus}}: {{code}}" \
  --category "code-analysis" \
  --description "Custom code analysis prompt"
```

---

### Use a Prompt (with Variables)

```bash
supergrok library use code-review \
  --vars '{"code":"function foo() { return true; }"}'
```

This renders the template with variables replaced and outputs the result.

---

## Advanced Examples

### Example 1: Complex Codebase Analysis

```bash
supergrok orchestrate run \
  --task "Perform a comprehensive security audit of the codebase" \
  --context "Focus on authentication, authorization, and data validation" \
  --complexity complex \
  --priority 5 \
  --sub-agents 8 \
  --strategy adaptive
```

**How it works:**
1. SuperAgent decomposes the task into 8 sub-tasks:
   - Audit authentication system
   - Audit authorization logic
   - Check data validation
   - Review API security
   - Analyze database access
   - Check for OWASP Top 10
   - Review dependency security
   - Test input sanitization

2. Simple tasks (like dependency checking) run in parallel

3. Complex tasks (like authentication audit) run sequentially

4. Results are aggregated into a comprehensive security report

5. All conversations and findings saved to database

---

### Example 2: Documentation Generation

```bash
# Initialize prompt library
supergrok library init

# Run orchestrated task using a template
supergrok orchestrate run \
  --task "Generate comprehensive API documentation for all endpoints" \
  --complexity medium \
  --sub-agents 5 \
  --strategy parallel
```

---

### Example 3: Cost-Optimized Strategy

```bash
# Set up with cost-optimized strategy
supergrok orchestrate init \
  --account1-key xai-KEY-1 \
  --account2-key xai-KEY-2 \
  --strategy cost-optimized

# Run many simple tasks (will use cheaper models and distribute optimally)
supergrok orchestrate run \
  --task "Generate unit tests for all utility functions" \
  --complexity simple \
  --sub-agents 10 \
  --strategy parallel
```

---

## Architecture

### System Flow

```
User Request
    ↓
SuperAgent (Orchestrator)
    ↓
Task Decomposition (using grok-3-fast)
    ↓
Sub-Tasks (3-5 tasks)
    ↓
SubAgents (parallel/sequential/adaptive)
    ├─ SubAgent 1 (grok-code-fast-1)
    ├─ SubAgent 2 (grok-3-fast)
    ├─ SubAgent 3 (grok-4)
    └─ SubAgent 4 (grok-code-fast-1)
    ↓
Result Aggregation (using grok-4)
    ↓
Final Response + Saved to Database
```

---

### Account Management

The AccountManager handles:

1. **Load Balancing**:
   - Round-robin: Alternates between accounts
   - Least-loaded: Selects account with fewer active requests
   - Cost-optimized: Uses cheaper account when possible

2. **Rate Limiting**:
   - Tracks requests per minute for each account
   - Automatically waits when both accounts hit rate limits
   - Prevents API errors

3. **Usage Tracking**:
   - Total requests per account
   - Total tokens consumed
   - Estimated costs
   - Real-time statistics

---

### Model Selection

SubAgents automatically select models based on task complexity:

| Complexity | Model | Use Case | Cost |
|------------|-------|----------|------|
| Simple | grok-code-fast-1 | Quick queries, simple refactors | $0.005/1K |
| Medium | grok-3-fast | Standard analysis, code generation | $0.008/1K |
| Complex | grok-4 | Deep reasoning, architecture design | $0.015/1K |

---

### Data Storage

All data is stored in `~/.supergrok/orchestration.db` (SQLite):

**Tables:**
- `conversations`: All user/assistant messages
- `documents`: Generated documents (code, analysis, plans)
- `prompts`: Reusable prompt templates
- `agents`: SuperAgent and SubAgent records

---

## Configuration File

Location: `~/.supergrok/orchestration-config.json`

Example:
```json
{
  "account1": {
    "apiKey": "xai-YOUR-KEY-1",
    "name": "Primary",
    "maxConcurrent": 10,
    "rateLimit": 60
  },
  "account2": {
    "apiKey": "xai-YOUR-KEY-2",
    "name": "Secondary",
    "maxConcurrent": 10,
    "rateLimit": 60
  },
  "strategy": "least-loaded",
  "maxSubAgents": 5,
  "executionStrategy": "adaptive"
}
```

---

## Performance Tips

1. **Use Adaptive Strategy**: Balances speed and coherence
2. **Set Appropriate Complexity**: Don't use "complex" for simple tasks
3. **Limit Sub-Agents**: More isn't always better (3-5 is optimal)
4. **Use Prompt Library**: Reuse tested prompts for consistency
5. **Monitor Stats**: Check `orchestrate stats` to balance account usage

---

## Cost Optimization

### Estimated Costs (per task)

**Simple Task (5 sub-agents, parallel):**
- Decomposition: grok-3-fast (~500 tokens) = $0.004
- 5 SubAgents: grok-code-fast-1 (~1000 tokens each) = $0.025
- Aggregation: grok-4 (~1000 tokens) = $0.015
- **Total: ~$0.044**

**Complex Task (5 sub-agents, adaptive):**
- Decomposition: grok-3-fast (~1000 tokens) = $0.008
- 2 Simple SubAgents: grok-code-fast-1 (~1000 tokens each) = $0.010
- 3 Complex SubAgents: grok-4 (~2000 tokens each) = $0.090
- Aggregation: grok-4 (~2000 tokens) = $0.030
- **Total: ~$0.138**

### Cost Savings

**Single Account vs. Orchestration:**
- Single request to grok-4: 8000 tokens = $0.120
- Orchestrated (5 sub-agents, optimized models): $0.044
- **Savings: 63%**

**Additional Benefits:**
- 2x throughput (parallel processing across 2 accounts)
- Better rate limit management
- More comprehensive results (5 focused agents vs 1 general agent)

---

## Troubleshooting

### "Orchestration not initialized"

Run `supergrok orchestrate init` with both API keys first.

### "Both accounts are rate limited"

Wait 60 seconds or reduce `--rate-limit` in config.

### "Failed to decompose task"

Try a simpler task description or add more context.

### Database locked errors

Close other SuperGrok processes accessing the database.

---

## Next Steps

1. **Explore Phase 1 Features**: See `ROADMAP_V2.0_PROFESSIONAL.md`
2. **Build Custom Plugins**: Coming in Phase 2
3. **Enterprise Governance**: Coming in Phase 2
4. **Desktop Application**: Coming in Phase 3

---

## Support

**Issues:** https://github.com/manutej/supergrok-cli/issues
**Documentation:** https://github.com/manutej/supergrok-cli/tree/main/docs

---

*End of Orchestration Guide*
