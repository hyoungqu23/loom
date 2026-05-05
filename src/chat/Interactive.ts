import * as React from "react";
import { useApp, useInput } from "ink";
import { ChatApp } from "./App.js";
import { handleChatInput, ChatInputResult } from "./controller.js";
import {
  ChatSnapshot,
  Transcript,
  TranscriptMessage,
  clampTranscript,
} from "./transcript.js";

const DEFAULT_DETAIL_PLACEHOLDER =
  "Synthesis will appear here after a phase run.";

type ChatInputFn = (
  snapshot: ChatSnapshot,
  input: string,
  opts?: { onTranscript?: (transcript: Transcript) => void },
) => Promise<ChatInputResult>;

export type ChatKeyEvent = {
  char: string;
  return?: boolean;
  ctrl?: boolean;
  backspace?: boolean;
  delete?: boolean;
  meta?: boolean;
};

export type ChatKeyDeps = {
  busy: boolean;
  cancelRequested: boolean;
  appendNotice: (text: string) => void;
  markCancelRequested: () => void;
  removeLastChar: () => void;
  appendChar: (char: string) => void;
  submit: () => void;
  exit: () => void;
};

export function dispatchChatKey(
  event: ChatKeyEvent,
  deps: ChatKeyDeps,
): void {
  if (event.ctrl && (event.char === "c" || event.char === "")) {
    if (!deps.busy) {
      deps.exit();
      return;
    }
    if (deps.cancelRequested) {
      // Second Ctrl+C while still busy → force exit. The in-flight
      // child process keeps running but the user wanted out.
      deps.exit();
      return;
    }
    deps.appendNotice(
      "cancel requested; current run will continue. Press Ctrl+C again to force exit.",
    );
    deps.markCancelRequested();
    return;
  }
  if (deps.busy) return;
  if (event.return) {
    deps.submit();
    return;
  }
  if (event.backspace || event.delete) {
    deps.removeLastChar();
    return;
  }
  if (event.char && !event.meta && event.char.length === 1) {
    deps.appendChar(event.char);
  }
}

/**
 * Reducer-managed UI state for InteractiveChat. The domain (state +
 * transcript + detail) lives inside one ChatSnapshot — the chat
 * controller swaps that snapshot atomically per round-trip — and the
 * UI sidecar (input buffer + busy flag) sits next to it.
 */
export type ChatUIState = {
  snapshot: ChatSnapshot;
  input: string;
  busy: boolean;
  /**
   * `true` after the user pressed Ctrl+C once while busy. Cleared on
   * submit/start (new run) and on submit/finish / submit/error (run
   * finished without a forced exit). A second Ctrl+C while this is
   * still set forces an exit.
   */
  cancelRequested: boolean;
};

export type ChatUIAction =
  | { type: "input/append"; char: string }
  | { type: "input/backspace" }
  | { type: "input/clear" }
  | { type: "transcript/append"; entry: TranscriptMessage }
  | { type: "transcript/replace"; transcript: Transcript }
  | { type: "submit/start" }
  | { type: "submit/finish"; snapshot: ChatSnapshot }
  | { type: "submit/error"; entry: TranscriptMessage }
  | { type: "cancel/request" };

export function chatUIReducer(
  state: ChatUIState,
  action: ChatUIAction,
): ChatUIState {
  switch (action.type) {
    case "input/append":
      return { ...state, input: state.input + action.char };
    case "input/backspace":
      return { ...state, input: state.input.slice(0, -1) };
    case "input/clear":
      return { ...state, input: "" };
    case "transcript/append":
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          transcript: clampTranscript([
            ...state.snapshot.transcript,
            action.entry,
          ]),
        },
      };
    case "transcript/replace":
      return {
        ...state,
        snapshot: {
          ...state.snapshot,
          transcript: clampTranscript(action.transcript),
        },
      };
    case "submit/start":
      return { ...state, busy: true, cancelRequested: false };
    case "submit/finish":
      return {
        ...state,
        busy: false,
        cancelRequested: false,
        snapshot: {
          ...action.snapshot,
          transcript: clampTranscript(action.snapshot.transcript),
        },
      };
    case "submit/error":
      return {
        ...state,
        busy: false,
        cancelRequested: false,
        snapshot: {
          ...state.snapshot,
          transcript: clampTranscript([
            ...state.snapshot.transcript,
            action.entry,
          ]),
        },
      };
    case "cancel/request":
      return { ...state, cancelRequested: true };
  }
}

export type InteractiveProps = {
  initialSnapshot: ChatSnapshot;
  /** Test override for the controller; defaults to handleChatInput. */
  handleInput?: ChatInputFn;
  /**
   * Called on Ctrl+C while idle. When omitted the Ink `useApp().exit()`
   * hook is used so the parent process exits cleanly.
   */
  onExit?: () => void;
};

export function InteractiveChat(
  props: InteractiveProps,
): React.ReactElement {
  const handle = props.handleInput ?? handleChatInput;
  const ink = useApp();
  const onExit = props.onExit ?? (() => ink.exit());

  const [ui, dispatch] = React.useReducer(chatUIReducer, undefined, () => ({
    snapshot: props.initialSnapshot,
    input: "",
    busy: false,
    cancelRequested: false,
  }));

  const uiRef = React.useRef(ui);
  uiRef.current = ui;
  const handleRef = React.useRef(handle);
  handleRef.current = handle;
  const onExitRef = React.useRef(onExit);
  onExitRef.current = onExit;

  const submit = React.useCallback(async (): Promise<void> => {
    const text = uiRef.current.input;
    dispatch({ type: "input/clear" });
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed === "/quit") {
      onExitRef.current();
      return;
    }
    dispatch({ type: "submit/start" });
    try {
      const result = await handleRef.current(uiRef.current.snapshot, text, {
        onTranscript: (live) =>
          dispatch({ type: "transcript/replace", transcript: live }),
      });
      dispatch({ type: "submit/finish", snapshot: result });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      dispatch({
        type: "submit/error",
        entry: { type: "error", text: `chat error: ${message}` },
      });
    }
  }, []);

  useInput((char, key) => {
    dispatchChatKey(
      {
        char,
        return: key.return,
        ctrl: key.ctrl,
        backspace: key.backspace,
        delete: key.delete,
        meta: key.meta,
      },
      {
        busy: uiRef.current.busy,
        cancelRequested: uiRef.current.cancelRequested,
        appendNotice: (text) =>
          dispatch({
            type: "transcript/append",
            entry: { type: "system", text },
          }),
        markCancelRequested: () => dispatch({ type: "cancel/request" }),
        removeLastChar: () => dispatch({ type: "input/backspace" }),
        appendChar: (next) => dispatch({ type: "input/append", char: next }),
        submit: () => void submit(),
        exit: () => onExitRef.current(),
      },
    );
  });

  const detail = ui.snapshot.detail || DEFAULT_DETAIL_PLACEHOLDER;
  return React.createElement(ChatApp, {
    state: ui.snapshot.state,
    messages: ui.snapshot.transcript,
    detail,
    input: ui.input,
  });
}
