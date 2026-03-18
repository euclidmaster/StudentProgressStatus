// supabase-config.js - Supabase 클라이언트 설정
// ⚠️ 아래 값을 본인의 Supabase 프로젝트 정보로 교체하세요.
// Supabase 대시보드 > Settings > API에서 확인할 수 있습니다.

const SUPABASE_URL = 'https://rcagjavjvsofxmowohbb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjYWdqYXZqdnNvZnhtb3dvaGJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MjgzOTQsImV4cCI6MjA4OTQwNDM5NH0.GgrqeRUX6OFRsgLrAy72ihFA6GFjbpz6t7uRfk-M6bQ';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
