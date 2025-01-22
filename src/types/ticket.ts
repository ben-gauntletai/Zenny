export interface TicketDetails {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'pending' | 'solved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  users: {
    email: string;
  };
  assigned_to?: string;
  assigned_user?: {
    email: string;
  };
  isNewTicket?: boolean;
} 