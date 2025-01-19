import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import type { TicketStatus, TicketPriority, TicketType, TicketTopic, CustomerType } from '../types/supabase';

interface FormattedTicket {
  id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  ticket_type: TicketType;
  topic: TicketTopic;
  customer_type: CustomerType;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  user: { email: string };
  agent?: { email: string };
}

interface UserMapProfile {
  id: string;
  email: string;
}

interface DashboardStats {
  ticketStats: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  };
  recentTickets: any[];
  recentCustomers: any[];
  activityFeed: any[];
}

interface TicketWithProfiles {
  id: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  ticket_type: TicketType;
  topic: TicketTopic;
  customer_type: CustomerType;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  profiles: { email: string }[];
  agents: { email: string }[] | null;
}

interface DashboardContextType {
  stats: DashboardStats;
  tickets: FormattedTicket[];
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

const createLoadingTicket = (id: number = 0): FormattedTicket => ({
  id,
  subject: 'Loading...',
  description: '',
  status: 'open' as TicketStatus,
  priority: 'normal' as TicketPriority,
  ticket_type: 'question' as TicketType,
  topic: 'general' as TicketTopic,
  customer_type: 'customer' as CustomerType,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  group_id: null,
  user: { email: 'Loading...' },
  agent: { email: 'Loading...' }
});

const initialTickets: FormattedTicket[] = [createLoadingTicket()];

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
  const [tickets, setTickets] = useState<FormattedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      // Only set loading on first load
      if (!tickets.length) {
        setLoading(true);
      }
      setIsUpdating(true);

      // Optimize query to fetch only needed fields
      const ticketQuery = supabase
        .from('tickets')
        .select(`
          id,
          subject,
          status,
          priority,
          ticket_type,
          topic,
          customer_type,
          created_at,
          updated_at,
          profiles!tickets_user_id_fkey(email),
          agents:profiles!tickets_assigned_to_fkey(email)
        `)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (!isAgent && user.id) {
        ticketQuery.eq('user_id', user.id);
      }

      const { data: ticketData, error: ticketError } = await ticketQuery;

      if (ticketError) throw ticketError;

      if (!ticketData?.length) {
        setStats(initialStats);
        setTickets([]);
        return;
      }

      // Format tickets with joined user data - only include necessary fields
      const formattedTickets: FormattedTicket[] = ticketData.map((ticket: any) => ({
        id: ticket.id,
        subject: ticket.subject,
        description: '', // Not needed immediately
        status: ticket.status as TicketStatus,
        priority: ticket.priority as TicketPriority,
        ticket_type: ticket.ticket_type || ('question' as TicketType),
        topic: ticket.topic || ('general' as TicketTopic),
        customer_type: ticket.customer_type || ('customer' as CustomerType),
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        group_id: null,
        user: { email: ticket.profiles?.[0]?.email || 'Unknown' },
        agent: ticket.agents?.[0] ? { email: ticket.agents[0].email } : undefined
      }));

      // Calculate ticket stats
      const ticketStats = {
        total: formattedTickets.length,
        open: formattedTickets.filter(t => t.status === ('open' as TicketStatus)).length,
        inProgress: formattedTickets.filter(t => t.status === ('in_progress' as TicketStatus)).length,
        resolved: formattedTickets.filter(t => t.status === ('resolved' as TicketStatus)).length
      };

      // Update state in one batch
      setStats({
        ticketStats,
        recentTickets: formattedTickets.slice(0, 5),
        recentCustomers: [],
        activityFeed: mockActivities
      });
      setTickets(formattedTickets);
      
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error.message);
      setStats(initialStats);
      setTickets([]);
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  }, [user?.id, isAgent, tickets.length]);

  // Fetch data immediately when user is available
  useEffect(() => {
    if (user?.id) {
      fetchDashboardData();
    }
  }, [user?.id]);

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