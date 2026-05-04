# Model Configuration Notes

These defaults are based on official runtime documentation as of 2026-05-02.

## Codex CLI

Default Loom orchestrator:

```json
{
  "runtime": "codex",
  "model": "gpt-5.5",
  "effort": "medium"
}
```

Worker call shape:

```bash
codex exec --sandbox read-only --skip-git-repo-check --ephemeral --model gpt-5.5 --cd "$PWD" "..."
```

Source: OpenAI Codex model documentation.

## Claude Code

Default high-reasoning worker:

```json
{
  "runtime": "claude",
  "model": "opus",
  "effort": "xhigh",
  "permissionMode": "plan"
}
```

Worker call shape:

```bash
claude -p --permission-mode plan --model opus --effort xhigh "..."
```

Claude Code supports model aliases such as `opus`, `sonnet`, `haiku`, and `opusplan`. It also supports `--effort` levels, with Opus 4.7 supporting `low`, `medium`, `high`, `xhigh`, and `max`.

Source: Claude Code model configuration documentation.

## Gemini CLI

Default stable worker:

```json
{
  "runtime": "gemini",
  "model": "gemini-2.5-pro",
  "approvalMode": "plan",
  "outputFormat": "text"
}
```

Worker call shape:

```bash
gemini -p "..." --approval-mode plan --output-format text --model gemini-2.5-pro
```

Gemini CLI recommends Auto for general use, Pro for complex reasoning, and Flash or Flash-Lite for speed. Loom pins `gemini-2.5-pro` initially to avoid preview capacity instability.

Source: Gemini CLI model selection documentation.

## Ollama

Default local worker:

```json
{
  "runtime": "ollama",
  "model": "qwen2.5-coder"
}
```

Worker call shape:

```bash
ollama run qwen2.5-coder "..."
```

Ollama is optional. `loom doctor` reports it as missing when not installed.

## Agent-Level Defaults

Loom should prefer agent-level defaults over runtime-level defaults. Runtime defaults answer "what should this CLI use when called directly?" Agent defaults answer "which model is best for this role?"

| Agent | Runtime | Model | Reason |
|---|---|---|---|
| `twistedfate` | Codex | `gpt-5.5`, medium | orchestration and synthesis |
| `ryze` | Claude | `opus`, xhigh | ambiguous product reasoning |
| `orianna` | Claude | `opus`, xhigh | UX decision depth |
| `hwei` | Gemini | `gemini-2.5-pro` | broad design critique and alternative framing |
| `shen` | Codex | `gpt-5.5`, medium | structured cross-artifact alignment |
| `ornn` | Claude | `opusplan`, high | planning with execution-aware tradeoffs |
| `viktor` | Codex | `gpt-5.4`, medium | implementation worker |
| `kayle` | Claude | `opus`, xhigh | strict review and risk detection |
| `caitlyn` | Gemini | `gemini-2.5-pro` | scenario generation and QA breadth |
| `zilean` | Gemini | `gemini-2.5-pro` | research and documentation validation |
| `bard` | Codex | `gpt-5.4-mini`, medium | low-cost synthesis |
| `local-fast` | Ollama | `qwen2.5-coder` | offline draft/check worker |
