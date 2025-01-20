import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
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
  const isAgent = user?.user_metadata?.role === 'agent';
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
        isAgent,
        role: user.user_metadata?.role
      });

      // Only set loading on first load
      if (!tickets.length) {
        setLoading(true);
      }
      setIsUpdating(true);

      // Optimize query to fetch only needed fields
      let query = supabase
        .from('tickets_with_users')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (!isAgent && user.id) {
        query = query.eq('user_id', user.id);
        console.log('Filtering tickets for regular user');
      } else {
        console.log('Fetching all tickets for agent');
      }

      const { data: ticketData, error: ticketError } = await query;

      if (ticketError) {
        console.error('Error fetching tickets:', ticketError);
        throw ticketError;
      }

      console.log('Received ticket data:', {
        count: ticketData?.length || 0,
        firstTicket: ticketData?.[0]
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
        open: ticketData.filter(t => t.status === 'open').length,
        inProgress: ticketData.filter(t => t.status === 'pending').length,
        resolved: ticketData.filter(t => t.status === 'solved').length
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
      console.error('Error fetching dashboard data:', error.message, error.stack);
      setStats(initialStats);
      setTickets([]);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, [user?.id, isAgent, tickets.length]);

  // Fetch data immediately when user is available
  useEffect(() => {
    console.log('DashboardProvider effect triggered:', {
      hasUserId: !!user?.id,
      isAgent,
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