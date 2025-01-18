export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketType = 'INCIDENT' | 'QUESTION' | 'PROBLEM' | 'TASK';
export type TicketTopic = 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE';
export type CustomerType = 'VIP_CUSTOMER' | 'STANDARD_CUSTOMER';

export interface Database {
  public: {
    Tables: {
      tickets: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string;
          subject: string;
          description: string;
          status: TicketStatus;
          priority: TicketPriority;
          ticket_type: TicketType;
          topic: TicketTopic;
          customer_type: CustomerType;
          user_id: string;
          assigned_to: string | null;
          group_id: string | null;
        };
        Insert: {
          id?: number;
          created_at?: string;
          updated_at?: string;
          subject: string;
          description: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          ticket_type?: TicketType;
          topic?: TicketTopic;
          customer_type?: CustomerType;
          user_id: string;
          assigned_to?: string | null;
          group_id?: string | null;
        };
        Update: {
          id?: number;
          created_at?: string;
          updated_at?: string;
          subject?: string;
          description?: string;
          status?: TicketStatus;
          priority?: TicketPriority;
          ticket_type?: TicketType;
          topic?: TicketTopic;
          customer_type?: CustomerType;
          user_id?: string;
          assigned_to?: string | null;
          group_id?: string | null;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
        };
        Update: {
          email?: string;
          name?: string | null;
        };
      };
      knowledge_base_articles: {
        Row: {
          id: string;
          title: string;
          content: string;
          author_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          content: string;
          author_id: string;
        };
        Update: {
          title?: string;
          content?: string;
        };
      };
    };
  };
} 