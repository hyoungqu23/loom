import {
  GateDecision,
  LoomPhase,
  PhaseGateRecord,
} from "../types.js";
import { loadState, writeState } from "./session.js";

export type RecordPhaseGateInput = {
  decision: GateDecision;
  note?: string;
};

export function recordPhaseGate(
  sessionDir: string,
  phase: LoomPhase,
  input: RecordPhaseGateInput,
): PhaseGateRecord {
  const state = loadState(sessionDir);
  const record: PhaseGateRecord = {
    phase,
    decision: input.decision,
    at: new Date().toISOString(),
  };
  if (input.note) record.note = input.note;
  state.gates.push(record);
  writeState(sessionDir, state);
  return record;
}
