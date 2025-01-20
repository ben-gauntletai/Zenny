import { supabase } from '../lib/supabaseClient';

async function verifyCustomers() {
  try {
    console.log('Checking customers data...');
    
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*');
    
    if (error) {
      console.error('Error fetching customers:', error);
      return;
    }
    
    console.log('Found', customers?.length, 'customers:');
    customers?.forEach(customer => {
      console.log(`- ${customer.name} (${customer.organization})`);
    });
  } catch (error) {
    console.error('Verification failed:', error);
  }
}

// Run the verification
verifyCustomers(); 