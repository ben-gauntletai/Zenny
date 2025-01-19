import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import type { TicketPriority, TicketType, TicketTopic, CustomerType } from '../types/supabase';
import '../styles/CreateTicket.css';

interface TicketFormData {
  subject: string;
  description: string;
  priority: TicketPriority;
  ticket_type: TicketType;
  topic: TicketTopic;
  customer_type: CustomerType;
  status: string;
}

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState<TicketFormData>({
    subject: '',
    description: '',
    priority: 'normal',
    ticket_type: 'question',
    topic: 'NONE',
    customer_type: 'STANDARD_CUSTOMER',
    status: 'open'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('tickets')
        .insert([
          {
            ...formData,
            user_id: user.id,
            status: 'NEW'
          }
        ])
        .select()
        .single();

      if (insertError) throw insertError;
      navigate('/tickets/' + data.id);
    } catch (err) {
      console.error('Error creating ticket:', err);
      setError('Failed to create ticket. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name: keyof TicketFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="create-ticket">
      <h1>Create New Ticket</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="subject">Subject</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={(e) => handleInputChange('subject', e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            required
            rows={5}
          />
        </div>

        <div className="form-group">
          <label htmlFor="ticket_type">Type</label>
          <select
            id="ticket_type"
            name="ticket_type"
            value={formData.ticket_type}
            onChange={(e) => handleInputChange('ticket_type', e.target.value)}
            required
          >
            <option value="question">Question</option>
            <option value="incident">Incident</option>
            <option value="problem">Problem</option>
            <option value="task">Task</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={(e) => handleInputChange('priority', e.target.value)}
            required
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="topic">Topic</label>
          <select
            id="topic"
            name="topic"
            value={formData.topic}
            onChange={(e) => handleInputChange('topic', e.target.value)}
            required
          >
            <option value="NONE">-</option>
            <option value="ISSUE">Issue</option>
            <option value="INQUIRY">Inquiry</option>
            <option value="OTHER">Other</option>
            <option value="PAYMENTS">Payments</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="customer_type">Customer Type</label>
          <select
            id="customer_type"
            name="customer_type"
            value={formData.customer_type}
            onChange={(e) => handleInputChange('customer_type', e.target.value)}
            required
          >
            <option value="STANDARD_CUSTOMER">Standard Customer</option>
            <option value="VIP_CUSTOMER">VIP Customer</option>
          </select>
        </div>

        {error && <div className="error-message">{error}</div>}
        
        <div className="form-actions">
          <button type="submit" disabled={loading} className="primary-button">
            {loading ? 'Creating...' : 'Create Ticket'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="secondary-button">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTicket; 