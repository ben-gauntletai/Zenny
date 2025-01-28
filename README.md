# Zenny - Customer Service Platform

## Project Structure

```
.
├── src/               # React frontend
├── backend/           # Python FastAPI backend for AutoCRM
├── supabase/          # Supabase configuration and migrations
└── README.md
```

## Development

### Frontend

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

### Backend (AutoCRM)

1. Navigate to the backend directory:
```bash
cd backend
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your production Supabase and OpenAI credentials
```

3. Run with Docker Compose:
```bash
docker-compose up
```

The API will be available at `http://localhost:8000`.

## Deployment

### Frontend

The frontend is automatically deployed to AWS Amplify when changes are pushed to the main branch.

### Backend

The AutoCRM backend is deployed as a container service in AWS Amplify. Environment variables are managed through the AWS Amplify Console.

## Environment Variables

### Frontend (.env)
```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
REACT_APP_API_URL=your_backend_api_url
```

### Backend (.env)
```
SUPABASE_URL=your_production_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key
OPENAI_API_KEY=your_openai_key
```

## Documentation

- [Frontend Documentation](src/README.md)
- [Backend Documentation](backend/README.md)
- [Supabase Documentation](supabase/README.md) 