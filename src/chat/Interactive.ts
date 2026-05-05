import * as React from "react";
import { useApp, useInput } from "ink";
import { ChatApp } from "./App.js";
import { ChatState } from "./state.js";
import { handleChatInput, ChatInputResult } from "./controller.js";
import { Transcript, TranscriptMessage } from "./transcript.js";

const DEFAULT_DETAIL_PLACEHOLDER =
  "Synthesis will appear here after a phase run.";

type ChatInputFn = (
  state: ChatState,
  transcript: Transcript,
  input: string,
  opts?: { onTranscript?: (transcript: Transcript) => void },
) => Promise<ChatInputResult>;

/**
 * Normalised keyboard event accepted by `dispatchChatKey`. Mirrors the
 * subset of Ink's `Key` shape we actually act on so the dispatcher
 * stays decoupled from the Ink runtime and is unit-testable.
 */
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
  appendNotice: (text: string) => void;
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
    if (deps.busy) {
      deps.appendNotice(
        "cancel requested; current run will continue to completion",
      );
      return;
    }
    deps.exit();
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
 * Reducer-managed UI state for InteractiveChat. Pulling the four
 * pieces (chatState, transcript, input, busy) into a single reducer
 * means the controller round-trip applies as ONE state transition and
 * neighbours never observe a half-updated snapshot. This also lets
 * useInput's callback close over a stable `dispatch` reference rather
 * than the ever-changing setX trio.
 */
export type ChatUIState = {
  chatState: ChatState;
  transcript: Transcript;
  input: string;
  busy: boolean;
};

export type ChatUIAction =
  | { type: "input/append"; char: string }
  | { type: "input/backspace" }
  | { type: "input/clear" }
  | { type: "transcript/append"; entry: TranscriptMessage }
  | { type: "transcript/replace"; transcript: Transcript }
  | { type: "submit/start" }
  | {
      type: "submit/finish";
      chatState: ChatState;
      transcript: Transcript;
    }
  | { type: "submit/error"; entry: TranscriptMessage };

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
      return { ...state, transcript: [...state.transcript, action.entry] };
    case "transcript/replace":
      return { ...state, transcript: action.transcript };
    case "submit/start":
      return { ...state, busy: true };
    case "submit/finish":
      return {
        ...state,
        busy: false,
        chatState: action.chatState,
        transcript: action.transcript,
      };
    case "submit/error":
      return {
        ...state,
        busy: false,
        transcript: [...state.transcript, action.entry],
      };
  }
}

export type InteractiveProps = {
  initialState: ChatState;
  initialTranscript?: Transcript;
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
    chatState: props.initialState,
    transcript: props.initialTranscript ?? [],
    input: "",
    busy: false,
  }));

  // Mirror the latest UI snapshot into a ref so submit() / useInput
  // callbacks can read fresh values without listing every field in
  // their dependency arrays. Keeps the callbacks themselves stable
  // across renders.
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
      const result = await handleRef.current(
        uiRef.current.chatState,
        uiRef.current.transcript,
        text,
        {
          onTranscript: (live) =>
            dispatch({ type: "transcript/replace", transcript: live }),
        },
      );
      dispatch({
        type: "submit/finish",
        chatState: result.state,
        transcript: result.transcript,
      });
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
        appendNotice: (text) =>
          dispatch({
            type: "transcript/append",
            entry: { type: "system", text },
          }),
        removeLastChar: () => dispatch({ type: "input/backspace" }),
        appendChar: (next) => dispatch({ type: "input/append", char: next }),
        submit: () => void submit(),
        exit: () => onExitRef.current(),
      },
    );
  });

  const detail = ui.chatState.detail || DEFAULT_DETAIL_PLACEHOLDER;
  return React.createElement(ChatApp, {
    state: ui.chatState,
    messages: ui.transcript,
    detail,
    input: ui.input,
  });
}
