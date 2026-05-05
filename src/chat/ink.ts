export type InkModules = {
  React: {
    createElement: (...args: unknown[]) => unknown;
  };
  render: (...args: unknown[]) => unknown;
  Box: (...args: unknown[]) => unknown;
  Text: (...args: unknown[]) => unknown;
};

export async function loadInkModules(): Promise<InkModules> {
  const React = require("react");
  const ink = require("ink");
  return {
    React,
    render: ink.render,
    Box: ink.Box,
    Text: ink.Text,
  };
}
