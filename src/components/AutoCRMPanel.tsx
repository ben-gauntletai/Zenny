import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import '../styles/AutoCRMPanel.css';

interface Message {
  id: string;
  sender: 'user' | 'system';
  content: string;
  timestamp: Date;
}

export function AutoCRMPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // Check if user is agent or admin
  const isAgentOrAdmin = user?.user_metadata?.role === 'agent' || user?.user_metadata?.role === 'admin';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load conversation history when component mounts
  useEffect(() => {
    if (user) {
      loadConversationHistory();
    }
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversationHistory = async () => {
    if (!user || isLoadingHistory) return;

    setIsLoadingHistory(true);
    try {
      // Get the most recent conversation
      const { data: conversations, error: convError } = await supabase
        .from('autocrm_conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (convError) throw convError;

      const conversationId = conversations?.[0]?.id;

      if (conversationId) {
        // Load messages from this conversation
        const { data: messageHistory, error: msgError } = await supabase
          .from('autocrm_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (msgError) throw msgError;

        if (messageHistory) {
          setMessages(messageHistory.map(msg => ({
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
            timestamp: new Date(msg.created_at)
          })));
        }
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
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
        sender: 'system',
        content: data.reply,
        timestamp: new Date()
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'system',
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

  // Don't render anything if user is not agent or admin
  if (!isAgentOrAdmin) {
    return null;
  }

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
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your request..."
          rows={1}
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