import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qnquicysinpybpnlqtan.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucXVpY3lzaW5weWJwbmxxdGFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDAxMDIsImV4cCI6MjA5NzE3NjEwMn0.gULuUtUgO0mMmMjZGTQWlxV4lgByTBBCO0Gt_jijHyM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
