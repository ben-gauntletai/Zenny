import React, { createContext, useContext, ReactNode } from 'react';
import { Ticket, Reply, useTicket } from '../hooks/useTicket';

type Message = Reply | {
  id: number;
  type: 'system';
  content: string;
  created_at: string;
};

export type TicketContextType = {
  ticket: Ticket | null;
  messages: Message[];
  loading: boolean;
  error: string;
  isAiLoading: boolean;
  addReply: (content: string, isPublic?: boolean) => Promise<Reply>;
  updateTicket: (updates: Partial<Ticket>) => Promise<void>;
  fetchTicket: () => Promise<void>;
};

const TicketContext = createContext<TicketContextType | undefined>(undefined);

interface TicketProviderProps {
  children: ReactNode;
  ticketId: string;
}

export const TicketProvider: React.FC<TicketProviderProps> = ({ children, ticketId }) => {
  const ticketData = useTicket(ticketId);

  return (
    <TicketContext.Provider value={ticketData}>
      {children}
    </TicketContext.Provider>
  );
};

export const useTicketContext = () => {
  const context = useContext(TicketContext);
  if (context === undefined) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
}; 