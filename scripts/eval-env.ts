/**
 * Environment variable mapping for eval scripts.
 * Must be imported FIRST (before any project module).
 *
 * Connects to PostgREST via SSH tunnel: localhost:3000
 * Tunnel: ssh -i ~/.ssh/id_nas -L 3000:localhost:3000 root@46.225.234.164 -N
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// PostgREST via SSH tunnel (direct mode — no /rest/v1 suffix)
process.env.POSTGREST_URL = process.env.POSTGREST_URL || 'http://localhost:3000';
process.env.POSTGREST_DIRECT = '1';
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Service-role JWT for PostgREST (HS256, role=service_role)
process.env.POSTGREST_SERVICE_KEY = process.env.POSTGREST_SERVICE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NDI3NjIwMDAsImV4cCI6MTkwMDAwMDAwMH0.xAw1u4SuCduFKCEX7dDO6XLqoNd_KrnIqMYQVEGVx5Y';

// Map remaining Supabase vars
process.env.POSTGREST_JWT_SECRET = process.env.POSTGREST_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';

// Law-fetcher microservice via SSH tunnel (ssh -L 3100:localhost:3100 root@46.225.234.164)
process.env.LAW_FETCHER_URL = process.env.LAW_FETCHER_URL || 'http://localhost:3100';
process.env.LAW_FETCHER_KEY = process.env.LAW_FETCHER_KEY || 'law-fetcher-internal-key';
