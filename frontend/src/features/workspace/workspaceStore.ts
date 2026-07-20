import { create } from "zustand";

interface WorkspaceState {
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  setActiveProject: (projectId: string | null) => void;
  toggleSidebar: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  sidebarCollapsed: false,
  setActiveProject: (projectId) => set({ activeProjectId: projectId }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
