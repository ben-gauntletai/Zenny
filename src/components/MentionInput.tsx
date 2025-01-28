import React, { useState, useRef, useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';
import { getProfileColor } from '../utils/profileUtils';

interface MentionInputProps {
  value: string;
  onChange: (value: string, htmlContent?: string) => void;
  placeholder?: string;
  className?: string;
  supabase: SupabaseClient<Database>;
  onSubmit?: (value: string) => void;
}

interface Agent {
  id: string;
  email: string;
  name: string;
  role: string;
  display: string;
}

// Add this utility function at the top level
const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
  supabase,
  onSubmit,
}) => {
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionResults, setMentionResults] = useState<Agent[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isKeyboardNav, setIsKeyboardNav] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Track @ symbol position and search text
  const getAtSignInfo = () => {
    const selection = window.getSelection();
    if (!selection || !contentRef.current) return null;

    const text = contentRef.current.textContent || '';
    const position = selection.focusOffset;
    const beforeCursor = text.slice(0, position);
    const atSignIndex = beforeCursor.lastIndexOf('@');
    
    if (atSignIndex === -1) return null;
    
    const afterAt = beforeCursor.slice(atSignIndex + 1);
    if (afterAt.includes(' ')) return null;
    
    return {
      searchText: afterAt,
      position: atSignIndex
    };
  };

  // Search for agents when typing after @
  useEffect(() => {
    const searchAgents = async () => {
      if (!mentionSearch) {
        setMentionResults([]);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('agent_search', {
          body: { query: mentionSearch }
        });

        if (error) throw error;
        setMentionResults(data.agents || []);
      } catch (error) {
        console.error('Error searching agents:', error);
        setMentionResults([]);
      }
    };

    if (mentionSearch) {
      searchAgents();
    }
  }, [mentionSearch, supabase]);

  // Handle input changes
  const handleInput = () => {
    if (!contentRef.current) return;
    
    const atInfo = getAtSignInfo();
    if (atInfo) {
      setMentionSearch(atInfo.searchText);
      setShowMentions(true);
      setSelectedIndex(0);
    } else {
      setShowMentions(false);
      setMentionSearch('');
    }
    
    // Update parent with both text and HTML content
    onChange(contentRef.current.textContent || '', contentRef.current.innerHTML);
  };

  // Handle keyboard navigation and deletion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showMentions && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsKeyboardNav(true);
        setSelectedIndex((prevIndex) => {
          const newIndex = prevIndex < mentionResults.length - 1 ? prevIndex + 1 : prevIndex;
          // Scroll selected item into view
          const selectedItem = mentionListRef.current?.children[newIndex] as HTMLElement;
          selectedItem?.scrollIntoView({ block: 'nearest' });
          return newIndex;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsKeyboardNav(true);
        setSelectedIndex((prevIndex) => {
          const newIndex = prevIndex > 0 ? prevIndex - 1 : prevIndex;
          // Scroll selected item into view
          const selectedItem = mentionListRef.current?.children[newIndex] as HTMLElement;
          selectedItem?.scrollIntoView({ block: 'nearest' });
          return newIndex;
        });
      } else if (e.key === 'Enter' && showMentions) {
        e.preventDefault();
        handleSelectMention(mentionResults[selectedIndex]);
        return;
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
      return;
    }

    // Handle Enter key
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow new line with Shift+Enter
        return;
      }
      
      e.preventDefault();
      if (contentRef.current?.textContent?.trim()) {
        onSubmit?.(contentRef.current.textContent);
        contentRef.current.textContent = '';
        onChange('', contentRef.current.innerHTML);
      }
      return;
    }

    // Handle mention deletion
    if ((e.key === 'Backspace' || e.key === 'Delete') && contentRef.current) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      if (!range.collapsed) return; // Let normal deletion handle selected text

      const currentNode = range.startContainer;
      const offset = range.startOffset;

      // Check if we're at the start of a text node after a mention
      if (e.key === 'Backspace' && offset === 0) {
        const prevNode = currentNode.previousSibling;
        const prevPrevNode = prevNode?.previousSibling;
        
        if (prevNode instanceof Element && prevNode.classList.contains('mention-text')) {
          e.preventDefault();
          prevNode.remove();
          handleInput();
          return;
        } else if (prevNode?.nodeType === Node.TEXT_NODE && 
                  prevNode.textContent === ' ' && 
                  prevPrevNode instanceof Element && 
                  prevPrevNode.classList.contains('mention-text')) {
          e.preventDefault();
          prevPrevNode.remove();
          prevNode.remove();
          handleInput();
          return;
        }
      }

      // Check if we're at the end of a text node before a mention
      if (e.key === 'Delete') {
        const nextNode = currentNode.nextSibling;
        const nextNextNode = nextNode?.nextSibling;
        
        if (offset === (currentNode.textContent?.length || 0)) {
          if (nextNode instanceof Element && nextNode.classList.contains('mention-text')) {
            e.preventDefault();
            nextNode.remove();
            handleInput();
            return;
          } else if (nextNode?.nodeType === Node.TEXT_NODE && 
                    nextNode.textContent === ' ' && 
                    nextNextNode instanceof Element && 
                    nextNextNode.classList.contains('mention-text')) {
            e.preventDefault();
            nextNextNode.remove();
            nextNode.remove();
            handleInput();
            return;
          }
        }
      }

      // Check if we're inside or right after a mention
      if (currentNode instanceof Element && currentNode.classList.contains('mention-text')) {
        e.preventDefault();
        const nextNode = currentNode.nextSibling;
        if (nextNode?.nodeType === Node.TEXT_NODE && nextNode.textContent === ' ') {
          nextNode.remove();
        }
        currentNode.remove();
        handleInput();
        return;
      }
    }
  };

  const handleMouseMove = (index: number) => {
    if (!isKeyboardNav) {
      setSelectedIndex(index);
    }
    setIsKeyboardNav(false);
  };

  // Handle mention selection
  const handleSelectMention = (agent: Agent) => {
    if (!contentRef.current) return;
    
    const selection = window.getSelection();
    if (!selection) return;
    
    const atInfo = getAtSignInfo();
    if (!atInfo) return;

    // Create mention span
    const mentionSpan = document.createElement('span');
    mentionSpan.className = 'mention-text';
    mentionSpan.contentEditable = 'false';
    mentionSpan.textContent = `@${agent.name}`;
    mentionSpan.dataset.email = agent.email; // Store email in dataset

    // Get the text node containing the @
    const textNodes = Array.from(contentRef.current.childNodes);
    let currentPos = 0;
    let targetNode = null;
    let offset = 0;

    for (const node of textNodes) {
      const length = node.textContent?.length || 0;
      if (currentPos + length > atInfo.position) {
        targetNode = node;
        offset = atInfo.position - currentPos;
        break;
      }
      currentPos += length;
    }

    if (targetNode && targetNode.textContent) {
      // Split the text node and insert mention
      const beforeText = targetNode.textContent.slice(0, offset);
      const afterText = targetNode.textContent.slice(offset + mentionSearch.length + 1);
      
      const beforeNode = document.createTextNode(beforeText);
      const afterNode = document.createTextNode(afterText);
      const spaceNode = document.createTextNode(' ');
      
      if (targetNode.parentNode) {
        targetNode.parentNode.insertBefore(beforeNode, targetNode);
        targetNode.parentNode.insertBefore(mentionSpan, targetNode);
        targetNode.parentNode.insertBefore(spaceNode, targetNode);
        targetNode.parentNode.insertBefore(afterNode, targetNode);
        targetNode.parentNode.removeChild(targetNode);

        // Focus after the space
        const range = document.createRange();
        range.setStartAfter(spaceNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    setShowMentions(false);
    setMentionSearch('');
    
    // Update parent with both text and HTML content
    onChange(contentRef.current.textContent || '', contentRef.current.innerHTML);
  };

  // Update content when value prop changes
  useEffect(() => {
    if (contentRef.current && contentRef.current.textContent !== value) {
      contentRef.current.textContent = value;
    }
  }, [value]);

  return (
    <div className="relative">
      <div
        ref={contentRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        data-placeholder={placeholder}
        className={`autocrm-mention-content ${className || ''}`}
        role="textbox"
        aria-multiline="true"
      />
      
      {showMentions && mentionResults.length > 0 && (
        <div
          ref={mentionListRef}
          className="mention-dropdown"
        >
          {mentionResults.map((agent, index) => (
            <div
              key={agent.id}
              className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelectMention(agent)}
              onMouseMove={() => handleMouseMove(index)}
              style={{
                '--hover-bg': `${getProfileColor(agent.email)}15`,
                '--selected-bg': `${getProfileColor(agent.email)}25`
              } as React.CSSProperties}
            >
              <div 
                className="mention-avatar"
                style={{ backgroundColor: getProfileColor(agent.email) }}
              >
                {getInitials(agent.name)}
              </div>
              <div className="mention-info">
                <div className="mention-name">{agent.name}</div>
                <div className="mention-email">{agent.email}</div>
              </div>
              <div className={`mention-role ${agent.role.toLowerCase()}`}>
                {agent.role}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 