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
/**
 * The Ink render instance exposes `waitUntilExit()` so callers can
 * keep their process alive until the user quits. We type it as
 * optional so test stubs that return `undefined` from `render()` stay
 * compatible — production callers reach for the real Ink instance
 * which always provides it.
 */
export type InkRenderInstance = {
  waitUntilExit?: () => Promise<void>;
};

export type InkModules = {
  createElement: (...args: unknown[]) => unknown;
  render: (element: unknown) => InkRenderInstance | undefined | void;
};

export async function loadInkModules(): Promise<InkModules> {
  const React = await import("react");
  const ink = await import("ink");
  return {
    createElement: React.createElement as InkModules["createElement"],
    render: ink.render as InkModules["render"],
  };
}
