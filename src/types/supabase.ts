import { User as SupabaseUser } from '@supabase/supabase-js';

export type TicketStatus = 'open' | 'pending' | 'solved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketType = 'question' | 'incident' | 'problem' | 'task';
export type TicketTopic = 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE';
export type CustomerType = 'VIP_CUSTOMER' | 'STANDARD_CUSTOMER';
export type UserRole = 'user' | 'agent' | 'admin';

export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ticket {
  id: number;
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
  created_at: string;
  updated_at: string;
  last_requester_update: string;
  last_agent_update: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface UserMetadata {
  firstName?: string;
  lastName?: string;
  role?: string;
}

export interface User extends SupabaseUser {
  user_metadata: UserMetadata;
}

export interface TicketWithUsers extends Ticket {
  creator_email: string;
  creator_name: string | null;
  agent_email: string | null;
  agent_name: string | null;
}

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