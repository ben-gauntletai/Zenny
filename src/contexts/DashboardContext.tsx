import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { ticketService } from '../services/ticketService';
import type { TicketWithUsers } from '../types/supabase';

interface DashboardStats {
  ticketStats: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  };
  recentTickets: TicketWithUsers[];
  recentCustomers: any[];
  activityFeed: any[];
}

interface DashboardContextType {
  stats: DashboardStats;
  tickets: TicketWithUsers[];
  loading: boolean;
  isUpdating: boolean;
  refreshStats: () => Promise<void>;
}

const mockActivities = [
  {
    id: '1',
    type: 'priority_changed',
    ticketId: '1',
    ticketSubject: 'Need help with billing',
    actor: 'Support Agent',
    timestamp: new Date().toISOString(),
    details: {
      priority: 'high'
    }
  },
  {
    id: '2',
    type: 'assigned',
    ticketId: '2',
    ticketSubject: 'Login issues after update',
    actor: 'System',
    timestamp: new Date(Date.now() - 30 * 60000).toISOString()
  },
  {
    id: '3',
    type: 'priority_changed',
    ticketId: '3',
    ticketSubject: 'Feature request: Dark mode',
    actor: 'Support Agent',
    timestamp: new Date(Date.now() - 60 * 60000).toISOString(),
    details: {
      priority: 'medium'
    }
  }
];

const initialStats: DashboardStats = {
  ticketStats: { total: 0, open: 0, inProgress: 0, resolved: 0 },
  recentTickets: [],
  recentCustomers: [],
  activityFeed: mockActivities
};

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [tickets, setTickets] = useState<TicketWithUsers[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) {
      console.log('No user ID available');
      return;
    }
    
    try {
      console.log('Fetching dashboard data for user:', {
        userId: user.id,
        role: user.user_metadata?.role
      });

      // Only set loading on first load
      if (!tickets.length) {
        setLoading(true);
      }
      setIsUpdating(true);

      // Fetch tickets using the Edge Function
      const { tickets: ticketData } = await ticketService.listTickets({
        limit: 50
      });

      if (!ticketData?.length) {
        console.log('No tickets found, resetting to initial state');
        setStats(initialStats);
        setTickets([]);
        return;
      }

      // Calculate ticket stats
      const ticketStats = {
        total: ticketData.length,
        open: ticketData.filter((t: TicketWithUsers) => t.status === 'open').length,
        inProgress: ticketData.filter((t: TicketWithUsers) => t.status === 'pending').length,
        resolved: ticketData.filter((t: TicketWithUsers) => t.status === 'solved').length
      };

      console.log('Calculated ticket stats:', ticketStats);

      // Update state in one batch
      setStats({
        ticketStats,
        recentTickets: ticketData.slice(0, 5),
        recentCustomers: [],
        activityFeed: mockActivities
      });
      setTickets(ticketData);
      
      console.log('Updated dashboard state with:', {
        ticketCount: ticketData.length,
        stats: ticketStats
      });
      
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error.message);
      setStats(initialStats);
      setTickets([]);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, [user?.id, tickets.length]);

  // Fetch data immediately when user is available
  useEffect(() => {
    console.log('DashboardProvider effect triggered:', {
      hasUserId: !!user?.id,
      currentTicketCount: tickets.length
    });
    
    if (user?.id) {
      fetchDashboardData();
    }
  }, [user?.id, fetchDashboardData]);

  return (
    <DashboardContext.Provider value={{
      stats,
      tickets,
      loading,
      isUpdating,
      refreshStats: fetchDashboardData
    }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}; 