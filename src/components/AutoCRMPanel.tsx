import React, { useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAutoCRM } from '../contexts/AutoCRMContext';
import { MentionInput } from './MentionInput';
import '../styles/AutoCRMPanel.css';

interface Message {
  id: string;
  sender: 'user' | 'system';
  content: string;
  timestamp: Date;
}

// Utility function to format field names
const formatFieldName = (field: string): string => {
  return field
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Utility function to format the response content
const formatResponseContent = (content: string): string => {
  // Handle various patterns where field names might appear
  return content
    // Handle "field_name:" pattern
    .replace(/(\w+(?:_\w+)*):(?=\s|$)/g, (match) => {
      const fieldName = match.replace(':', '');
      return formatFieldName(fieldName) + ':';
    })
    // Handle "field_name set to" pattern
    .replace(/(\w+(?:_\w+)*)\s+set\s+to\s/g, (match) => {
      const fieldName = match.replace(/\s+set\s+to\s$/, '');
      return formatFieldName(fieldName) + ' set to ';
    })
    // Handle "field_name has been" pattern
    .replace(/(\w+(?:_\w+)*)\s+has\s+been\s/g, (match) => {
      const fieldName = match.replace(/\s+has\s+been\s$/, '');
      return formatFieldName(fieldName) + ' has been ';
    })
    // Handle "Updated field_name" pattern
    .replace(/Updated\s+(\w+(?:_\w+)*)/g, (match, field) => {
      return 'Updated ' + formatFieldName(field);
    })
    // Handle "the field_name" pattern
    .replace(/the\s+(\w+(?:_\w+)*)\s/g, (match, field) => {
      return 'the ' + formatFieldName(field) + ' ';
    });
};

export function AutoCRMPanel() {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const location = useLocation();
  const { 
    messages, 
    setMessages, 
    isLoading, 
    setIsLoading,
    isLoadingHistory,
  } = useAutoCRM();

  // Check if user is agent or admin
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';

  // Check if we're on a page where AutoCRM should be shown
  const shouldShowAutoCRM = location.pathname === '/' || location.pathname === '/tickets';

  // Scroll to bottom immediately when messages change
  useEffect(() => {
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }, [messages]);

  // Don't render if user is not agent/admin or not on dashboard/tickets pages
  if (!isAgentOrAdmin || !shouldShowAutoCRM) {
    return null;
  }

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const newMessage = {
      id: Date.now().toString(),
      sender: 'user' as const,
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('https://syyaqprmiekyqfoilbna.supabase.co/functions/v1/autocrm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          query: input.trim(),
          userId: user.id
        })
      });

      const data = await response.json();
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system' as const,
        content: data.error || formatResponseContent(data.reply),
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('AutoCRM error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system' as const,
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="autocrm-panel">
      <div className="autocrm-header">
        <h3>AutoCRM Assistant</h3>
      </div>

      <div className="autocrm-messages">
        {isLoadingHistory ? (
          <div className="message system loading">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="message system welcome">
            <div className="message-content">
              Hello! I'm your AutoCRM assistant. How can I help you today?
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`message ${msg.sender}`}
            >
              <div className="message-content">{msg.content}</div>
              <div className="message-timestamp">
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="message system loading">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="autocrm-input">
        <MentionInput
          value={input}
          onChange={setInput}
          placeholder="Type your request... Use @ to mention agents"
          className="autocrm-mention-input"
          supabase={supabase}
        />
        <button 
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          <span className="material-icons">send</span>
        </button>
      </div>
    </div>
  );
}