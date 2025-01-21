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
  Tooltip
} from '@chakra-ui/react';
import { CloseIcon, InfoIcon } from '@chakra-ui/icons';
import { supabase } from '../lib/supabaseClient';

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
    type: string;
    priority: 'Low' | 'Normal' | 'High' | 'Urgent';
    topic?: string;
  };
  onUpdate: (field: string, value: unknown) => void;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({ ticket, onUpdate }) => {
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
      if (!ticket.tags.includes(tagToAdd)) {
        const newTags = [...ticket.tags, tagToAdd];
        onUpdate('tags', newTags);
      }
      setNewTag('');
    }
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
              value={ticket.assignee?.id || ''}
              onChange={async (e) => {
                try {
                  const value = e.target.value || null;
                  console.log('Updating assignee to:', value);
                  await onUpdate('assigned_to', value);
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
          <Text className="field-label">Tags</Text>
          <Box>
            <Input
              size="sm"
              placeholder="Add tag and press Enter"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={handleAddTag}
              mb={2}
            />
            <Box className="tag-container">
              {ticket.tags.map(tag => (
                <Box 
                  key={tag} 
                  className="tag"
                  as="button"
                  onClick={() => {
                    const newTags = ticket.tags.filter(t => t !== tag);
                    onUpdate('tags', newTags);
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
            value={ticket.type}
            onChange={(e) => onUpdate('type', e.target.value)}
            size="sm"
          >
            <option value="incident">Incident</option>
            <option value="problem">Problem</option>
            <option value="task">Task</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Priority</Text>
          <Select
            value={ticket.priority}
            onChange={(e) => onUpdate('priority', e.target.value)}
            size="sm"
          >
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Urgent">Urgent</option>
          </Select>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Topic</Text>
          <Select
            value={ticket.topic || ''}
            onChange={(e) => onUpdate('topic', e.target.value || null)}
            size="sm"
            placeholder="-"
          >
            <option value="">None</option>
          </Select>
        </Box>
      </Stack>
    </Box>
  );
};

export default TicketDetailPanel; 