import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ticketService } from '../services/ticketService';

interface Reply {
    id: number;
    ticket_id: number;
    content: string;
    user_id: string;
    created_at: string;
    is_public: boolean;
    is_ai_generated: boolean;
    user_profile?: {
        email: string;
        full_name: string;
        avatar_url?: string;
        role: string;
    };
    user_avatar?: string;
}

export default function TicketChat({ ticketId }: { ticketId: number }) {
    const [replies, setReplies] = useState<Reply[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Callback for handling new replies
    const handleNewReply = useCallback((newReply: Reply) => {
        console.log('Received new reply:', newReply);
        setReplies(prevReplies => {
            // Check if reply already exists to prevent duplicates
            if (prevReplies.some(reply => reply.id === newReply.id)) {
                console.log('Reply already exists, skipping...');
                return prevReplies;
            }
            console.log('Adding new reply to state');
            return [...prevReplies, newReply];
        });
    }, []);

    useEffect(() => {
        let isSubscribed = true;
        console.log('Setting up TicketChat for ticket:', ticketId);

        // Initial load of replies
        const loadReplies = async () => {
            try {
                console.log('Loading initial replies...');
                setIsLoading(true);
                const { data: repliesData, error } = await supabase
                    .from('replies')
                    .select(`
                        *,
                        user_profile:profiles!replies_user_id_fkey (
                            email,
                            full_name,
                            avatar_url,
                            role
                        )
                    `)
                    .eq('ticket_id', ticketId)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                if (isSubscribed) {
                    console.log('Setting initial replies:', repliesData);
                    setReplies(repliesData.map((reply: any) => ({
                        ...reply,
                        user_avatar: reply.user_profile?.avatar_url
                    })));
                }
            } catch (err: any) {
                console.error('Error loading replies:', err);
                if (isSubscribed) {
                    setError(err.message);
                }
            } finally {
                if (isSubscribed) {
                    setIsLoading(false);
                }
            }
        };

        loadReplies();

        // Subscribe to new replies
        console.log('Setting up real-time subscription...');
        const unsubscribe = ticketService.subscribeToReplies(ticketId, handleNewReply);

        // Cleanup subscription on unmount
        return () => {
            console.log('Cleaning up TicketChat...');
            isSubscribed = false;
            unsubscribe();
            ticketService.unsubscribeFromReplies();
        };
    }, [ticketId, handleNewReply]);

    if (error) {
        return <div>Error loading replies: {error}</div>;
    }

    if (isLoading) {
        return <div>Loading replies...</div>;
    }

    return (
        <div className="ticket-chat">
            {replies.map((reply) => (
                <div key={reply.id} className="reply">
                    <div className="reply-header">
                        <div className="reply-user">
                            {reply.user_profile?.full_name || reply.user_profile?.email || 'Unknown User'}
                            {reply.is_ai_generated && <span className="ai-badge">AI</span>}
                        </div>
                        <div className="reply-time">
                            {new Date(reply.created_at).toLocaleString()}
                        </div>
                    </div>
                    <div className="reply-content">{reply.content}</div>
                </div>
            ))}
        </div>
    );
} 
