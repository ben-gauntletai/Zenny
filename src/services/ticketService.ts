import { supabase } from '../lib/supabaseClient';

const EDGE_FUNCTION_URL = process.env.REACT_APP_SUPABASE_URL + '/functions/v1/tickets';

interface TicketCreationPayload {
  subject: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE';
}

export const ticketService = {
  async createTicket(payload: TicketCreationPayload) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    console.log('Sending ticket creation request:', {
      payload,
      url: EDGE_FUNCTION_URL
    });

    const response = await fetch(EDGE_FUNCTION_URL, {
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

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, ...updates })
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

  async listTickets(params: { status?: string; limit?: number; offset?: number } = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const userRole = session.user.user_metadata?.role;
    const isAdmin = userRole === 'admin';
    const isAgent = userRole === 'agent';

    console.log('Fetching tickets:', {
      params,
      session_user: session.user,
      isAdmin,
      isAgent
    });

    let query = supabase
      .from('tickets_with_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    // Apply role-based filters
    if (isAdmin) {
      // Admin can see all tickets
    } else if (isAgent) {
      // Agents can see:
      // 1. Their own tickets
      // 2. Tickets assigned to them
      // 3. Support group tickets
      query = query.or(
        `user_id.eq.${session.user.id},` +
        `assigned_to.eq.${session.user.id},` +
        `group_name.eq.Support`
      );
    } else {
      // Regular users can only see their own tickets
      query = query.eq('user_id', session.user.id);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tickets:', {
        error,
        params,
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.user_metadata?.role
        }
      });
      throw new Error(error.message);
    }

    console.log('Tickets fetched successfully:', {
      count: data?.length,
      first_ticket: data?.[0],
      params
    });

    return { tickets: data || [] };
  }
}; 