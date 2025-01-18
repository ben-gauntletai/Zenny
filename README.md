# Zenny - Customer Service Platform

A modern customer service platform built with React, Supabase, and TypeScript.

## Features

- User Authentication (Login/Signup)
- Ticket Management
- Knowledge Base
- Role-based Access Control (Users, Agents, Admins)
- Real-time Updates

## Tech Stack

- React 18 with TypeScript
- Supabase (Database, Authentication, Real-time subscriptions)
- React Router for navigation
- CSS for styling

## Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- A Supabase account and project

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd zenny
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Supabase credentials:
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Set up your Supabase database with the following tables:
   - users (managed by Supabase Auth)
   - tickets
   - ticket_comments
   - knowledge_base_articles

5. Start the development server:
```bash
npm start
```

## Database Schema

### Users (Managed by Supabase Auth)
- id: uuid (primary key)
- email: string
- role: enum ('user', 'agent', 'admin')

### Tickets
- id: uuid (primary key)
- title: string
- description: text
- status: enum ('open', 'pending', 'closed')
- priority: enum ('low', 'medium', 'high')
- user_id: uuid (foreign key to users)
- assigned_to: uuid (foreign key to users, nullable)
- created_at: timestamp
- updated_at: timestamp

### Ticket Comments
- id: uuid (primary key)
- ticket_id: uuid (foreign key to tickets)
- user_id: uuid (foreign key to users)
- content: text
- created_at: timestamp

### Knowledge Base Articles
- id: uuid (primary key)
- title: string
- content: text
- author_id: uuid (foreign key to users)
- created_at: timestamp
- updated_at: timestamp

## Development

The project follows a component-based architecture with the following structure:

```
src/
  components/     # Reusable components
  contexts/       # React contexts (auth, etc.)
  pages/          # Page components
  styles/         # CSS styles
  lib/           # Utilities and configurations
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request 