import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface SignUpOptions {
  data?: {
    full_name?: string;
    role?: string;
  };
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, options?: SignUpOptions) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, options?: SignUpOptions) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: options?.data
      }
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (signInError) throw signInError;

    // Fetch user's role from profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', signInData.user?.id)
      .single();
    
    if (profileError) throw profileError;

    // Update user metadata with role
    if (profileData?.role) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { role: profileData.role }
      });
      if (updateError) throw updateError;
    }
  };

  const signOut = async () => {
    try {
      // First try to get the current session
      const { data: { session } } = await supabase.auth.getSession();
      
      // If we have a session, try to sign out normally
      if (session) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      } else {
        // If no session, clear any local storage data
        localStorage.removeItem('supabase.auth.token');
        // Force clear the user state
        setUser(null);
      }
    } catch (error) {
      console.error('Error in signOut:', error);
      // If there's an error (like invalid session), clear local storage and user state
      localStorage.removeItem('supabase.auth.token');
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider; 