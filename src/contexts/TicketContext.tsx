import React, { createContext, useContext } from 'react';
import { useTicket } from '../hooks/useTicket';
import type { Reply, Ticket } from '../hooks/useTicket';

interface TicketContextType {
  ticket: Ticket | null;
  replies: Reply[];
  loading: boolean;
  error: string;
  addReply: (content: string, isPublic?: boolean) => Promise<Reply>;
}

const TicketContext = createContext<TicketContextType | null>(null);

export const useTicketContext = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
};

interface TicketProviderProps {
  ticketId: string;
  children: React.ReactNode;
}

export const TicketProvider: React.FC<TicketProviderProps> = ({ ticketId, children }) => {
  const ticketData = useTicket();

  return (
    <TicketContext.Provider value={ticketData}>
      {children}
    </TicketContext.Provider>
  );
}; 