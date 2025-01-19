import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Customer {
  id: string;
  name: string;
  email: string;
  tags: string[];
  timezone: string;
  group_name?: string;
  user_type: string;
  access: string;
  organization?: string;
  language: string;
  details?: any;
  notes?: string;
  updated_at: string;
}

interface SuspendedUser {
  id: string;
  name: string;
  email: string;
  reason: string;
  suspended_by: string;
  suspended_date: string;
}

interface CustomerContextType {
  customers: Customer[];
  suspendedUsers: SuspendedUser[];
  loading: boolean;
  searchCustomers: (query: string) => Promise<void>;
  searchSuspendedUsers: (query: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export const CustomerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suspendedUsers, setSuspendedUsers] = useState<SuspendedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch customers
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false });

      if (customerError) throw customerError;
      setCustomers(customerData || []);

      // Fetch suspended users
      const { data: suspendedData, error: suspendedError } = await supabase
        .from('suspended_users')
        .select('*')
        .order('suspended_date', { ascending: false });

      if (suspendedError) throw suspendedError;
      setSuspendedUsers(suspendedData || []);
    } catch (error: any) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchCustomers = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Error searching customers:', error.message);
    }
  };

  const searchSuspendedUsers = async (query: string) => {
    try {
      const { data, error } = await supabase
        .from('suspended_users')
        .select('*')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .order('suspended_date', { ascending: false });

      if (error) throw error;
      setSuspendedUsers(data || []);
    } catch (error: any) {
      console.error('Error searching suspended users:', error.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <CustomerContext.Provider 
      value={{ 
        customers, 
        suspendedUsers, 
        loading,
        searchCustomers,
        searchSuspendedUsers,
        refreshData: fetchData
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomers = () => {
  const context = useContext(CustomerContext);
  if (context === undefined) {
    throw new Error('useCustomers must be used within a CustomerProvider');
  }
  return context;
}; 