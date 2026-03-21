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
-- RLS (Row Level Security) 정책
-- 개발용: 모든 접근 허용
-- ⚠️ 프로덕션 환경에서는 적절한 RLS 정책을 설정하세요.
-- ============================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON students FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON plans FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON progress FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON comments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON messages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON teachers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON grades FOR ALL USING (true) WITH CHECK (true);
