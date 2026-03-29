-- ============================================
-- EM플러스 학원 학생 진도 관리 시스템
-- Supabase 데이터베이스 스키마
-- ============================================
-- 이 SQL을 Supabase 대시보드 > SQL Editor에서 실행하세요.

-- 1. 학생 테이블
CREATE TABLE students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    school TEXT DEFAULT '',
    grade TEXT DEFAULT '',
    class_name TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    parent_phone TEXT DEFAULT '',
    parent_name TEXT DEFAULT '',
    previous_grades TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT '',
    enroll_date TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 2. 학습 계획 테이블
CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    subject TEXT DEFAULT '',
    textbook TEXT DEFAULT '',
    study_method TEXT DEFAULT '',
    difficulty TEXT DEFAULT '',
    plan_type TEXT DEFAULT '',
    start_date TEXT DEFAULT '',
    end_date TEXT DEFAULT '',
    total_units INTEGER DEFAULT 0,
    unit_label TEXT DEFAULT '',
    completed_units INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    tracking_mode TEXT DEFAULT 'numeric',
    checklist_items JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 3. 진도 기록 테이블
CREATE TABLE progress (
    id TEXT PRIMARY KEY,
    plan_id TEXT,
    student_id TEXT,
    date TEXT DEFAULT '',
    amount INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 4. 코멘트 테이블
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    plan_id TEXT,
    author TEXT DEFAULT '',
    author_role TEXT DEFAULT '',
    content TEXT DEFAULT '',
    recipients JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 5. 메시지 테이블
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    author TEXT DEFAULT '',
    author_role TEXT DEFAULT '',
    student_id TEXT,
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    read_by JSONB DEFAULT '{}',
    pinned BOOLEAN DEFAULT FALSE,
    channel TEXT DEFAULT 'internal',  -- 'internal' | 'team'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 6. 사용자(선생님/원장/학생) 테이블
CREATE TABLE teachers (
    id TEXT PRIMARY KEY,
    login_id TEXT UNIQUE,
    password TEXT DEFAULT '',
    name TEXT DEFAULT '',
    role TEXT DEFAULT '',
    assigned_student_ids JSONB DEFAULT '[]',
    student_id TEXT,
    approved BOOLEAN DEFAULT TRUE,
    reg_date TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 7. 성적 테이블
CREATE TABLE grades (
    id TEXT PRIMARY KEY,
    student_id TEXT,
    semester TEXT DEFAULT '',
    exam_type TEXT DEFAULT '',
    exam_date TEXT DEFAULT '',
    exam_name TEXT DEFAULT '',
    total_rank TEXT DEFAULT '',
    subjects JSONB DEFAULT '[]',
    grade_system TEXT DEFAULT '9',
    total_avg REAL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- ============================================
-- pgcrypto 확장 (서버사이드 bcrypt 검증용)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 서버사이드 로그인 함수
-- 비밀번호 해시를 클라이언트에 절대 전송하지 않음
-- SECURITY DEFINER: anon 역할에서 호출해도 password 컬럼 접근 가능
-- ============================================
CREATE OR REPLACE FUNCTION public.secure_login(p_login_id TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user teachers%ROWTYPE;
  v_match BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_user FROM teachers WHERE login_id = p_login_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- bcrypt 해시 여부 확인 후 검증
  IF left(v_user.password, 4) = '$2a$' OR left(v_user.password, 4) = '$2b$' THEN
    v_match := (v_user.password = crypt(p_password, v_user.password));
  ELSE
    -- 평문 비밀번호: 직접 비교 후 bcrypt로 자동 마이그레이션
    v_match := (v_user.password = p_password);
    IF v_match THEN
      UPDATE teachers SET password = crypt(p_password, gen_salt('bf', 10)) WHERE id = v_user.id;
    END IF;
  END IF;

  IF NOT v_match THEN RETURN NULL; END IF;

  -- 비밀번호 해시는 반환하지 않음
  RETURN json_build_object(
    'id',                   v_user.id,
    'login_id',             v_user.login_id,
    'name',                 v_user.name,
    'role',                 v_user.role,
    'approved',             v_user.approved,
    'student_id',           v_user.student_id,
    'assigned_student_ids', v_user.assigned_student_ids
  );
END;
$$;

-- ============================================
-- RLS (Row Level Security) 정책
-- 현재 구조: 자체 teachers 테이블 인증 (Supabase Auth 미사용)
-- → anon 키 기반이므로 JWT per-user RLS 적용 불가
-- → 대신 password 컬럼 SELECT 차단 + secure_login 함수로 서버사이드 검증
--
-- ※ 향후 Supabase Auth 마이그레이션 시 아래 주석 정책으로 교체하세요.
-- ============================================

-- students
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON students;
CREATE POLICY "anon_all" ON students FOR ALL TO anon USING (true) WITH CHECK (true);

-- plans
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON plans;
CREATE POLICY "anon_all" ON plans FOR ALL TO anon USING (true) WITH CHECK (true);

-- progress
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON progress;
CREATE POLICY "anon_all" ON progress FOR ALL TO anon USING (true) WITH CHECK (true);

-- comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON comments;
CREATE POLICY "anon_all" ON comments FOR ALL TO anon USING (true) WITH CHECK (true);

-- messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON messages;
CREATE POLICY "anon_all" ON messages FOR ALL TO anon USING (true) WITH CHECK (true);

-- teachers: password 컬럼 SELECT를 anon 역할에서 차단
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON teachers;
CREATE POLICY "anon_all" ON teachers FOR ALL TO anon USING (true) WITH CHECK (true);
REVOKE SELECT (password) ON teachers FROM anon;
-- secure_login 함수(SECURITY DEFINER)는 내부적으로 password에 접근 가능

-- grades
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON grades;
CREATE POLICY "anon_all" ON grades FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- [참고] 향후 Supabase Auth 전환 시 적용할 역할 기반 RLS 예시
-- ============================================
-- CREATE POLICY "director_all" ON students
--   FOR ALL TO authenticated
--   USING ((auth.jwt() ->> 'role') = 'director');
--
-- CREATE POLICY "teacher_assigned" ON students
--   FOR SELECT TO authenticated
--   USING (
--     (auth.jwt() ->> 'role') = 'teacher' AND
--     id = ANY(
--       SELECT jsonb_array_elements_text(assigned_student_ids)
--       FROM teachers WHERE id::text = auth.uid()::text
--     )
--   );
--
-- CREATE POLICY "student_own" ON students
--   FOR SELECT TO authenticated
--   USING (
--     (auth.jwt() ->> 'role') = 'student' AND
--     id = (auth.jwt() ->> 'student_id')
--   );
-- ============================================

-- 8. 게시판 테이블
CREATE TABLE board_posts (
    id TEXT PRIMARY KEY,
    author TEXT DEFAULT '',
    author_role TEXT DEFAULT '',
    author_id TEXT DEFAULT '',
    scope TEXT DEFAULT 'all',
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 9. 학원 일정 테이블
CREATE TABLE board_events (
    id TEXT PRIMARY KEY,
    date TEXT DEFAULT '',
    scope TEXT DEFAULT 'all',
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    author TEXT DEFAULT '',
    author_role TEXT DEFAULT '',
    author_id TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON board_posts;
CREATE POLICY "anon_all" ON board_posts FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE board_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access" ON board_events;
CREATE POLICY "anon_all" ON board_events FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 기존 DB에 channel 컬럼 추가
-- (테이블이 이미 존재하는 경우 이 SQL만 실행)
-- ============================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'internal';
-- 기존 데이터 중 channel이 NULL인 행을 'internal'로 채움
UPDATE messages SET channel = 'internal' WHERE channel IS NULL;

-- ============================================
-- 마이그레이션: 출석 관리 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT DEFAULT '출석',  -- '출석' | '결석' | '지각' | '조퇴'
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON attendance;
CREATE POLICY "anon_all" ON attendance FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 숙제 관리 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS homework (
    id TEXT PRIMARY KEY,
    assigned_by TEXT DEFAULT '',
    assigned_by_id TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    due_date TEXT DEFAULT '',
    student_ids JSONB DEFAULT '[]',
    completed_by JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON homework;
CREATE POLICY "anon_all" ON homework FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 시험 플래너 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS exam_plans (
    id TEXT PRIMARY KEY,
    exam_name TEXT DEFAULT '',
    exam_date TEXT DEFAULT '',
    student_ids JSONB DEFAULT '[]',
    checklist JSONB DEFAULT '[]',
    assigned_by TEXT DEFAULT '',
    assigned_by_id TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE exam_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON exam_plans;
CREATE POLICY "anon_all" ON exam_plans FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 상담 일지 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    teacher_id TEXT DEFAULT '',
    teacher_name TEXT DEFAULT '',
    date TEXT NOT NULL,
    type TEXT DEFAULT '학생상담',
    content TEXT DEFAULT '',
    next_date TEXT DEFAULT '',
    next_memo TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON consultations;
CREATE POLICY "anon_all" ON consultations FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 수업료 관리 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS tuition (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    year_month TEXT NOT NULL,       -- 'YYYY-MM' 형식
    amount INTEGER DEFAULT 0,       -- 청구 금액
    paid_amount INTEGER DEFAULT 0,  -- 납부 금액
    status TEXT DEFAULT '미납',     -- '납부완료' | '미납' | '부분납부'
    paid_date TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE tuition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON tuition;
CREATE POLICY "anon_all" ON tuition FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================
-- 마이그레이션: 시간표 관리 테이블 추가
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
-- ============================================
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    day_of_week TEXT NOT NULL,      -- '월' | '화' | '수' | '목' | '금' | '토'
    start_time TEXT NOT NULL,       -- 'HH:MM'
    end_time TEXT NOT NULL,
    subject TEXT DEFAULT '',
    teacher_id TEXT DEFAULT '',
    teacher_name TEXT DEFAULT '',
    student_ids JSONB DEFAULT '[]',
    room TEXT DEFAULT '',
    color TEXT DEFAULT '#4F46E5',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON schedules;
CREATE POLICY "anon_all" ON schedules FOR ALL TO anon USING (true) WITH CHECK (true);
