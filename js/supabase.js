// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabaseUrl = 'https://jcfwgotfyxerwwtbmesp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjZndnb3RmeXhlcnd3dGJtZXNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTMxMzEsImV4cCI6MjEwNzU2OTEzMX0.NyJg11WjoaYJmzAvsKH3FfVk2AlXHXyIBS3iV0k9PKw';

export const supabase = createClient(supabaseUrl, supabaseKey);