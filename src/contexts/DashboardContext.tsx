import React, { createContext, useContext, useState, useEffect } from 'react';
import { ticketService } from '../services/ticketService';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

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
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  ticketId: string;
  ticketSubject: string;
  actor: string;
  timestamp: string;
  title: string;
  message: string;
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
  const [stats, setStats] = useState<DashboardContextType['stats']>({
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
      const tickets = fetchedTickets;
      console.log('Fetched tickets:', tickets);
      setTickets(tickets);
      
      // Calculate ticket stats
      const newStats: DashboardContextType['stats'] = {
        ticketStats: {
          total: tickets.length,
          open: tickets.filter((t: Ticket) => t.status === 'open').length,
          inProgress: tickets.filter((t: Ticket) => t.status === 'pending').length,
          resolved: tickets.filter((t: Ticket) => t.status === 'solved' || t.status === 'closed').length
        },
        activityFeed: []
      };

      // Fetch notifications for the activity feed
      const { data: notifications, error: notifError } = await supabase
        .from('notifications')
        .select(`
          *,
          user:profiles!notifications_user_id_fkey(email, full_name),
          ticket:tickets!notifications_ticket_id_fkey(
            subject,
            profiles:user_id(email, full_name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(25);

      if (notifError) {
        console.error('Error fetching notifications:', notifError);
      } else {
        newStats.activityFeed = notifications.map((notification: any): ActivityFeedItem => ({
          id: notification.id.toString(),
          type: notification.type as ActivityFeedItem['type'],
          ticketId: notification.ticket_id.toString(),
          ticketSubject: notification.ticket?.subject || 'Unknown',
          actor: notification.user_id === null ? 'System' : (notification.user?.full_name || notification.user?.email || 'Unknown User'),
          timestamp: notification.created_at,
          title: notification.title,
          message: notification.message
        }));
      }

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