// Local runner to avoid shell env issues. Do not commit secrets to VCS in production.
process.env.PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || 'https://zzyueuweeoakopuuwfau.supabase.co';
process.env.PUBLIC_SUPABASE_ANON_KEY =
    process.env.PUBLIC_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6eXVldXdlZW9ha29wdXV3ZmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQzODEzMDEsImV4cCI6MjA1OTk1NzMwMX0.y8V3EXK9QVd3txSWdE3gZrSs96Ao0nvpnd0ntZw_dQ4';
process.env.DEPLOY_URL = process.env.DEPLOY_URL || 'https://ainewsblog5s6a.netlify.app';

import './tests.node.mjs';
