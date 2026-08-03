'use client'
import { create } from 'zustand'

type View = 'dashboard' | 'alerts' | 'conversations' | 'conversation-detail' | 'recovery' | 'team' | 'agent-profile' | 'reports' | 'connections' | 'settings' | 'onboarding' | 'members' | 'teams' | 'plans' | 'notifications' | 'admin' | 'landing' | 'login'

interface CurrentOrganization {
  id: string
  name: string
  displayName: string
  segment: string
  timezone: string
  currency: string
  status: string
  phone: string
  adminEmail: string
  logoUrl: string | null
  website: string | null
}

interface AppState {
  currentView: View
  selectedConversationId: string | null
  selectedAgentId: string | null
  sidebarOpen: boolean
  period: string
  refreshTrigger: number
  currentOrganization: CurrentOrganization | null
  showLanding: boolean
  showLogin: boolean
  pendingSearch: string | null
  activeTour: string | null
  activeStep: number
  seenTours: string[]
  toursLoaded: boolean
  setShowLanding: (show: boolean) => void
  setShowLogin: (show: boolean) => void
  setPendingSearch: (query: string | null) => void
  startTour: (tourId: string) => void
  nextTourStep: () => void
  prevTourStep: () => void
  endTour: () => void
  setSeenTours: (seen: string[]) => void
  markTourSeen: (tourId: string) => void
  setView: (view: View) => void
  selectConversation: (id: string | null) => void
  selectAgent: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  setPeriod: (period: string) => void
  incrementRefresh: () => void
  setCurrentOrganization: (org: CurrentOrganization | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  selectedConversationId: null,
  selectedAgentId: null,
  sidebarOpen: true,
  period: '7d',
  refreshTrigger: 0,
  currentOrganization: null,
  showLanding: true,
  showLogin: false,
  pendingSearch: null,
  activeTour: null,
  activeStep: 0,
  seenTours: [],
  toursLoaded: false,
  setPendingSearch: (query) => set({ pendingSearch: query }),
  startTour: (tourId) => set({ activeTour: tourId, activeStep: 0 }),
  nextTourStep: () => set((s) => ({ activeStep: s.activeStep + 1 })),
  prevTourStep: () => set((s) => ({ activeStep: Math.max(0, s.activeStep - 1) })),
  endTour: () => set({ activeTour: null, activeStep: 0 }),
  setSeenTours: (seen) => set({ seenTours: seen, toursLoaded: true }),
  markTourSeen: (tourId) => set((s) => ({ seenTours: s.seenTours.includes(tourId) ? s.seenTours : [...s.seenTours, tourId] })),
  setView: (view) => set({ currentView: view }),
  selectConversation: (id) => set({ selectedConversationId: id, currentView: id ? 'conversation-detail' : 'conversations' }),
  selectAgent: (id) => set({ selectedAgentId: id, currentView: id ? 'agent-profile' : 'team' }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setPeriod: (period) => set({ period }),
  incrementRefresh: () => set((s) => ({ refreshTrigger: s.refreshTrigger + 1 })),
  setCurrentOrganization: (org) => set({ currentOrganization: org }),
  setShowLanding: (show) => set({ showLanding: show }),
  setShowLogin: (show) => set({ showLogin: show }),
}))
