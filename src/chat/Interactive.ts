import * as React from "react";
import { useApp, useInput } from "ink";
import { ChatApp } from "./App";
import { ChatState } from "./state";
import { handleChatInput, ChatInputResult } from "./controller";
import { Transcript, TranscriptMessage } from "./transcript";

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

/**
 * Pure key dispatcher used by InteractiveChat's useInput callback.
 *
 * Cancellation policy:
 *   - Ctrl+C while idle  → call `exit()` so the host can shut down.
 *   - Ctrl+C while busy  → append a notice; the in-flight run keeps
 *     going (true cancellation requires runner-level support).
 *
 * While `busy` is true, normal keystrokes are dropped so a partial
 * input cannot accumulate against the wrong run.
 */
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

  const [chatState, setChatState] = React.useState<ChatState>(
    props.initialState,
  );
  const [transcript, setTranscript] = React.useState<Transcript>(
    props.initialTranscript ?? [],
  );
  const [input, setInput] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  const submit = React.useCallback(async (): Promise<void> => {
    const text = input;
    setInput("");
    if (!text.trim()) return;
    setBusy(true);
    try {
      const result = await handle(chatState, transcript, text, {
        onTranscript: (live) => setTranscript(live),
      });
      setChatState(result.state);
      setTranscript(result.transcript);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      const entry: TranscriptMessage = {
        type: "error",
        text: `chat error: ${message}`,
      };
      setTranscript((current) => [...current, entry]);
    } finally {
      setBusy(false);
    }
  }, [chatState, handle, input, transcript]);

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
        busy,
        appendNotice: (text) => {
          const entry: TranscriptMessage = { type: "system", text };
          setTranscript((current) => [...current, entry]);
        },
        removeLastChar: () => setInput((current) => current.slice(0, -1)),
        appendChar: (next) => setInput((current) => current + next),
        submit: () => void submit(),
        exit: onExit,
      },
    );
  });

  const detail = chatState.detail || DEFAULT_DETAIL_PLACEHOLDER;
  return React.createElement(ChatApp, {
    state: chatState,
    messages: transcript,
    detail,
    input,
  });
}
