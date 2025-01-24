import { useAuth } from '../contexts/AuthContext';
import { Ticket, Reply } from '../hooks/useTicket';

type Message = Reply | {
  id: number;
  type: 'system';
  content: string;
  created_at: string;
  title: string;
};

interface Notification {
  id: string;
  type: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_ASSIGNED' | 'COMMENT_ADDED';
  ticket_id: number;
  user_id: string | null;
  title: string;
  message: string;
  created_at: string;
  user?: {
    full_name: string | null;
    email: string;
  };
  ticket?: {
    profiles?: {
      email: string;
    };
  };
}

interface TicketContentProps {
  ticket: Ticket;
  messages: Message[];
  addReply: (content: string, isPublic?: boolean) => Promise<Reply>;
  updateTicket: (updates: Partial<Ticket>) => Promise<void>;
}

const TicketContent = ({ ticket, messages, addReply, updateTicket }: TicketContentProps) => {
  const { user } = useAuth();
  
  return (
    <div className="ticket-conversation">
      {messages.map((message: Message) => {
        if (message.type === 'system') {
          return (
            <div key={message.id} className="system-message">
              <div className="system-message-header">
                {message.title}
                <span className="system-message-date">
                  • {new Date(message.created_at).toLocaleString()}
                </span>
              </div>
              <div className="system-message-content">
                {message.content}
              </div>
            </div>
          );
        }

        // Regular message (reply)
        const isOwnMessage = message.user_id === user?.id;
        return (
          <div
            key={message.id}
            className={`message ${isOwnMessage ? 'own-message' : 'other-message'}`}
          >
            {/* ... existing message content ... */}
          </div>
        );
      })}
      {/* ... existing reply box ... */}
    </div>
  );
}; 