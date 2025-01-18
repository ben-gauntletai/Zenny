import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import '../styles/CreateTicket.css';

interface TicketFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [formData, setFormData] = useState<TicketFormData>({
    title: '',
    description: '',
    priority: 'low'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create a ticket');
      addNotification({
        message: 'You must be logged in to create a ticket',
        type: 'error'
      });
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data: ticket, error: insertError } = await supabase
        .from('tickets')
        .insert([
          {
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            status: 'open',
            user_id: user.id
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      addNotification({
        message: 'Ticket created successfully',
        type: 'success'
      });
      navigate(`/tickets/${ticket.id}`);
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError('Failed to create ticket. Please try again.');
      addNotification({
        message: 'Failed to create ticket. Please try again.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="create-ticket">
      <header className="create-ticket-header">
        <h1>Create Support Ticket</h1>
        <p className="subtitle">Submit a new support request</p>
      </header>

      <form className="ticket-form" onSubmit={handleSubmit}>
        {error && <div className="error">{error}</div>}

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Brief description of the issue"
            required
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Detailed explanation of your issue"
            required
            className="form-input"
            rows={6}
          />
          <p className="help-text">
            Please provide as much detail as possible to help us assist you better.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            className="form-input"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <p className="help-text">
            Select the priority level based on the urgency of your issue.
          </p>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={() => {
              addNotification({
                message: 'Ticket creation cancelled',
                type: 'info'
              });
              navigate('/tickets');
            }}
            className="cancel-button"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTicket; 