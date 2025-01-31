import { supabase } from '../lib/supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

// Make sure we're using the correct backend URL
const BACKEND_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface TicketCreationPayload {
  subject: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'Order & Shipping Issues' | 'Billing & Account Concerns' | 'Communication & Customer Experience' | 'Policy' | 'Promotions & Loyalty Programs' | 'Product & Service Usage';
}

let replySubscription: RealtimeChannel | null = null;

export const ticketService = {
  async createTicket(payload: TicketCreationPayload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const url = `${BACKEND_URL}/api/tickets`;
    console.log('Sending ticket creation request:', {
      payload,
      url
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let errorMessage = `Failed to create ticket: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error('Server error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          payload
        });
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseError) {
        console.error('Error parsing error response:', {
          parseError,
          status: response.status,
          statusText: response.statusText,
          payload
        });
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Ticket created successfully:', data);
    
    // Add isNewTicket flag to the ticket data
    if (data.ticket) {
      data.ticket.isNewTicket = true;
    }
    
    return data;
  },

  async updateTicket(id: number, updates: Partial<TicketCreationPayload>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const url = `${BACKEND_URL}/api/tickets/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update ticket');
      } catch {
        throw new Error(`Failed to update ticket: ${response.status}`);
      }
    }

    return response.json();
  },

  async listTickets(params: { status?: string; limit?: number; offset?: number; isDashboard?: boolean } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const isAgentOrAdmin = session.user.user_metadata?.role === 'agent' || session.user.user_metadata?.role === 'admin';

    // Debug logging for authentication
    console.log('Auth Debug:', {
      user: session.user,
      role: session.user.user_metadata?.role,
      id: session.user.id,
      email: session.user.email,
      isAgentOrAdmin,
      isDashboard: params.isDashboard
    });

    let query = supabase
      .from('tickets_with_users')
      .select(`
        id,
        subject,
        description,
        status,
        priority,
        ticket_type,
        topic,
        created_at,
        updated_at,
        user_id,
        assigned_to,
        group_name,
        creator_email,
        creator_name,
        agent_email,
        agent_name
      `);

    // Apply filters based on role
    if (!isAgentOrAdmin) {
      // Regular users can only see their own tickets
      query = query.eq('user_id', session.user.id);
    } else if (session.user.user_metadata?.role === 'agent') {
      if (params.isDashboard) {
        // For dashboard: only show open tickets that are either unassigned or assigned to the agent
        query = query.eq('status', 'open').or(
          `assigned_to.eq.${session.user.id},and(assigned_to.is.null,group_name.neq.Admin)`
        );
      } else {
        // For ticket list: show all tickets assigned to them or unassigned (except Admin group)
        query = query.or(
          `assigned_to.eq.${session.user.id},and(assigned_to.is.null,group_name.neq.Admin)`
        );
      }
    } else if (session.user.user_metadata?.role === 'admin' && params.isDashboard) {
      // For admin dashboard: only show open tickets that are either unassigned or assigned to them
      query = query.eq('status', 'open').or(`assigned_to.is.null,assigned_to.eq.${session.user.id}`);
    }
    // For admin ticket list: they can see all tickets (no additional filters needed)

    // Apply additional filters
    if (params.status && !params.isDashboard) {
      // Don't apply status filter on dashboard since we handle it in role-based filters
      query = query.eq('status', params.status);
    }

    // Add ordering
    query = query.order('created_at', { ascending: false });

    // Add pagination
    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tickets:', error);
      throw error;
    }

    return { tickets: data || [] };
  },

  subscribeToReplies: (ticketId: number, onNewReply: (reply: any) => void) => {
    console.log(`Setting up subscription for ticket ${ticketId}`);
    
    // Unsubscribe from any existing subscription
    if (replySubscription) {
        console.log('Cleaning up existing subscription');
        replySubscription.unsubscribe();
        replySubscription = null;
    }

    // Create new subscription
    replySubscription = supabase
        .channel(`replies:${ticketId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'replies',
                filter: `ticket_id=eq.${ticketId}`
            },
            async (payload) => {
                console.log('Received new reply:', payload);
                try {
                    // Fetch the complete reply data with user profile
                    const { data: reply, error } = await supabase
                        .from('replies')
                        .select(`
                            *,
                            user_profile:profiles!replies_user_id_fkey (
                                email,
                                full_name,
                                avatar_url,
                                role
                            )
                        `)
                        .eq('id', payload.new.id)
                        .single();

                    if (error) {
                        console.error('Error fetching complete reply data:', error);
                        // Still notify with the basic payload data
                        onNewReply({
                            ...payload.new,
                            user_profile: null,
                            user_avatar: null
                        });
                        return;
                    }

                    console.log('Fetched complete reply data:', reply);
                    onNewReply({
                        ...reply,
                        user_avatar: reply.user_profile?.avatar_url
                    });
                } catch (err) {
                    console.error('Error in reply subscription handler:', err);
                    // Notify with basic payload data as fallback
                    onNewReply({
                        ...payload.new,
                        user_profile: null,
                        user_avatar: null
                    });
                }
            }
        )
        .subscribe((status) => {
            console.log(`Subscription status for ticket ${ticketId}:`, status);
            if (status === 'SUBSCRIBED') {
                console.log(`Successfully subscribed to replies for ticket ${ticketId}`);
            } else if (status === 'CHANNEL_ERROR') {
                console.error(`Channel error for ticket ${ticketId}`);
                // Try to resubscribe after a delay
                setTimeout(() => {
                    if (replySubscription) {
                        console.log('Attempting to resubscribe...');
                        replySubscription.subscribe();
                    }
                }, 2000);
            } else if (status === 'TIMED_OUT') {
                console.error(`Subscription timed out for ticket ${ticketId}`);
                // Try to resubscribe after a delay
                setTimeout(() => {
                    if (replySubscription) {
                        console.log('Attempting to resubscribe after timeout...');
                        replySubscription.subscribe();
                    }
                }, 2000);
            }
        });

    return () => {
        console.log(`Cleaning up subscription for ticket ${ticketId}`);
        if (replySubscription) {
            replySubscription.unsubscribe();
            replySubscription = null;
        }
    };
  },

  unsubscribeFromReplies: () => {
    if (replySubscription) {
      replySubscription.unsubscribe();
      replySubscription = null;
    }
  }
}; 