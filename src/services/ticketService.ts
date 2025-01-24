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

    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const url = queryParams.toString() 
      ? `${EDGE_FUNCTION_URL}?${queryParams.toString()}`
      : EDGE_FUNCTION_URL;

    console.log('Fetching tickets:', {
      url,
      params,
      session_user: session.user,
      auth_header_present: !!session.access_token
    });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorMessage = `Failed to fetch tickets: ${response.status}`;
      try {
        const errorData = await response.json();
        console.error('Server error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          url,
          params,
          user: {
            id: session.user.id,
            email: session.user.email,
            role: session.user.user_metadata?.role
          }
        });
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseError) {
        console.error('Error parsing error response:', {
          parseError,
          status: response.status,
          statusText: response.statusText,
          url,
          params
        });
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Tickets fetched successfully:', {
      count: data.tickets?.length,
      first_ticket: data.tickets?.[0],
      params
    });
    return data;
  }
}; 