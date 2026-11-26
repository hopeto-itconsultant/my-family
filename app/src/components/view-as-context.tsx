'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ViewAsReadOnlyContext = createContext(false);

export function ViewAsProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <ViewAsReadOnlyContext.Provider value={active}>{children}</ViewAsReadOnlyContext.Provider>;
}

/** Client write sheets call this and render nothing while a preview is active. */
export function useViewAsReadOnly(): boolean {
  return useContext(ViewAsReadOnlyContext);
}
