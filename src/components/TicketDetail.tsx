import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/TicketDetail.css';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
  user_id: string;
  assigned_to: string | null;
  users: {
    email: string;
  };
  assigned_user?: {
    email: string;
  };
}

interface Comment {
  id: string;
  comment_text: string;
  created_at: string;
  user_id: string;
  users: {
    email: string;
  };
}

const TicketDetail: React.FC = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAgent = user?.user_metadata?.role === 'agent';

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [agents, setAgents] = useState<{ id: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchTicketData();
    if (isAgent) {
      fetchAgents();
    }
  }, [ticketId]);

  const fetchTicketData = async () => {
    try {
      setLoading(true);
      
      // Fetch ticket details
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          users!tickets_user_id_fkey (email),
          assigned_user:users!tickets_assigned_to_fkey (email)
        `)
        .eq('id', ticketId)
        .single();

      if (ticketError) throw ticketError;
      setTicket(ticketData);

      // Fetch comments
      const { data: commentData, error: commentError } = await supabase
        .from('ticket_comments')
        .select(`
          *,
          users (email)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (commentError) throw commentError;
      setComments(commentData || []);

    } catch (err) {
      console.error('Error fetching ticket data:', err);
      setError('Failed to load ticket data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email')
        .eq('raw_user_meta_data->role', 'agent');

      if (error) throw error;
      setAgents(data || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
    }
  };

  const handleStatusChange = async (newStatus: Ticket['status']) => {
    if (!isAgent || !ticket) return;
    
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id);

      if (error) throw error;
      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Failed to update ticket status');
    } finally {
      setUpdating(false);
    }
  };

  const handlePriorityChange = async (newPriority: Ticket['priority']) => {
    if (!isAgent || !ticket) return;
    
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('tickets')
        .update({ priority: newPriority })
        .eq('id', ticket.id);

      if (error) throw error;
      setTicket(prev => prev ? { ...prev, priority: newPriority } : null);
    } catch (err) {
      console.error('Error updating priority:', err);
      setError('Failed to update ticket priority');
    } finally {
      setUpdating(false);
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    if (!isAgent || !ticket) return;
    
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('tickets')
        .update({ assigned_to: newAssigneeId || null })
        .eq('id', ticket.id);

      if (error) throw error;
      
      // Refresh ticket data to get updated assignee information
      fetchTicketData();
    } catch (err) {
      console.error('Error updating assignee:', err);
      setError('Failed to update ticket assignee');
    } finally {
      setUpdating(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user) return;

    try {
      setUpdating(true);
      const { error } = await supabase
        .from('ticket_comments')
        .insert([
          {
            ticket_id: ticketId,
            user_id: user.id,
            comment_text: newComment.trim()
          }
        ]);

      if (error) throw error;
      
      setNewComment('');
      fetchTicketData(); // Refresh comments
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="loading">Loading ticket details...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!ticket) return <div className="error">Ticket not found</div>;

  return (
    <div className="ticket-detail">
      <div className="ticket-header">
        <div className="ticket-title-section">
          <h2>{ticket.title}</h2>
          <div className="ticket-meta">
            <span className={`status-badge status-${ticket.status}`}>
              {ticket.status}
            </span>
            <span className={`priority-badge priority-${ticket.priority}`}>
              {ticket.priority}
            </span>
            <span className="ticket-id">#{ticket.id.slice(0, 8)}</span>
          </div>
        </div>

        <div className="ticket-actions">
          {isAgent && (
            <>
              <select
                value={ticket.status}
                onChange={(e) => handleStatusChange(e.target.value as Ticket['status'])}
                disabled={updating}
              >
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
              </select>

              <select
                value={ticket.priority}
                onChange={(e) => handlePriorityChange(e.target.value as Ticket['priority'])}
                disabled={updating}
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>

              <select
                value={ticket.assigned_to || ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                disabled={updating}
              >
                <option value="">Unassigned</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.email}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="ticket-info">
        <div className="info-group">
          <label>Requester</label>
          <span>{ticket.users.email}</span>
        </div>
        <div className="info-group">
          <label>Assignee</label>
          <span>{ticket.assigned_user?.email || 'Unassigned'}</span>
        </div>
        <div className="info-group">
          <label>Created</label>
          <span>{new Date(ticket.created_at).toLocaleString()}</span>
        </div>
        <div className="info-group">
          <label>Last Updated</label>
          <span>{new Date(ticket.updated_at).toLocaleString()}</span>
        </div>
      </div>

      <div className="ticket-description">
        <h3>Description</h3>
        <p>{ticket.description}</p>
      </div>

      <div className="ticket-comments">
        <h3>Comments</h3>
        <div className="comments-list">
          {comments.map(comment => (
            <div key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.users.email}</span>
                <span className="comment-date">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <p className="comment-text">{comment.comment_text}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleCommentSubmit} className="comment-form">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            required
          />
          <button type="submit" disabled={updating || !newComment.trim()}>
            {updating ? 'Sending...' : 'Add Comment'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TicketDetail; 
