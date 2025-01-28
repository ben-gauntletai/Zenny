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
  content: string;      // LLM version with emails
  displayContent: string; // Display version with names
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

// Utility function to format mentions in display content
const formatDisplayContent = (content: string): string => {
  // Don't transform the content - keep it as is
  return content;
};

export function AutoCRMPanel() {
  const [input, setInput] = React.useState('');
  const [inputHtml, setInputHtml] = React.useState('');
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

  const transformMentionsToEmails = (htmlContent: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Find all mention spans and transform them
    const mentions = tempDiv.getElementsByClassName('mention-text');
    Array.from(mentions).forEach(mention => {
      const email = (mention as HTMLSpanElement).dataset.email;
      const name = (mention as HTMLSpanElement).textContent?.replace('@', '');
      if (email && name) {
        // Keep the display as @name but send email to backend
        mention.replaceWith(`@${email}`);
      }
    });
    
    return tempDiv.textContent?.trim() || '';
  };

  const transformMentionsForDisplay = (htmlContent: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Find all mention spans and transform them
    const mentions = tempDiv.getElementsByClassName('mention-text');
    Array.from(mentions).forEach(mention => {
      const name = mention.textContent;
      if (name) {
        mention.replaceWith(name);
      }
    });
    
    return tempDiv.textContent?.trim() || '';
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    // Store both versions of the message
    const newMessage = {
      id: Date.now().toString(),
      sender: 'user' as const,
      content: transformMentionsToEmails(inputHtml),      // LLM version
      displayContent: transformMentionsForDisplay(inputHtml), // Display version
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setInputHtml('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${process.env.REACT_APP_API_URL}/autocrm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ 
          query: newMessage.content, // Send LLM version
          userId: user.id,
          displayContent: newMessage.displayContent // Send display version
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.reply) {
        throw new Error('No reply received from server');
      }
      
      // For system messages, use the same content for both since it's already processed
      const systemResponse = formatResponseContent(data.reply);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system' as const,
        content: systemResponse,
        displayContent: systemResponse,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('AutoCRM error:', error);
      const errorMessage = 'Sorry, I encountered an error. Please try again.';
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system' as const,
        content: errorMessage,
        displayContent: errorMessage,
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
              <div className="message-content">{msg.displayContent}</div>
              <div className="message-timestamp">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          onChange={(text, html) => {
            setInput(text);
            setInputHtml(html || '');
          }}
          placeholder="Type your request... Use @ to mention agents"
          className="autocrm-mention-input"
          supabase={supabase}
          onSubmit={handleSend}
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