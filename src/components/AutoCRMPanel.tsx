import React, { useRef, useEffect, useState } from 'react';
import { useAutoCRM } from '../contexts/AutoCRMContext';
import { useAuth } from '../contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { MentionInput } from './MentionInput';
import { FaMicrophone, FaStop } from 'react-icons/fa';
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

// Helper functions for mention transformations
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

export function AutoCRMPanel() {
  const { messages, setMessages, isLoading, setIsLoading, isLoadingHistory } = useAutoCRM();
  const { user } = useAuth();
  const location = useLocation();
  const [input, setInput] = useState('');
  const [inputHtml, setInputHtml] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        await handleAudioUpload(audioBlob);
        // Clear the stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error starting recording. Please make sure you have granted microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create form data
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');

      const response = await fetch(`${process.env.REACT_APP_API_URL}/autocrm/transcribe`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Add transcription as user message
      setMessages((prev: Message[]) => [...prev, {
        id: Date.now().toString(),
        sender: 'user' as const,
        content: data.transcription,
        displayContent: data.transcription,
        timestamp: new Date()
      }]);

      // Add system response
      if (data.reply) {
        const systemResponse = formatResponseContent(data.reply);
        setMessages((prev: Message[]) => [...prev, {
          id: (Date.now() + 1).toString(),
          sender: 'system' as const,
          content: systemResponse,
          displayContent: systemResponse,
          timestamp: new Date()
        }]);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
      const errorMessage = 'Sorry, I encountered an error processing your audio. Please try again.';
      setMessages((prev: Message[]) => [...prev, {
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

  const handleInputChange = (text: string, html?: string) => {
    setInput(text);
    setInputHtml(html || '');
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

    setMessages((prev: Message[]) => [...prev, newMessage]);
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
      setMessages((prev: Message[]) => [...prev, {
        id: Date.now().toString(),
        sender: 'system' as const,
        content: systemResponse,
        displayContent: systemResponse,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('AutoCRM error:', error);
      const errorMessage = 'Sorry, I encountered an error. Please try again.';
      setMessages((prev: Message[]) => [...prev, {
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
          messages.map((msg: Message) => (
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
          onChange={handleInputChange}
          placeholder="Type your message..."
          className="autocrm-mention-input"
          supabase={supabase}
          onSubmit={handleSend}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="send-button"
        >
          Send
        </button>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading}
          className={`record-button ${isRecording ? 'recording' : ''}`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isRecording ? <FaStop /> : <FaMicrophone />}
        </button>
      </div>
    </div>
  );
}