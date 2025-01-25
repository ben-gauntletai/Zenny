import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService } from '../services/ticketService';
import '../styles/CreateTicket.css';

interface TicketFormData {
  subject: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ticket_type: 'question' | 'incident' | 'problem' | 'task';
  topic: 'ISSUE' | 'INQUIRY' | 'OTHER' | 'PAYMENTS' | 'NONE';
}

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [formData, setFormData] = useState<TicketFormData>({
    subject: '',
    description: '',
    priority: 'normal',
    ticket_type: 'question',
    topic: 'NONE'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const { ticket } = await ticketService.createTicket(formData);
      navigate('/tickets/' + ticket.id);
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

  const getCharCountClass = (length: number, max: number) => {
    if (length >= max) return 'char-count at-limit';
    if (length >= max * 0.8) return 'char-count near-limit';
    return 'char-count';
  };

  return (
    <div className="create-ticket">
      <div className="create-ticket-header">
        <h2>Create New Support Ticket</h2>
        <p className="subtitle">Provide details about your issue</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="ticket-form">
        <div className="form-group">
          <label htmlFor="subject">Subject</label>
          <input
            type="text"
            id="subject"
            name="subject"
            value={formData.subject}
            onChange={(e) => handleInputChange('subject', e.target.value)}
            required
            maxLength={100}
            placeholder="Brief summary"
          />
          <div className="help-text">
            <p className={getCharCountClass(formData.subject.length, 100)}>
              {formData.subject.length}/100
            </p>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            required
            rows={4}
            placeholder="What happened? What did you expect?"
          />
          <div className="help-text">
            <ul>
              <li>Steps to reproduce</li>
              <li>Actual result</li>
              <li>Expected result</li>
              <li>Error messages</li>
            </ul>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="ticket_type">Type</label>
          <select
            id="ticket_type"
            name="ticket_type"
            value={formData.ticket_type}
            onChange={(e) => handleInputChange('ticket_type', e.target.value as TicketFormData['ticket_type'])}
            required
          >
            <option value="question">Question</option>
            <option value="incident">Incident</option>
            <option value="problem">Problem</option>
            <option value="task">Task</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="topic">Topic</label>
          <select
            id="topic"
            name="topic"
            value={formData.topic}
            onChange={(e) => handleInputChange('topic', e.target.value as TicketFormData['topic'])}
            required
          >
            <option value="ISSUE">Technical Issue</option>
            <option value="INQUIRY">General Inquiry</option>
            <option value="PAYMENTS">Payments</option>
            <option value="OTHER">Other</option>
            <option value="NONE">Not Sure</option>
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
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateTicket; 