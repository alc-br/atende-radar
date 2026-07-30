'use client'
import { create } from 'zustand'

type View = 'dashboard' | 'alerts' | 'conversations' | 'conversation-detail' | 'recovery' | 'team' | 'agent-profile' | 'reports' | 'connections' | 'settings'

interface AppState {
  currentView: View
  selectedConversationId: string | null
  selectedAgentId: string | null
  sidebarOpen: boolean
  period: string
  setView: (view: View) => void
  selectConversation: (id: string | null) => void
  selectAgent: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setPeriod: (period: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  selectedConversationId: null,
  selectedAgentId: null,
  sidebarOpen: true,
  period: '7d',
  setView: (view) => set({ currentView: view }),
  selectConversation: (id) => set({ selectedConversationId: id, currentView: id ? 'conversation-detail' : 'conversations' }),
  selectAgent: (id) => set({ selectedAgentId: id, currentView: id ? 'agent-profile' : 'team' }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setPeriod: (period) => set({ period }),
}))
