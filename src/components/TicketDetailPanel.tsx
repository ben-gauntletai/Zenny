import React, { useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Button,
  Box,
  HStack,
  Input,
  Select,
  Icon,
  Tooltip,
  VStack,
  Badge
} from '@chakra-ui/react';
import { CloseIcon, InfoIcon } from '@chakra-ui/icons';
import { supabase } from '../lib/supabaseClient';
import { type Ticket } from '../hooks/useTicket';

interface Profile {
  id?: string;
  email: string;
  full_name?: string | null;
}

interface TicketDetailPanelProps {
  ticket: {
    requester: Profile | null;
    assignee: Profile | null;
    tags: string[];
    type: 'question' | 'incident' | 'problem' | 'task';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    topic: 'ISSUE' | 'INQUIRY' | 'PAYMENTS' | 'OTHER' | 'NONE' | null;
    status: 'open' | 'pending' | 'solved' | 'closed';
    assigned_to?: string;
    group_name?: 'Support' | 'Admin';
  };
  onUpdate: (field: string, value: unknown) => void;
  pendingChanges: Partial<{
    assigned_to?: string;
    tags?: string[];
    ticket_type?: string;
    priority?: string;
    topic?: string | null;
    status?: string;
    group_name?: string;
  }>;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({ ticket, onUpdate, pendingChanges }) => {
  const [agents, setAgents] = useState<Profile[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('role', ['agent', 'admin']);

      if (error) throw error;
      setAgents(data || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
    }
  };

  const getDisplayName = (agent: Profile) => {
    return agent.full_name || agent.email;
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTag.trim()) {
      const tagToAdd = newTag.trim();
      const currentTags = pendingChanges.tags || ticket.tags;
      if (!currentTags.includes(tagToAdd)) {
        const newTags = [...currentTags, tagToAdd];
        onUpdate('tags', newTags);
      }
      setNewTag('');
    }
  };

  const handleAssigneeChange = async (newAssignee: string) => {
    console.log('🎯 Setting pending change for assignee:', { newAssignee });
    onUpdate('assigned_to', newAssignee || null);
  };

  const handleStatusChange = async (newStatus: TicketDetailPanelProps['ticket']['status']) => {
    console.log('🎯 Setting pending change for status:', { newStatus });
    onUpdate('status', newStatus);
  };

  const handlePriorityChange = async (newPriority: TicketDetailPanelProps['ticket']['priority']) => {
    console.log('🎯 Setting pending change for priority:', { newPriority });
    onUpdate('priority', newPriority);
  };

  const handleTypeChange = async (newType: TicketDetailPanelProps['ticket']['type']) => {
    console.log('🎯 Setting pending change for type:', { newType });
    onUpdate('ticket_type', newType);
  };

  const handleTopicChange = async (newTopic: TicketDetailPanelProps['ticket']['topic']) => {
    console.log('🎯 Setting pending change for topic:', { newTopic });
    onUpdate('topic', newTopic);
  };

  const handleGroupChange = async (newGroup: TicketDetailPanelProps['ticket']['group_name']) => {
    console.log('🎯 Setting pending change for group:', { newGroup });
    onUpdate('group_name', newGroup);
  };

  const handleTagsUpdate = async (newTags: string[]) => {
    console.log('🎯 Calling updateTicket for tags:', { newTags });
    onUpdate('tags', newTags);
  };

  return (
    <Box className="ticket-detail-panel">
      <Stack spacing={0}>
        <Box className="field-group">
          <Text className="field-label">Requester</Text>
          <Text className="field-value">{ticket.requester?.full_name || ticket.requester?.email || 'No requester'}</Text>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Assignee</Text>
          <HStack justify="space-between" align="center" spacing={2}>
            <Select
              size="sm"
              value={pendingChanges.assigned_to !== undefined ? pendingChanges.assigned_to : (ticket.assigned_to || '')}
              onChange={async (e) => {
                try {
                  const value = e.target.value;
                  console.log('Updating assignee to:', value);
                  await handleAssigneeChange(value || '');
                } catch (err) {
                  console.error('Error updating assignee:', err);
                }
              }}
            >
              <option value="">Unassigned</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {getDisplayName(agent)}
                </option>
              ))}
            </Select>
          </HStack>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Group</Text>
          <Select
            value={pendingChanges.group_name ?? ticket.group_name ?? 'Support'}
            onChange={async (e) => {
              await handleGroupChange(e.target.value as TicketDetailPanelProps['ticket']['group_name']);
            }}
            size="sm"
          >
            <option value="Support">Support</option>
            <option value="Admin">Admin</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Tags</Text>
          <Box>
            <Input
              size="sm"
              placeholder="Add tag and press Enter"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newTag.trim()) {
                  const tagToAdd = newTag.trim();
                  const currentTags = pendingChanges.tags || ticket.tags;
                  if (!currentTags.includes(tagToAdd)) {
                    const newTags = [...currentTags, tagToAdd];
                    await handleTagsUpdate(newTags);
                  }
                  setNewTag('');
                }
              }}
              mb={2}
            />
            <Box className="tag-container">
              {(pendingChanges.tags || ticket.tags).map(tag => (
                <Box 
                  key={tag} 
                  className="tag"
                  as="button"
                  onClick={async () => {
                    const currentTags = pendingChanges.tags || ticket.tags;
                    const newTags = currentTags.filter(t => t !== tag);
                    await handleTagsUpdate(newTags);
                  }}
                  aria-label={`Remove ${tag} tag`}
                  position="relative"
                >
                  <Text>{tag}</Text>
                  <Box
                    className="tag-remove"
                    position="absolute"
                    top="-10px"
                    right="-10px"
                    color="red.500"
                    opacity="0"
                    _groupHover={{ opacity: 1 }}
                  >
                    <CloseIcon boxSize={5} />
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Type</Text>
          <Select
            value={pendingChanges.ticket_type ?? ticket.type}
            onChange={async (e) => {
              await handleTypeChange(e.target.value as TicketDetailPanelProps['ticket']['type']);
            }}
            size="sm"
          >
            <option value="question">Question</option>
            <option value="incident">Incident</option>
            <option value="problem">Problem</option>
            <option value="task">Task</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Status</Text>
          <Select
            value={pendingChanges.status ?? ticket.status}
            onChange={async (e) => {
              console.log('Status changed to:', e.target.value);
              await handleStatusChange(e.target.value as TicketDetailPanelProps['ticket']['status']);
            }}
            size="sm"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="solved">Solved</option>
            <option value="closed">Closed</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Priority</Text>
          <Select
            value={pendingChanges.priority ?? ticket.priority}
            onChange={async (e) => {
              console.log('Priority changed to:', e.target.value);
              await handlePriorityChange(e.target.value.toLowerCase() as TicketDetailPanelProps['ticket']['priority']);
            }}
            size="sm"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Topic</Text>
          <Select
            value={pendingChanges.topic ?? ticket.topic ?? 'NONE'}
            onChange={async (e) => {
              await handleTopicChange(e.target.value as 'ISSUE' | 'INQUIRY' | 'PAYMENTS' | 'OTHER' | 'NONE');
            }}
            size="sm"
          >
            <option value="NONE">None</option>
            <option value="ISSUE">Issue</option>
            <option value="INQUIRY">Inquiry</option>
            <option value="PAYMENTS">Payments</option>
            <option value="OTHER">Other</option>
          </Select>
        </Box>
      </Stack>
    </Box>
  );
};

export default TicketDetailPanel; 