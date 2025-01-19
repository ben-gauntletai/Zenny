import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  category?: string;
  tags?: string[];
}

interface TicketContextType {
  tickets: Ticket[];
  loading: boolean;
  searchTickets: (query: string) => Promise<void>;
  refreshTickets: () => Promise<void>;
  createTicket: (ticket: Partial<Ticket>) => Promise<void>;
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error: any) {
      console.error('Error fetching tickets:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchTickets = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error: any) {
      console.error('Error searching tickets:', error.message);
    }
  };

  const createTicket = async (ticket: Partial<Ticket>) => {
    try {
      const { error } = await supabase
        .from('tickets')
        .insert([ticket]);

      if (error) throw error;
      await fetchTickets();
    } catch (error: any) {
      console.error('Error creating ticket:', error.message);
    }
  };

  const updateTicket = async (id: string, updates: Partial<Ticket>) => {
    try {
      const { error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await fetchTickets();
    } catch (error: any) {
      console.error('Error updating ticket:', error.message);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  return (
    <TicketContext.Provider
      value={{
        tickets,
        loading,
        searchTickets,
        refreshTickets: fetchTickets,
        createTicket,
        updateTicket
      }}
    >
      {children}
    </TicketContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (context === undefined) {
    throw new Error('useTickets must be used within a TicketProvider');
  }
  return context;
}; 