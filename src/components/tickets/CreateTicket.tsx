import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

const CreateTicket: React.FC = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('low');
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
            title,
            description,
            priority,
            status: 'open',
            user_id: user.id,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      // Navigate to the ticket detail page
      navigate(`/tickets/${data.id}`);
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError('Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-ticket">
      <h2>Create New Support Ticket</h2>
      {error && <div className="error-message">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Brief description of the issue"
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            placeholder="Detailed explanation of your issue"
            rows={5}
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => navigate('/tickets')} className="button-secondary">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="button-primary">
            {loading ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTicket; 
