import { useAuth } from '../contexts/AuthContext';
import { Ticket, Reply } from '../hooks/useTicket';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

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

interface SimilarArticle {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface TicketContentProps {
  ticket: Ticket;
  messages: Message[];
  addReply: (content: string, isPublic?: boolean) => Promise<Reply>;
  updateTicket: (updates: Partial<Ticket>) => Promise<void>;
}

const SimilarArticles = ({ ticket, messages }: { ticket: Ticket; messages: Message[] }) => {
  const [articles, setArticles] = useState<SimilarArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSimilarArticles = async () => {
      try {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Get recent messages for context
        const recentMessages = messages
          .filter(msg => msg.type !== 'system')
          .slice(-3)
          .map(msg => msg.content)
          .join(' ');

        const response = await fetch('http://localhost:8000/api/knowledge-base/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            query: `${ticket.subject} ${ticket.description} ${recentMessages}`
          })
        });

        if (!response.ok) {
          throw new Error('Failed to fetch similar articles');
        }

        const data = await response.json();
        setArticles(data.articles || []);
      } catch (error) {
        console.error('Error fetching similar articles:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSimilarArticles();
  }, [ticket.id, messages]);

  if (loading) {
    return <div className="similar-articles-loading">Loading similar articles...</div>;
  }

  if (articles.length === 0) {
    return null;
  }

  return (
    <div className="similar-articles">
      <h3>Related Knowledge Base Articles</h3>
      <div className="similar-articles-list">
        {articles.map(article => (
          <div key={article.id} className="similar-article-card">
            <h4>{article.title}</h4>
            <p>{article.content.substring(0, 150)}...</p>
            <a href={`/knowledge-base/article/${article.id}`} target="_blank" rel="noopener noreferrer">
              Read more
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};

const TicketContent = ({ ticket, messages, addReply, updateTicket }: TicketContentProps) => {
  const { user } = useAuth();
  
  return (
    <div className="ticket-detail-container">
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
      {(user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin') && (
        <SimilarArticles ticket={ticket} messages={messages} />
      )}
    </div>
  );
}; 