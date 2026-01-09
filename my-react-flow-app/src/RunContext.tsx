// File: my-react-flow-app/src/RunContext.tsx
import React, { createContext, useContext } from 'react';

type RunCtx = { runNode: (id: string) => void };
const Ctx = createContext<RunCtx | null>(null);

export const RunProvider: React.FC<{ runNode: (id: string) => void; children: React.ReactNode }> = ({ runNode, children }) => {
  return <Ctx.Provider value={{ runNode }}>{children}</Ctx.Provider>;
};

export function useRunNode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRunNode must be used inside <RunProvider>');
  return ctx.runNode;
}