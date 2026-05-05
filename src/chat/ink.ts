import type * as ReactNS from "react";
import type * as InkNS from "ink";

export type InkModules = {
  React: typeof ReactNS;
  render: typeof InkNS.render;
  Box: typeof InkNS.Box;
  Text: typeof InkNS.Text;
};

export async function loadInkModules(): Promise<InkModules> {
  const React = await import("react");
  const ink = await import("ink");
  return {
    React,
    render: ink.render,
    Box: ink.Box,
    Text: ink.Text,
  };
}
