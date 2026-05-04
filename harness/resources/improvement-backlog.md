# Improvement Backlog

Loom appends evolution candidates here from `.loom/memory/*-wrap.md`.

## Evolution Run - 2026-05-02T13:42:20.576Z

Source memories: 1

## Summary
- The corpus shows one clear recurring issue inside the session: a role-label task was ambiguous enough that two workers produced defensible but different answers.
- The fallout was specification drift, not execution failure; the gap is in the output contract and reviewer policy.
- The best candidates are a contract clarification, a review-policy decision, a backlog calibration item, and a small runtime prompt change.

## Findings
- `criteria_candidate`: Define the line-1 convention for role-label tasks. Evidence files: Memory `2026-05-02T11-10-20-221Z-team-run-wrap.md`; [loom/README.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/README.md); [loom/harness/contracts/synthesis.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/contracts/synthesis.md); [loom/harness/contracts/review.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/contracts/review.md). Rationale: `bard` returned the literal prompt text while `shen` returned the assigned role name, and the memory says both are defensible depending on interpretation. Recommended target file: [loom/harness/contracts/synthesis.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/contracts/synthesis.md).
- `team_decision_candidate`: Record a single acceptance policy for literal-vs-semantic interpretation in role-label checks. Evidence files: Memory `2026-05-02T11-10-20-221Z-team-run-wrap.md`; [loom/harness/contracts/review.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/contracts/review.md). Rationale: reviewer calibration is currently inconsistent, and the memory warns that future accept/reject decisions may diverge without a shared rule. Recommended target file: [loom/harness/contracts/review.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/contracts/review.md).
- `backlog_candidate`: Add the ambiguity as a calibration/test case. Evidence files: Memory `2026-05-02T11-10-20-221Z-team-run-wrap.md`; [loom/harness/resources/improvement-backlog.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/resources/improvement-backlog.md). Rationale: the memory explicitly calls for recording the ambiguity as a test case so future reviewers can be calibrated against it. Recommended target file: [loom/harness/resources/improvement-backlog.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/harness/resources/improvement-backlog.md).
- `runtime_change_candidate`: Inject the convention into the runtime prompt assembly for role-label tasks. Evidence files: Memory `2026-05-02T11-10-20-221Z-team-run-wrap.md`; [loom/README.md](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/README.md); [loom/src/cli.js](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/src/cli.js). Rationale: the runtime already composes role prompts and output contracts, so this ambiguity can be prevented earlier by making the expected interpretation explicit before dispatch. Recommended target file: [loom/src/cli.js](/Users/hyoungmin/Developments/Aents/claude-plugins-main/loom/src/cli.js).

## Risks
- The same ambiguity can recur unless the literal-vs-semantic rule is written once and reused.
- Downstream automation may keep misclassifying correct answers if the evaluation path does not separate echo tasks from semantic role-name tasks.
- The corpus is only one session, so the recurrence claim is suggestive rather than statistically established.

## Decisions
- Session-scoped resolution: prefer `shen` when the task is meant to report the assigned role; accept `bard` only when the instruction is intentionally literal.
- Standardize the line-1 convention before the next role-label run so the same argument does not reappear.

## Next Actions
- Update the relevant contract to state the line-1 expectation unambiguously.
- Add the ambiguity to the improvement backlog or calibration set.
- Patch the runtime prompt composition so role-label tasks carry the explicit convention at dispatch time.
- Re-run one calibration case to confirm the new rule yields a single expected answer.

## Confidence
Medium, because the evidence is direct but comes from a single session memory, so recurrence is inferred rather than repeatedly observed.
