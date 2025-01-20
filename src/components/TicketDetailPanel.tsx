import React from 'react';
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

interface Profile {
  email: string;
}

interface TicketDetailPanelProps {
  ticket: {
    requester: Profile | null;
    assignee: Profile | null;
    followers: Profile[];
    tags: string[];
    type: string;
    priority: 'Low' | 'Normal' | 'High' | 'Urgent';
    linkedProblem?: string;
    topic?: string;
    customerType?: string;
  };
  onUpdate: (field: string, value: unknown) => void;
}

const TicketDetailPanel: React.FC<TicketDetailPanelProps> = ({ ticket, onUpdate }) => {
  return (
    <Box className="ticket-detail-panel">
      <Stack spacing={0}>
        <Box className="field-group">
          <Text className="field-label">Requester</Text>
          <Text className="field-value">{ticket.requester?.email || 'No requester'}</Text>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Assignee</Text>
          <HStack justify="space-between" align="center" spacing={2}>
            <Text className="field-value" noOfLines={1}>{ticket.assignee?.email || 'Unassigned'}</Text>
            <Button
              className="action-button"
              variant="ghost"
              size="xs"
              onClick={() => onUpdate('assignee', null)}
            >
              Take It
            </Button>
          </HStack>
        </Box>

        <Box className="field-group">
          <HStack justify="space-between" align="center" mb={1} spacing={2}>
            <Text className="field-label">Followers</Text>
            <Tooltip label="People who will be notified of updates">
              <Icon as={InfoIcon} color="gray.400" boxSize={3} cursor="help" />
            </Tooltip>
          </HStack>
          <HStack justify="space-between" align="center" spacing={2}>
            <Text className="field-value" noOfLines={1}>
              {ticket.followers.length > 0 ? ticket.followers.map(f => f.email).join(', ') : 'No followers'}
            </Text>
            <Button
              className="action-button"
              variant="ghost"
              size="xs"
            >
              Follow
            </Button>
          </HStack>
        </Box>

        <Box className="field-group">
          <Text className="field-label">Tags</Text>
          <Box className="tag-container">
            {ticket.tags.map(tag => (
              <Box key={tag} className="tag">
                <Text>{tag}</Text>
                <Box
                  as="span"
                  className="tag-close"
                  onClick={() => {
                    const newTags = ticket.tags.filter(t => t !== tag);
                    onUpdate('tags', newTags);
                  }}
                >
                  <CloseIcon boxSize={2} />
                </Box>
              </Box>
            ))}
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
          <HStack justify="space-between" align="center" mb={1} spacing={2}>
            <Text className="field-label">Linked problem</Text>
            <Button
              className="action-button"
              variant="ghost"
              size="xs"
              onClick={() => onUpdate('linkedProblem', null)}
            >
              Unlink
            </Button>
          </HStack>
          <Select
            value={ticket.linkedProblem || ''}
            onChange={(e) => onUpdate('linkedProblem', e.target.value || null)}
            size="sm"
            placeholder="-"
          >
            <option value="">None</option>
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

        <Box className="field-group">
          <Text className="field-label">Customer Type</Text>
          <Select
            value={ticket.customerType || ''}
            onChange={(e) => onUpdate('customerType', e.target.value || null)}
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