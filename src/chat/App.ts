import * as React from "react";
import { Box, Text } from "ink";
import { ChatState } from "./state.js";
import { renderMarkdown } from "./markdown.js";

export type ChatAppMessage = {
  type: string;
  text: string;
};

export type ChatAppProps = {
  state: ChatState;
  messages: ChatAppMessage[];
  detail: string;
  input: string;
};

function gateLabel(state: ChatState): string {
  if (state.run.status === "waiting-for-gate") {
    return `gate=waiting ${state.run.phase}`;
  }
  return "gate=idle";
}

function runLabel(state: ChatState): string {
  if (state.run.status === "running") return `run=running ${state.run.phase}`;
  if (state.run.status === "waiting-for-gate") return "run=paused";
  return "run=idle";
}

export function ChatApp(props: ChatAppProps): React.ReactElement {
  const header = [
    "loom chat",
    `feature=${props.state.feature}`,
    `phase=${props.state.currentPhase}`,
    runLabel(props.state),
    gateLabel(props.state),
  ].join("  ");

  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { key: "header" }, header),
    React.createElement(
      Box,
      { key: "transcript", flexDirection: "column", marginTop: 1 },
      props.messages.length === 0
        ? React.createElement(Text, { key: "empty" }, "(no messages)")
        : props.messages.map((message, index) =>
            React.createElement(
              Text,
              { key: `${message.type}-${index}` },
              `${message.type}: ${message.text}`,
            ),
          ),
    ),
    React.createElement(
      Box,
      { key: "detail", flexDirection: "column", marginTop: 1 },
      React.createElement(Text, { dimColor: true }, "detail"),
      renderMarkdown(props.detail) ??
        React.createElement(Text, null, "(empty)"),
    ),
    React.createElement(
      Box,
      { key: "footer", marginTop: 1 },
      React.createElement(Text, null, `> ${props.input}`),
    ),
  );
}
