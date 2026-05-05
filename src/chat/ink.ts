/**
 * Narrow injection point for the two ink/react entry points the chat
 * starter actually calls. Test code can supply a hand-built stub via
 * `startChat({ loadInk: ... })` without pulling in real React or Ink
 * modules; production calls go through `loadInkModules()` which uses
 * dynamic import to load both lazily.
 *
 * InteractiveChat itself imports react / ink directly because Ink
 * hooks (`useApp`, `useInput`) must be referenced statically at the
 * component definition site — splitting that through this layer would
 * trade one form of indirection for a worse one.
 */
export type InkModules = {
  createElement: (...args: unknown[]) => unknown;
  render: (element: unknown) => unknown;
};

export async function loadInkModules(): Promise<InkModules> {
  const React = await import("react");
  const ink = await import("ink");
  return {
    createElement: React.createElement as InkModules["createElement"],
    render: ink.render as InkModules["render"],
  };
}
