import React, { createContext, useContext, useState, useEffect } from 'react';
import { ticketService } from '../services/ticketService';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabaseClient';

export interface Ticket {
  id: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  ticket_type: string;
  topic: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to: string | null;
  group_name: string | null;
  creator_email: string;
  creator_name: string;
  agent_email: string | null;
  agent_name: string | null;
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

  const updateTicketStats = (tickets: Ticket[]) => {
    const openTickets = tickets.filter((t: Ticket) => t.status === 'open');
    const pendingTickets = tickets.filter((t: Ticket) => t.status === 'pending');
    const resolvedTickets = tickets.filter((t: Ticket) => t.status === 'solved' || t.status === 'closed');
    
    return {
      total: openTickets.length + pendingTickets.length + resolvedTickets.length,
      open: openTickets.length,
      inProgress: pendingTickets.length,
      resolved: resolvedTickets.length
    };
  };

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    // Subscribe to ticket changes
    const ticketSubscription = supabase
      .channel('tickets-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets'
        },
        async (payload) => {
          console.log('Ticket change received:', payload);
          // Refresh tickets data to get the latest state
          const response = await ticketService.listTickets({ isDashboard: true });
          if (response.tickets && Array.isArray(response.tickets)) {
            setTickets(response.tickets);
            const newStats = updateTicketStats(response.tickets);
            setStats(prevStats => ({
              ...prevStats,
              ticketStats: newStats
            }));
          }
        }
      )
      .subscribe();

    // Subscribe to notification changes
    const notificationSubscription = supabase
      .channel('notifications-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications'
        },
        async (payload: any) => {
          console.log('New notification received:', payload);
          // Fetch the latest notifications
          const { data: notifications, error: notifError } = await supabase
            .from('notifications')
            .select('*, tickets(subject)')
            .order('created_at', { ascending: false })
            .limit(25);

          if (!notifError && notifications) {
            const activityFeed = notifications.map((notification: any): ActivityFeedItem => ({
              id: notification.id.toString(),
              type: notification.type as ActivityFeedItem['type'],
              ticketId: notification.ticket_id.toString(),
              ticketSubject: notification.tickets?.subject || 'Unknown',
              actor: notification.user_id === null ? 'System' : 'Support Team',
              timestamp: notification.created_at,
              title: notification.title,
              message: notification.message
            }));

            setStats(prevStats => ({
              ...prevStats,
              activityFeed
            }));
          }
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      ticketSubscription.unsubscribe();
      notificationSubscription.unsubscribe();
    };
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Starting dashboard data fetch...');

      // Start both fetches in parallel
      const ticketsPromise = Promise.resolve(ticketService.listTickets({ isDashboard: true }));
      const notificationsPromise = Promise.resolve(
        supabase
          .from('notifications')
          .select('*, tickets(subject)')
          .order('created_at', { ascending: false })
          .limit(25)
      );

      // Handle tickets as soon as they arrive
      ticketsPromise.then(response => {
        console.log('Tickets response:', response);
        if (!response.tickets || !Array.isArray(response.tickets)) {
          console.error('Invalid response format:', response);
          return;
        }

        const fetchedTickets = response.tickets;
        console.log('Fetched tickets:', fetchedTickets);
        setTickets(fetchedTickets);
        
        // Update ticket stats immediately
        const newStats = updateTicketStats(fetchedTickets);
        console.log('New ticket stats:', newStats);
        setStats(prevStats => ({
          ...prevStats,
          ticketStats: newStats
        }));
      }).catch((err: Error) => {
        console.error('Error fetching tickets:', err);
      });

      // Handle notifications as soon as they arrive
      notificationsPromise.then(({ data: notifications, error: notifError }) => {
        console.log('Notifications response:', { notifications, error: notifError });
        if (notifError) {
          console.error('Error fetching notifications:', notifError);
          return;
        }

        const activityFeed = notifications.map((notification: any): ActivityFeedItem => ({
          id: notification.id.toString(),
          type: notification.type as ActivityFeedItem['type'],
          ticketId: notification.ticket_id.toString(),
          ticketSubject: notification.tickets?.subject || 'Unknown',
          actor: notification.user_id === null ? 'System' : 'Support Team',
          timestamp: notification.created_at,
          title: notification.title,
          message: notification.message
        }));

        console.log('Processed activity feed:', activityFeed);
        setStats(prevStats => ({
          ...prevStats,
          activityFeed
        }));
      }).catch((err: Error) => {
        console.error('Error fetching notifications:', err);
      });

      // Wait for both to complete before removing loading state
      await Promise.all([ticketsPromise, notificationsPromise]);
      console.log('All dashboard data fetched successfully');
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