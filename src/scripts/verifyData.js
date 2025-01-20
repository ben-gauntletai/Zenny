require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Use local Supabase instance
const supabaseUrl = 'http://localhost:54321';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function fetchCustomers(supabase, context) {
  console.log(`\nFetching customers as ${context}...`);
  const { data: customers, error, status } = await supabase
    .from('customers')
    .select('*');
  
  console.log('Response status:', status);
  
  if (error) {
    console.error(`Error fetching customers as ${context}:`, error.message);
    return;
  }
  
  console.log(`Found ${customers?.length || 0} customers as ${context}`);
  if (customers?.length > 0) {
    customers.forEach(customer => {
      console.log(`- ${customer.name} (${customer.organization})`);
    });
  }
}

async function verifyCustomers() {
  try {
    console.log('Starting customer data verification...');
    console.log('Using Supabase URL:', supabaseUrl);

    // Test anonymous access (should see no customers)
    const anonClient = createClient(supabaseUrl, anonKey);
    await fetchCustomers(anonClient, 'anonymous');

    // Test service_role access (should see all customers)
    const serviceClient = createClient(supabaseUrl, serviceKey);
    await fetchCustomers(serviceClient, 'service_role');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the verification
verifyCustomers(); 