import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import '../styles/CreateTicket.css';

interface TicketFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

const CreateTicket: React.FC = () => {
  const [formData, setFormData] = useState<TicketFormData>({
    title: '',
    description: '',
    priority: 'medium'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setError('You must be logged in to create a ticket');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const { data, error: insertError } = await supabase
        .from('tickets')
        .insert([
          {
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            user_id: user.id,
            status: 'open'
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // Navigate to the ticket detail page
      navigate(`/tickets/${data.id}`);
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError('Failed to create ticket. Please try again.');
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
      <div className="create-ticket-header">
        <h2>Create New Support Ticket</h2>
        <p className="subtitle">
          Please provide details about your issue and we'll get back to you as soon as possible.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="ticket-form">
        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Brief summary of your issue"
            required
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Detailed description of your issue"
            required
            rows={6}
          />
          <p className="help-text">
            Please provide as much detail as possible to help us understand and resolve your issue quickly.
          </p>
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            required
          >
            <option value="low">Low - Minor issue, no urgent action needed</option>
            <option value="medium">Medium - Important issue affecting work</option>
            <option value="high">High - Critical issue requiring immediate attention</option>
          </select>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="cancel-button"
            onClick={() => navigate('/tickets')}
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
