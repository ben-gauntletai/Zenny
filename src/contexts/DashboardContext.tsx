import React, { createContext, useContext, useState, useEffect } from 'react';
import { ticketService } from '../services/ticketService';
import { useAuth } from './AuthContext';

export interface Ticket {
  id: number;
  subject: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  updated_at: string;
  created_at: string;
  assigned_to?: string;
  creator_email: string;
  creator_name: string;
  agent_email?: string;
  agent_name?: string;
  assignee?: {
    email: string;
    name?: string;
  };
  users?: {
    email: string;
    name?: string;
  };
}

export interface ActivityFeedItem {
  id: string;
  type: 'assigned' | 'priority_changed';
  ticketId: string;
  ticketSubject: string;
  actor: string;
  timestamp: string;
}

interface DashboardContextType {
  stats: {
    ticketStats: {
      total: number;
      open: number;
      inProgress: number;
      resolved: number;
    };
    activityFeed: ActivityFeedItem[];
  };
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  refreshData: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stats, setStats] = useState({
    ticketStats: {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0
    },
    activityFeed: []
  });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Current user:', user);
      console.log('User metadata:', user?.user_metadata);
      console.log('User role:', user?.user_metadata?.role);

      console.log('Fetching tickets...');
      const response = await ticketService.listTickets();
      console.log('Response from listTickets:', response);

      if (!response.tickets || !Array.isArray(response.tickets)) {
        console.error('Invalid response format:', response);
        setError('Invalid response format from server');
        return;
      }

      const { tickets: fetchedTickets } = response;
      console.log('Fetched tickets:', fetchedTickets);
      setTickets(fetchedTickets);
      
      // Calculate stats
      const newStats = {
        ticketStats: {
          total: fetchedTickets.length,
          open: fetchedTickets.filter((t: Ticket) => t.status === 'open').length,
          inProgress: fetchedTickets.filter((t: Ticket) => t.status === 'pending').length,
          resolved: fetchedTickets.filter((t: Ticket) => t.status === 'solved' || t.status === 'closed').length
        },
        activityFeed: fetchedTickets
          .sort((a: Ticket, b: Ticket) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, 5)
          .map((ticket: Ticket) => ({
            id: ticket.id.toString(),
            type: ticket.assigned_to ? 'assigned' : 'priority_changed',
            ticketId: ticket.id.toString(),
            ticketSubject: ticket.subject,
            actor: ticket.agent_email || ticket.creator_email || 'System',
            timestamp: ticket.updated_at
          }))
      };

      console.log('Calculated stats:', newStats);
      setStats(newStats);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  return (
    <DashboardContext.Provider value={{ stats, tickets, loading, error, refreshData: fetchDashboardData }}>
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