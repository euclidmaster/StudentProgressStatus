# EM플러스 학원 학생 진도 관리 시스템 - 완전 구현 명세서

> **목적**: 이 문서는 현재 운영 중인 EM플러스 학원 학생 진도 관리 시스템을 **처음부터 완전히 재구현**할 수 있도록 작성된 **완전 구현 명세서**입니다. 모든 화면, 데이터 구조, 비즈니스 로직, 이벤트 처리, CSS 디자인 시스템을 빠짐없이 기술합니다.

---

## 목차
1. [시스템 개요](#1-시스템-개요)
2. [기술 스택 및 아키텍처](#2-기술-스택-및-아키텍처)
3. [파일 구조](#3-파일-구조)
4. [데이터베이스 스키마 (Supabase)](#4-데이터베이스-스키마-supabase)
5. [데이터 계층 (DataStore)](#5-데이터-계층-datastore)
6. [인증/권한 시스템](#6-인증권한-시스템)
7. [UI 레이아웃 구조 (HTML)](#7-ui-레이아웃-구조-html)
8. [화면별 상세 구현](#8-화면별-상세-구현)
9. [차트 시스템 (Charts)](#9-차트-시스템-charts)
10. [이벤트 처리 시스템](#10-이벤트-처리-시스템)
11. [CSS 디자인 시스템](#11-css-디자인-시스템)
12. [배포 설정](#12-배포-설정)

---

## 1. 시스템 개요

### 1.1 프로젝트 정보
- **프로젝트명**: EM플러스 학원 학생 진도 관리 시스템
- **버전**: 1.0
- **유형**: 단일 페이지 애플리케이션 (SPA)
- **대상 사용자**: 원장, 선생님, 학생 (3가지 역할)
- **목적**: 학원 내 학생들의 학습 계획, 진도, 성적, 코멘트를 종합 관리하고 내부 소통을 지원하는 대시보드

### 1.2 핵심 기능 요약
| 기능 영역 | 설명 |
|-----------|------|
| 대시보드 | 통계 카드 4개 + 차트 3개 + 최근 코멘트 + 학생별 진도 요약 테이블 |
| 학생 관리 | 학생 목록 (검색/필터), 학생 상세 (정보+차트+계획+성적+코멘트) |
| 학습 계획 | 학생/과목/상태별 필터링, 계획 CRUD, 진행률 표시 |
| 진도 현황 | 빠른 진도 입력 폼 + 최근 진도 기록 테이블 |
| 코멘트 | 학생/역할별 필터링, 코멘트 작성/삭제 |
| 성적 관리 | 3가지 보기 모드 (테이블/피벗/차트), 성적 입력 (중간·기말/모의고사) |
| 내부 소통 | 메시지 작성/고정/삭제, 읽음 확인 시스템 |
| 선생님 관리 | 원장 전용, 선생님 등록/삭제, 학생-선생님 매핑, 가입 승인 |

---

## 2. 기술 스택 및 아키텍처

### 2.1 프론트엔드
| 항목 | 상세 |
|------|------|
| **언어** | Vanilla JavaScript (ES6+) - 프레임워크 없음 |
| **HTML** | 단일 `index.html` 파일 |
| **CSS** | 단일 `css/style.css`, CSS 변수 기반 디자인 시스템 |
| **폰트** | Google Fonts - Noto Sans KR (300, 400, 500, 600, 700) |
| **아이콘** | Font Awesome 6.5.1 (CDN) |
| **차트** | Chart.js 4.4.1 (CDN) |

### 2.2 백엔드
| 항목 | 상세 |
|------|------|
| **BaaS** | Supabase (PostgreSQL) |
| **클라이언트** | @supabase/supabase-js v2 (CDN) |
| **인증** | 자체 구현 (teachers 테이블 기반 로그인) |
| **RLS** | 개발용 전체 허용 (`USING (true)`) |

### 2.3 아키텍처 패턴
```
[index.html] (단일 페이지)
    ↓ 로드 순서
[supabase-config.js] → Supabase 클라이언트 초기화
[data.js]            → DataStore 객체 (메모리 캐시 + Supabase CRUD)
[charts.js]          → Charts 객체 (Chart.js 래퍼)
[app.js]             → App 객체 (전체 UI 로직, 이벤트 처리)
```

**데이터 흐름**:
1. 앱 시작 → `DataStore.initFromSupabase()` → 모든 7개 테이블 데이터를 메모리 캐시로 로드
2. 읽기 작업: 메모리 캐시에서 직접 읽기 (빠른 응답)
3. 쓰기 작업: 메모리 캐시에 낙관적 업데이트 → Supabase에 동기화 → 실패 시 롤백

### 2.4 CDN 의존성
```html
<!-- Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<!-- Font Awesome 6.5.1 -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<!-- Chart.js 4.4.1 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<!-- Supabase JS v2 -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

---

## 3. 파일 구조

```
프로젝트 루트/
├── index.html                    # 메인 HTML (로그인/회원가입/앱 레이아웃/모달)
├── supabase-schema.sql           # DB 스키마 (Supabase SQL Editor에서 실행)
├── css/
│   └── style.css                 # 전체 스타일시트 (~1750줄)
├── images/
│   ├── logo.png                  # 로그인 화면 로고
│   └── logo1.png                 # 사이드바 로고
├── js/
│   ├── supabase-config.js        # Supabase URL + Anon Key 설정
│   ├── data.js                   # DataStore 객체 (데이터 CRUD)
│   ├── charts.js                 # Charts 래퍼 객체
│   └── app.js                    # App 객체 (메인 앱 로직)
└── .github/
    └── workflows/
        └── deploy.yml            # GitHub Pages 배포 워크플로우
```

---

## 4. 데이터베이스 스키마 (Supabase)

### 4.1 테이블 정의

> **명명 규칙**: DB는 `snake_case`, JS는 `camelCase`. DataStore가 자동 변환.
> **PK 생성**: `Date.now().toString(36) + Math.random().toString(36).substr(2, 9)`

#### 4.1.1 students (학생)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | 고유 ID |
| name | TEXT | NOT NULL, '' | 학생 이름 |
| school | TEXT | '' | 학교명 |
| grade | TEXT | '' | 학년 (중1~중3, 고1~고3) |
| class_name | TEXT | '' | 반 이름 |
| phone | TEXT | '' | 학생 연락처 |
| parent_phone | TEXT | '' | 학부모 연락처 |
| parent_name | TEXT | '' | 학부모 이름 |
| previous_grades | TEXT | '' | 이전 성적 (자유 텍스트) |
| notes | TEXT | '' | 특이사항 |
| status | TEXT | '' | 상태 (대기 등) |
| enroll_date | TEXT | '' | 등록일 |
| created_at | TIMESTAMPTZ | NOW() | 생성일시 |
| updated_at | TIMESTAMPTZ | NULL | 수정일시 |

#### 4.1.2 plans (학습 계획)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | 고유 ID |
| student_id | TEXT | NULL | 학생 ID (FK 개념) |
| subject | TEXT | '' | 과목명 |
| textbook | TEXT | '' | 교재명 |
| study_method | TEXT | '' | 학습 방법 |
| difficulty | TEXT | '' | 난이도 (상/중/하) |
| plan_type | TEXT | '' | 종류 (중간고사/기말고사/수능대비 등) |
| start_date | TEXT | '' | 시작일 |
| end_date | TEXT | '' | 종료일 |
| total_units | INTEGER | 0 | 총 단위 수 |
| unit_label | TEXT | '' | 단위 이름 (페이지/단원/문제/챕터/세트/지문) |
| completed_units | INTEGER | 0 | 완료 단위 수 |
| status | TEXT | 'active' | 상태 (active/completed/paused) |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

#### 4.1.3 progress (진도 기록)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | |
| plan_id | TEXT | NULL | 학습 계획 ID |
| student_id | TEXT | NULL | 학생 ID |
| date | TEXT | '' | 학습 날짜 |
| amount | INTEGER | 0 | 진행량 (단위 수) |
| note | TEXT | '' | 메모 |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

#### 4.1.4 comments (코멘트)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | |
| student_id | TEXT | NULL | 학생 ID |
| plan_id | TEXT | NULL | 관련 학습 계획 ID (nullable) |
| author | TEXT | '' | 작성자 이름 |
| author_role | TEXT | '' | 작성자 역할 (teacher/parent/student/admin) |
| content | TEXT | '' | 코멘트 내용 |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

#### 4.1.5 messages (내부 메시지)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | |
| author | TEXT | '' | 작성자 이름 |
| author_role | TEXT | '' | 역할 (director/teacher) |
| student_id | TEXT | NULL | 관련 학생 ID (null=전체 공지) |
| title | TEXT | '' | 제목 |
| content | TEXT | '' | 내용 |
| read_by | JSONB | '{}' | 읽음 기록 ({"이름": "ISO날짜"}) |
| pinned | BOOLEAN | FALSE | 고정 여부 |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

#### 4.1.6 teachers (사용자: 원장/선생님/학생 계정)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | |
| login_id | TEXT | UNIQUE | 로그인 아이디 |
| password | TEXT | '' | 비밀번호 (평문 저장 - 개발용) |
| name | TEXT | '' | 이름 |
| role | TEXT | '' | 역할 (director/teacher/student) |
| assigned_student_ids | JSONB | '[]' | 담당 학생 ID 배열 |
| student_id | TEXT | NULL | 학생 계정인 경우 학생 ID |
| approved | BOOLEAN | TRUE | 승인 여부 |
| reg_date | TEXT | '' | 가입일 |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

#### 4.1.7 grades (성적)
| 컬럼 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| id | TEXT | PK | |
| student_id | TEXT | NULL | 학생 ID |
| semester | TEXT | '' | 학기 (예: "2025-1학기") |
| exam_type | TEXT | '' | 시험 유형 (중간고사/기말고사/모의고사) |
| exam_date | TEXT | '' | 시험 날짜 |
| exam_name | TEXT | '' | 시험명 (모의고사용: "3월 모의고사") |
| total_rank | TEXT | '' | 전체 석차 (모의고사용) |
| subjects | JSONB | '[]' | 과목별 점수 배열 (아래 구조 참조) |
| total_avg | REAL | 0 | 전과목 평균 (자동 계산) |
| created_at | TIMESTAMPTZ | NOW() | |
| updated_at | TIMESTAMPTZ | NULL | |

**subjects JSONB 구조 (중간/기말)**:
```json
[
  { "name": "수학", "score": 95, "rank": "1", "totalStudents": "300" },
  { "name": "영어", "score": 88, "rank": "5", "totalStudents": "300" }
]
```

**subjects JSONB 구조 (모의고사)**:
```json
[
  { "name": "국어", "score": 95, "grade": "1", "percentile": "98", "rawScore": "92" },
  { "name": "수학", "score": 100, "grade": "1", "percentile": "99", "rawScore": "98" }
]
```

### 4.2 RLS 정책
```sql
-- 모든 테이블에 적용 (개발용 - 전체 허용)
ALTER TABLE [테이블명] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON [테이블명] FOR ALL USING (true) WITH CHECK (true);
```

---

## 5. 데이터 계층 (DataStore)

### 5.1 구조
`DataStore`는 전역 객체로 정의. 모든 데이터 접근을 중앙 관리.

```javascript
const DataStore = {
    TABLES: { STUDENTS: 'students', PLANS: 'plans', PROGRESS: 'progress', 
              COMMENTS: 'comments', MESSAGES: 'messages', TEACHERS: 'teachers', GRADES: 'grades' },
    CURRENT_USER_KEY: 'sps_current_user',
    _cache: { students: [], plans: [], progress: [], comments: [], messages: [], teachers: [], grades: [] },
    _syncEnabled: true,
    // ... 메서드들
};
```

### 5.2 핵심 유틸리티
| 메서드 | 설명 |
|--------|------|
| `_toSnake(str)` | camelCase → snake_case 변환 |
| `_toCamel(str)` | snake_case → camelCase 변환 |
| `_objToSnake(obj)` | 객체 키를 snake_case로 변환 |
| `_objToCamel(obj)` | 객체 키를 camelCase로 변환 |
| `generateId()` | `Date.now().toString(36) + Math.random().toString(36).substr(2, 9)` |

### 5.3 Supabase 초기화
```javascript
async initFromSupabase() {
    // 7개 테이블 병렬 로드: Promise.all(tableNames.map(table => supabaseClient.from(table).select('*')))
    // 각 결과를 _objToCamel()로 변환 후 _cache에 저장
    // 오류 시 콘솔 에러 + throw
}
```

### 5.4 Generic CRUD 패턴

#### `_add(table, item)` - 생성
1. `generateId()`로 ID 생성, `createdAt` 설정
2. 캐시 배열에 push
3. `_syncEnabled` 시 Supabase에 insert (snake_case 변환)
4. 실패 시 캐시에서 제거 후 throw

#### `_update(table, id, updates)` - 수정
1. 캐시에서 항목 찾기, 백업 생성
2. `updatedAt` 설정 후 병합
3. Supabase에 update
4. 실패 시 백업으로 복원 후 throw

#### `_delete(table, id)` - 삭제
1. 캐시에서 필터링, 삭제할 항목 보관
2. Supabase에서 delete
3. 실패 시 항목 복원 후 throw

### 5.5 도메인별 메서드

#### Students
| 메서드 | 동작 |
|--------|------|
| `getStudents()` | 전체 학생 목록 |
| `getStudent(id)` | ID로 학생 조회 |
| `addStudent(student)` | 학생 추가 |
| `updateStudent(id, updates)` | 학생 수정 |
| `deleteStudent(id)` | 학생 삭제 (관련 계획, 코멘트도 연쇄 삭제) |
| `searchStudents(query)` | 이름/학교/학년/반으로 검색 |
| `getUniqueGrades()` | 중복 없는 학년 목록 |
| `getUniqueClasses(grade?)` | 중복 없는 반 목록 (선택적 학년 필터) |

#### Plans
| 메서드 | 동작 |
|--------|------|
| `getPlans()` | 전체 계획 |
| `getPlan(id)` | ID로 조회 |
| `addPlan(plan)` | 추가 (completedUnits 기본값 0, status 기본값 'active') |
| `updatePlan(id, updates)` | 수정 |
| `deletePlan(id)` | 삭제 (관련 진도, 코멘트도 연쇄 삭제) |
| `getStudentPlans(studentId)` | 학생별 계획 |
| `getActivePlans()` | 진행 중인 계획만 |
| `getUniqueSubjects()` | 중복 없는 과목 목록 |

#### Progress
| 메서드 | 동작 |
|--------|------|
| `getProgressEntries()` | 전체 진도 기록 |
| `addProgressEntry(entry)` | 진도 추가 **+ 관련 계획의 completedUnits 자동 증가** (totalUnits까지 cap) |
| `getPlanProgress(planId)` | 계획별 진도 (날짜순 정렬) |
| `getStudentProgress(studentId)` | 학생별 진도 (최신순) |

#### Comments
| 메서드 | 동작 |
|--------|------|
| `getComments()` | 전체 코멘트 |
| `addComment(comment)` | 코멘트 추가 |
| `deleteComment(id)` | 코멘트 삭제 |
| `getStudentComments(studentId)` | 학생별 코멘트 (최신순) |
| `getPlanComments(planId)` | 계획별 코멘트 (최신순) |

#### Messages
| 메서드 | 동작 |
|--------|------|
| `getMessages()` | 전체 메시지 (최신순 정렬) |
| `getMessage(id)` | ID로 조회 |
| `addMessage(msg)` | 추가 (readBy={}, pinned=false 기본값) |
| `updateMessage(id, updates)` | 수정 |
| `deleteMessage(id)` | 삭제 |
| `toggleReadBy(messageId, reader)` | 읽음 토글 (읽음→미읽음, 미읽음→현재시간) |
| `getMessagesForFilter(authorRole, studentId)` | 필터링된 메시지 |
| `getUnreadCount(reader)` | 특정 사용자의 미읽음 수 |

#### Grades
| 메서드 | 동작 |
|--------|------|
| `getGrades()` | 전체 성적 |
| `getGrade(id)` | ID로 조회 |
| `addGrade(grade)` | 추가 (totalAvg 자동 계산) |
| `updateGrade(id, updates)` | 수정 (totalAvg 재계산) |
| `deleteGrade(id)` | 삭제 |
| `getStudentGrades(studentId)` | 학생별 성적 (학기→시험유형 순 정렬) |

**totalAvg 계산 로직**:
```javascript
const scores = subjects.filter(s => s.score != null && s.score !== '').map(s => Number(s.score));
totalAvg = scores.length > 0 ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length * 10) / 10 : 0;
```

#### Teachers/Users
| 메서드 | 동작 |
|--------|------|
| `getTeachers()` | 전체 사용자 |
| `getTeacher(id)` | ID로 조회 |
| `addTeacher(teacher)` | 사용자 추가 |
| `updateTeacher(id, updates)` | 사용자 수정 |
| `deleteTeacher(id)` | 사용자 삭제 |
| `getTeacherByLoginId(loginId)` | 로그인 ID로 조회 |
| `login(loginId, password)` | 로그인 (localStorage에 세션 저장) |
| `getPendingUsers()` | 승인 대기 사용자 목록 |
| `approveUser(id)` | 승인 (approved=true) |
| `rejectUser(id)` | 거절 (학생 계정이면 학생도 삭제) |
| `logout()` | localStorage에서 세션 삭제 |
| `getCurrentUser()` | localStorage에서 현재 사용자 조회 |
| `refreshCurrentUser()` | DB 최신 데이터로 세션 갱신 |
| `getAssignedStudents(teacherId)` | 선생님의 담당 학생 목록 |
| `getStudentTeachers(studentId)` | 학생의 담당 선생님 목록 |
| `assignStudentToTeacher(teacherId, studentId)` | 학생-선생님 매핑 추가 |
| `unassignStudentFromTeacher(teacherId, studentId)` | 학생-선생님 매핑 해제 |

#### Statistics
| 메서드 | 동작 |
|--------|------|
| `getStats()` | 전체 통계 (학생수, 계획수, 활성계획수, 완료계획수, 코멘트수, 평균진행률) |
| `getStudentSubjectProgress(studentId)` | 학생의 과목별 진행 상황 (교재별 진행률 포함) |

### 5.6 로그인 세션 관리
```javascript
// localStorage 키
CURRENT_USER_KEY = 'sps_current_user'

// 저장 형태
{
    id: "사용자ID",
    loginId: "로그인아이디",
    name: "이름",
    role: "director|teacher|student",
    assignedStudentIds: ["학생ID1", "학생ID2"],
    studentId: "학생ID"  // student 역할일 때만
}
```

---

## 6. 인증/권한 시스템

### 6.1 역할별 권한

| 기능 | director (원장) | teacher (선생님) | student (학생) |
|------|:---:|:---:|:---:|
| 대시보드 보기 | ✅ 전체 | ✅ 담당만 | ❌ 학생 상세로 이동 |
| 학생 관리 | ✅ 전체 | ✅ 담당만 | ❌ 숨김 |
| 학습 계획 | ✅ 전체 | ✅ 담당만 | ❌ 숨김 |
| 진도 현황 | ✅ 전체 | ✅ 담당만 | ❌ 숨김 |
| 코멘트 | ✅ 전체 | ✅ 담당만 | ❌ 숨김 |
| 성적 관리 | ✅ 전체 | ✅ 담당만 | ✅ 본인만 |
| 내부 소통 | ✅ | ✅ | ✅ |
| 선생님 관리 | ✅ | ❌ 숨김 | ❌ 숨김 |
| 가입 승인/거절 | ✅ | ❌ | ❌ |

### 6.2 데이터 가시성 제어

```javascript
// App.getVisibleStudents() - 역할 기반 학생 필터링
getVisibleStudents() {
    if (role === 'director') return DataStore.getStudents();     // 전체
    if (role === 'student')  return [DataStore.getStudent(currentUser.studentId)];  // 본인만
    // teacher: 담당 학생만
    return DataStore.getAssignedStudents(currentUser.id);
}
```

### 6.3 회원가입 프로세스
1. 역할 선택 (학생/선생님/원장)
2. 기본 정보 입력 (이름, 아이디, 비밀번호)
3. 학생인 경우: 학교/학년/반/연락처 추가 입력
4. 학생 계정: students 테이블에 학생 레코드 생성 + teachers 테이블에 계정 생성 (studentId 연결)
5. 모든 신규 계정은 `approved: false`로 생성
6. 원장이 선생님 관리 화면에서 승인/거절

### 6.4 로그인 프로세스
1. loginId + password로 teachers 테이블 조회
2. `approved === false`이면 "승인 대기 중" 메시지 표시
3. 성공 시 localStorage에 세션 저장, `showApp()` 호출
4. student 역할이면 자동으로 `student-detail` 화면으로 이동

### 6.5 사이드바 네비게이션 제어
```javascript
// 학생 역할: 숨기는 메뉴
const studentHiddenViews = ['plans', 'progress', 'comments', 'teachers'];

// 선생님 관리: 원장만 보임
nav-teachers.style.display = (role === 'director') ? '' : 'none';

// 원장 전용: 가입 대기 배지 표시
```

---

## 7. UI 레이아웃 구조 (HTML)

### 7.1 전체 구조
```
body
├── #loading-screen          (로딩 중 스피너)
├── #login-screen            (로그인/회원가입)
│   ├── .login-card          (로그인 폼)
│   └── .register-card       (회원가입 폼, 기본 숨김)
├── #app                     (메인 앱, 기본 숨김)
│   ├── #sidebar             (좌측 사이드바 250px)
│   │   ├── .sidebar-header  (로고)
│   │   └── .sidebar-nav     (네비게이션 링크)
│   ├── #sidebar-overlay     (모바일 오버레이)
│   └── #main-content        (메인 컨텐츠)
│       ├── #header          (상단 헤더: 토글+제목+검색+사용자정보+로그아웃)
│       └── #content-area    (동적 뷰 렌더링 영역)
└── #modal-overlay           (모달 오버레이)
    └── #modal               (모달: 헤더+바디)
```

### 7.2 사이드바 메뉴 항목
```
대시보드    (fas fa-chart-pie)     → dashboard
학생 관리   (fas fa-users)         → students
학습 계획   (fas fa-book-open)     → plans
진도 현황   (fas fa-chart-line)    → progress
코멘트      (fas fa-comments)      → comments
성적 관리   (fas fa-trophy)        → grades
선생님 관리 (fas fa-chalkboard-teacher) → teachers  [원장만]
내부 소통   (fas fa-envelope)      → messages  [미읽음 배지 포함]
```

### 7.3 로그인 화면 상세
- `.login-card`: 최대 420px 폭, 16px 라운드, 그림자
- 로고 이미지 (`images/logo.png`, 최대 280px)
- 부제: "학생 진도 관리 시스템"
- 아이디/비밀번호 입력 필드 + 로그인 버튼
- 하단 "계정이 없으신가요?" + 회원가입 링크

### 7.4 회원가입 화면 상세
- `.register-card`: 최대 460px 폭
- 역할 탭 (학생/선생님/원장) - `.role-tab` 3개 (flex 균등)
- 공통 필드: 이름, 아이디, 비밀번호, 비밀번호 확인
- 학생 전용 필드 (`#reg-student-fields`): 학교, 학년(select: 중1~고3), 반, 연락처
  - 학년 select 기본값: 고1
- 비밀번호 유효성: 4자 이상, 확인 일치
- 아이디 중복 체크
- 역할 탭 전환 시 학생 전용 필드 표시/숨김

---

## 8. 화면별 상세 구현

### 8.1 대시보드 (renderDashboard)

**선행 데이터 계산**:
- `getVisibleStudents()` → 사용자별 보이는 학생 목록
- `visibleIds` → 학생 ID 배열
- 모든 계획/코멘트를 `visibleIds`로 필터링
- 통계: totalStudents, activePlans, avgProgress, totalComments
- 최근 코멘트 5개 (최신순)

**레이아웃**:
```
[선생님 배너] (teacher인 경우만)
[통계 카드 4개]  ← stats-grid (4열 그리드)
[2열 그리드: 차트2개]
  ├── 학습 계획 현황 (도넛 차트)
  └── 학생 진도 분포 (막대 차트)
[2열 그리드: 차트+코멘트]
  ├── 과목별 평균 진행률 (가로 막대)
  └── 최근 코멘트 (activity-item 목록)
[학생별 진도 요약 테이블]
```

**통계 카드 4개**:
1. 학생 수 (`fas fa-user-graduate`, 파란색, `stat-icon blue`)
2. 진행 중인 학습 계획 (`fas fa-book-open`, 초록색)
3. 평균 진행률 % (`fas fa-chart-line`, 노란색)
4. 전체 코멘트 (`fas fa-comments`, 보라색)

**학생별 진도 요약 테이블**:
- 컬럼: 학생, 학교, 학년/반, 활성 계획, 평균 진행률, 진행바, 상세
- 진행바 색상: `getProgressColor(pct)` 함수 사용
  - ≥75%: green, ≥40%: default(primary), ≥20%: yellow, <20%: red
- "상세" 버튼 → `view-student` 액션

**차트 데이터 연결**:
```javascript
// 1. 도넛: 진행중/완료/일시중지 계획 수
Charts.createOverviewDoughnut('chart-overview', [activePlans.length, completedPlans.length, pausedPlans.length]);

// 2. 막대: 학생별 평균 진행률
Charts.createProgressDistribution('chart-distribution', labels, data);

// 3. 가로 막대: 과목별 평균 진행률
Charts.createSubjectBar('chart-subjects', subjectLabels, subjectData);
```

### 8.2 학생 목록 (renderStudents)

**필터/도구바**:
```
[학년 필터 select] [반 필터 select] [학생 수 표시]     [+ 학생 추가 버튼]
```

**학년 필터**: 전체 + `DataStore.getUniqueGrades()` 결과
**반 필터**: 전체 + `DataStore.getUniqueClasses(선택된 학년)` 결과

**테이블 컬럼**:
| 컬럼 | 내용 |
|------|------|
| 학생 | 이름 (클릭 시 상세) |
| 학교 | |
| 학년/반 | 학년 + 반 |
| 학습 계획 | 진행 중/전체 |
| 평균 진행률 | 진행바 + % |
| 관리 | 수정 버튼, 삭제 버튼 |

**이벤트**: `onchange` 이벤트로 학년/반 필터링, 검색창과 연동

### 8.3 학생 상세 (renderStudentDetail)

**구조**:
```
[← 뒤로가기]
[학생 헤더: 아바타 + 이름 + 메타정보 + 액션버튼]
[정보 카드 (info-grid)]
[2열 그리드: 과목별 레이더 + 과목별 진행바]
[학습 계획 카드 목록]
[성적 피벗 테이블]
[코멘트 목록 + 코멘트 작성 버튼]
```

**학생 아바타**: 이름 첫 글자, 72px 원형, `var(--primary-bg)` 배경
**메타정보**: 학교, 학년 반, 연락처, 학부모

**정보 카드 (info-grid)**:
| 항목 | 값 |
|------|-----|
| 학교 | `school` |
| 학년/반 | `grade` `className` |
| 연락처 | `phone` |
| 학부모 | `parentName` (`parentPhone`) |
| 등록일 | `enrollDate` |
| 특이사항 | `notes` |
| 이전 성적 | `previousGrades` (pre 태그, 줄바꿈 유지) |

**과목별 차트** (2열):
- 레이더 차트: 각 과목의 평균 진행률
- 과목별 진행바: 각 교재별 progress-bar + 완료/전체 단위

**학습 계획 목록**: plan-card 형태
- 헤더: 과목명 + 교재명 + 난이도 뱃지 + 상태 뱃지 + 수정/삭제 버튼
- 메타: 계획유형, 학습방법, 기간
- 진행바: completedUnits / totalUnits (단위라벨)

**성적 피벗 테이블**: 학생 상세 안에 간략한 성적 피벗을 보여줌
- 열: 학기+시험유형별
- 행: 과목별
- 셀: 점수 + 추세 화살표 (↑↓→)

**코멘트 목록**:
- 각 코멘트: 아바타(역할별 색상) + 이름 + 뱃지 + 날짜 + 내용
- 코멘트 아바타 색상: teacher=primary, parent=success, student=warning, admin=danger
- 관련 계획 참조 표시

### 8.4 학습 계획 (renderPlans)

**필터 바**:
```
[학생 필터] [과목 필터] [상태 필터 (전체/진행중/완료/일시중지)]     [+ 학습 계획 추가]
```

**계획 카드 목록**: 각 카드에는:
- 과목명 + 난이도 뱃지 + 상태 뱃지
- 학생 이름 (클릭 가능)
- 교재명, 학습방법, 계획유형, 기간
- 진행바 + % + 완료/전체 단위
- 수정/삭제 버튼

### 8.5 진도 현황 (renderProgress)

**빠른 진도 입력 폼**:
```
[학생 select] [학습 계획 select (학생에 따라 동적)] [날짜] [진행량 number] [메모 text] [기록 추가 버튼]
```

- 학생 선택 시 해당 학생의 활성 계획만 표시 (`filterProgressPlans()`)
- 기록 추가 시 `DataStore.addProgressEntry()` 호출 (계획의 completedUnits 자동 증가)

**최근 진도 기록 테이블**:
| 컬럼 | 내용 |
|------|------|
| 학생 | 이름 (클릭 가능) |
| 과목/교재 | 계획의 과목 - 교재명 |
| 날짜 | |
| 진행량 | amount + unitLabel |
| 메모 | |

### 8.6 코멘트 (renderComments)

**필터 바**:
```
[학생 필터] [역할 필터 (전체/선생님/학부모/학생)] [코멘트 수]     [+ 코멘트 추가]
```

**코멘트 목록**: comment-item 형태
- 아바타 (역할별 색상), 이름, 역할 뱃지, 날짜
- 코멘트 내용
- 관련 계획 참조 (있으면 표시)
- 삭제 버튼

### 8.7 성적 관리 (renderGrades)

**3가지 보기 모드** (tabs):
1. **테이블 보기** (`fas fa-table`, 기본)
2. **피벗 보기** (`fas fa-th`)
3. **차트 보기** (`fas fa-chart-line`)

**필터 바** (테이블/피벗 모드):
```
[학생 필터] [학기 필터] [시험유형 필터]     [+ 성적 입력]
```

#### 8.7.1 테이블 보기
**컬럼** (정렬 가능 `th.sortable`):
| 컬럼 | 정렬 | 내용 |
|------|:---:|------|
| 학생 | ✅ | 이름 (클릭 가능) |
| 학기 | ✅ | |
| 시험 유형 | ✅ | 중간고사/기말고사/모의고사 뱃지 |
| 시험 날짜 | ✅ | |
| 과목별 점수 | ❌ | subjects 배열 → 각 과목 뱃지 표시 |
| 평균 | ✅ | totalAvg + 등급 뱃지 |
| 관리 | ❌ | 수정/삭제 버튼 |

**정렬 로직**: `sortGradesTable(column)` - 클릭 시 오름/내림차순 토글
- 학생: 이름 문자정렬
- 학기/시험유형/시험날짜: 문자정렬
- 평균: 숫자정렬

**점수별 스타일링**:
```javascript
// 점수 색상
≥90: grade-score high (초록)
≥70: grade-score mid (기본)
<70:  grade-score low (빨강)

// 등급 뱃지 (100점 기준)
≥90: A (grade-A), ≥80: B (grade-B), ≥70: C (grade-C), ≥60: D (grade-D), <60: F (grade-F)
```

**모의고사 점수 표시**:
```
과목명 점수 [등급뱃지] (백분위%)
```
- 모의고사 등급 색상: 1~9등급 각각 다른 색상 (`mock-grade-1` ~ `mock-grade-9`)

#### 8.7.2 피벗 보기
```
행: 학생
열: 학기+시험유형 조합
셀: 평균 점수 + 추세 화살표
```

**추세 화살표 로직**:
```javascript
// 같은 학생의 이전 열 값과 비교
if (prevAvg !== null) {
    diff > 0 → '↑' (trend-up, 초록)
    diff < 0 → '↓' (trend-down, 빨강)
    diff === 0 → '→' (trend-flat, 회색)
}
```

#### 8.7.3 차트 보기
**학생 선택 필터**:
```
[학생 select]     [+ 성적 입력]
```

**차트**: 선택한 학생의 시험별 과목 점수 라인차트 + 평균 막대
- X축: 학기+시험유형 라벨
- Y축: 0~100
- datasets: 각 과목별 라인 + 평균 바
- `Charts.createAllStudentsSubject()` 사용

### 8.8 성적 입력 폼 (showGradeForm)

**두 가지 모드**: 중간/기말고사 vs 모의고사

**공통 필드**:
```
[학생 select] [학기 입력 (예: 2025-1학기)] [시험 유형 select]
```

**시험 유형에 따른 UI 전환**:
- 중간고사/기말고사: 시험 날짜
- 모의고사: 시험명 + 전체 시험 날짜 + 전체 석차

**과목 매트릭스** (동적 행 추가/삭제):

*중간/기말 매트릭스*:
```
[과목명] [점수] [석차] [전체인원] [삭제]
```
그리드: `1fr 80px 80px 100px 32px`

*모의고사 매트릭스*:
```
[과목명] [점수] [등급] [백분위] [원점수] [삭제]
```
그리드: `1fr 80px 70px 80px 80px 32px`

**기본 행**: 1개 빈 행 (수정 시 기존 데이터 채움)
**+ 행 추가** 버튼으로 동적 추가

### 8.9 학생 등록/수정 폼 (showStudentForm)

**모달 폼 필드**:
```
[이름*] [학교]           ← form-row (2열)
[학년 select] [반]       ← form-row (2열)
[학생 연락처] [학부모 연락처]  ← form-row
[학부모 이름]
[이전 성적 textarea]
[특이사항 textarea]
[취소] [저장]
```

학년 select 옵션: 중1, 중2, 중3, 고1(기본), 고2, 고3

### 8.10 학습 계획 등록/수정 폼 (showPlanForm)

**모달 폼 필드**:
```
[학생 select*] [과목명*]           ← form-row
[교재명*]
[학습 방법 textarea]
[난이도 select (상/중/하)]  [계획 유형 (중간고사/기말고사/수능대비/기타)]  ← form-row
[시작일] [종료일]                   ← form-row
[총 단위 수] [단위 이름 (페이지)] [현재 완료] ← form-row-3
[상태 select (진행 중/완료/일시중지)] ← 수정 시에만 표시
[취소] [저장]
```

### 8.11 코멘트 작성 폼 (showCommentForm)

**모달 폼 필드**:
```
[학생 select*]
[관련 학습 계획 select (선택사항)] ← 학생 선택 시 동적
[작성자 이름*] ← 현재 사용자 이름 자동 입력, readonly
[역할 select*] ← 현재 사용자 역할로 자동
[코멘트 내용* textarea]
[취소] [저장]
```

### 8.12 내부 소통 (renderMessages)

**필터 바**:
```
[작성자 역할 필터 (전체/원장/선생님)] [학생 필터 (전체/학생무관/학생목록)] [건수]     [새 메시지 작성]
```

**메시지 카드 구조** (`.msg-card`):
```
─── msg-card-header ───
[고정아이콘?] [작성자] [역할뱃지] [관련학생/전체] [날짜]  [고정/삭제 버튼]
─── msg-card-body (클릭→상세) ───
[제목]
[내용 미리보기 (120자)]
─── msg-card-footer ───
[확인: [이름 체크박스] [이름 체크박스] ...]
```

**고정 메시지**: 상단 별도 섹션으로 표시, `.msg-pinned` 클래스 (왼쪽 3px 노란 보더, 배경 #FFFBEB)

**읽음 확인 로직**:
- director 메시지: 확인자 = ['김선생', '박선생', '이선생'] (하드코딩 예시)
- teacher 메시지: 확인자 = ['원장']
- 체크박스 토글 → `DataStore.toggleReadBy(messageId, readerName)`

**메시지 상세** (모달): 전체 내용 + 확인 현황 (체크박스 + 시간)

### 8.13 메시지 작성 폼 (showMessageForm)

**모달 폼 필드**:
```
[작성자 (readonly)]  [역할 select (원장/선생님)]  ← form-row
[관련 학생 select (전체/학생목록)]
[제목*]
[내용* textarea]
[☐ 고정 메시지로 설정]
[취소] [전송]
```

### 8.14 선생님 관리 (renderTeachers) - 원장 전용

**구조**:
```
[가입 승인 대기 섹션] (대기 사용자 있을 때만)
[선생님별 담당 학생 관리]
  [선생님 카드 목록]
[전체 학생 담당 현황 테이블]
```

**가입 승인 대기 섹션**:
- 테이블: 이름, 아이디, 역할, 가입일, 승인/거절 버튼
- 주의 뱃지 (`.badge-warning`)

**선생님 카드** (`.teacher-card`):
- 헤더: 선생님 이름 + 로그인ID 뱃지 + "학생 지정" 버튼 + 삭제 버튼
- 바디: 담당 학생 태그 목록 (`.assigned-student-tag`) 또는 "담당 학생 없음"
- 각 학생 태그: 이름(클릭→상세) + 학년/반 + 해제(x) 버튼

**전체 학생 담당 현황 테이블**:
| 컬럼 | 내용 |
|------|------|
| 학생 | 이름 (클릭) |
| 학교 | |
| 학년/반 | |
| 담당 선생님 | 뱃지들 또는 "미지정" |
| 관리 | "지정" 버튼 |

### 8.15 선생님 등록/수정 폼 (showTeacherForm)

**모달 폼 필드**:
```
[이름*] [로그인 ID* (수정시 disabled)]  ← form-row
[비밀번호 (수정시 "변경시에만 입력")]
[취소] [등록/수정]
```

### 8.16 학생-선생님 매핑 모달

**1. 학생 기준 매핑** (`showTeacherAssignmentModal`):
```
"[학생이름] (학년 반)의 담당 선생님을 선택하세요."
[☐ 선생님A] [☐ 선생님B] ...  ← teacher-checkbox-list
[취소] [저장]
```

**2. 선생님 기준 매핑** (`showTeacherEditAssignment`):
```
"[선생님이름]의 담당 학생을 선택하세요."
[☐ 학생A (학년 반)] [☐ 학생B (학년 반)] ...
[취소] [저장]
```

---

## 9. 차트 시스템 (Charts)

### 9.1 구조
```javascript
const Charts = {
    instances: {},  // 차트 인스턴스 관리 (키: canvas ID)
    colors: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],
    // 메서드들...
};
```

### 9.2 인스턴스 관리
| 메서드 | 동작 |
|--------|------|
| `createChart(id, config)` | 기존 인스턴스 파괴 후 새 Chart 생성 |
| `destroyAll()` | 모든 인스턴스 파괴 (네비게이션 시 호출) |

### 9.3 차트 유형

#### 9.3.1 `createOverviewDoughnut(id, data)`
- **타입**: doughnut
- **데이터**: [진행중, 완료, 일시중지]
- **라벨**: ['진행 중', '완료', '일시중지']
- **색상**: [#4F46E5, #10B981, #F59E0B]
- **옵션**: cutout 65%, 범례 하단, 40% 패딩

#### 9.3.2 `createProgressDistribution(id, labels, data)`
- **타입**: bar
- **데이터**: 학생별 평균 진행률
- **색상**: 데이터 값에 따라 동적 (≥75: green, ≥40: primary, ≥20: yellow, <20: red)
- **옵션**: Y축 0~100, 범례 없음

#### 9.3.3 `createSubjectBar(id, labels, data)`
- **타입**: bar (horizontal - `indexAxis: 'y'`)
- **데이터**: 과목별 평균 진행률
- **색상**: colors 배열 순환
- **옵션**: X축 0~100, 범례 없음

#### 9.3.4 `createRadar(id, labels, data)`
- **타입**: radar
- **데이터**: 과목별 진행률 (학생 상세에서 사용)
- **색상**: primary 계열 (border: #4F46E5, background: rgba(79,70,229,0.1))
- **옵션**: 스케일 0~100, 범례 없음

#### 9.3.5 `createTimeline(id, labels, data)`
- **타입**: line
- **데이터**: 일별 누적 진행량
- **색상**: primary (#4F46E5)
- **옵션**: tension 0.3, fill, point 4px

#### 9.3.6 `createAllStudentsSubject(id, labels, datasets)`
- **타입**: line + bar 혼합
- **데이터**: 과목별 라인 + 평균 바
- **색상**: colors 배열 순환
- **옵션**: Y축 0~100, 범례 상단

---

## 10. 이벤트 처리 시스템

### 10.1 이벤트 위임 패턴
모든 `#content-area` 내의 클릭은 `handleContentClick(e)` 하나로 처리 (이벤트 위임).

```javascript
// data-action 속성으로 액션 식별
const target = e.target.closest('[data-action]');
const action = target?.dataset.action;
```

### 10.2 전체 액션 목록

| data-action | 추가 data 속성 | 동작 |
|-------------|---------------|------|
| `view-student` | `data-id` | 학생 상세로 이동 |
| `go-students` | - | 학생 목록으로 이동 |
| `add-student` | - | 학생 추가 모달 |
| `edit-student` | `data-id` | 학생 수정 모달 |
| `delete-student` | `data-id` | 학생 삭제 (confirm) |
| `add-plan` | - | 계획 추가 모달 |
| `edit-plan` | `data-plan-id` | 계획 수정 모달 |
| `delete-plan` | `data-plan-id` | 계획 삭제 (confirm) |
| `add-comment` | - | 코멘트 작성 모달 |
| `delete-comment` | `data-comment-id` | 코멘트 삭제 (confirm) |
| `add-grade` | - | 성적 입력 모달 |
| `edit-grade` | `data-grade-id` | 성적 수정 모달 |
| `delete-grade` | `data-grade-id` | 성적 삭제 (confirm) |
| `add-teacher` | - | 선생님 추가 모달 |
| `edit-teacher` | `data-teacher-id` | 선생님 수정 모달 |
| `delete-teacher` | `data-teacher-id` | 선생님 삭제 (confirm) |
| `add-message` | - | 메시지 작성 모달 |
| `pin-message` | `data-message-id` | 메시지 고정/해제 토글 |
| `delete-message` | `data-message-id` | 메시지 삭제 (confirm) |
| `view-message-detail` | `data-message-id` | 메시지 상세 모달 |
| `toggle-read` | `data-message-id`, `data-reader` | 읽음 토글 + 배지 갱신 |
| `approve-user` | `data-user-id` | 가입 승인 |
| `reject-user` | `data-user-id` | 가입 거절 (confirm) |
| `assign-teachers` | `data-student-id` | 학생 기준 선생님 매핑 모달 |
| `edit-teacher-assignment` | `data-teacher-id` | 선생님 기준 학생 매핑 모달 |
| `unassign-student` | `data-teacher-id`, `data-student-id` | 학생-선생님 매핑 해제 (confirm) |
| `grades-view-table` | - | 성적 테이블 모드 전환 |
| `grades-view-pivot` | - | 성적 피벗 모드 전환 |
| `grades-view-chart` | - | 성적 차트 모드 전환 |
| `sort-grades` | `data-column` | 성적 테이블 정렬 |
| `add-grade-row` | - | 성적 폼 과목 행 추가 |
| `remove-grade-row` | - | 성적 폼 과목 행 삭제 |

### 10.3 글로벌 이벤트 바인딩 (bindEvents)

| 요소 | 이벤트 | 동작 |
|------|--------|------|
| `.nav-item` (각각) | click | `navigate(view)` |
| `#sidebar-toggle` | click | 사이드바 토글 (모바일) |
| `#sidebar-overlay` | click | 사이드바 닫기 |
| `#btn-logout` | click | `handleLogout()` |
| `#global-search` | input | students 뷰일 때 `renderStudents(value)` |
| `.modal-close` | click | `closeModal()` |
| `#modal-overlay` | click (self) | `closeModal()` |
| `#content-area` | click | `handleContentClick(e)` |
| 모바일 nav-item | click | 사이드바 + 오버레이 닫기 |

### 10.4 동적 폼 내 이벤트
- 성적 폼의 시험유형 `onchange`: 중간/기말 ↔ 모의고사 UI 전환
- 진도 입력의 학생 `onchange`: 해당 학생의 계획만 계획 select에 표시
- 코멘트 폼의 학생 `onchange`: 해당 학생의 계획만 계획 select에 표시
- 메시지 필터 `onchange`: `filterMessages()` 호출

---

## 11. CSS 디자인 시스템

### 11.1 CSS 변수 (Design Tokens)

```css
:root {
    /* Primary */
    --primary: #4F46E5;
    --primary-light: #818CF8;
    --primary-dark: #3730A3;
    --primary-bg: #EEF2FF;

    /* Semantic */
    --success: #10B981;    --success-bg: #D1FAE5;
    --warning: #F59E0B;    --warning-bg: #FEF3C7;
    --danger: #EF4444;     --danger-bg: #FEE2E2;
    --info: #06B6D4;       --info-bg: #CFFAFE;
    --purple: #8B5CF6;     --purple-bg: #EDE9FE;
    --pink: #EC4899;

    /* Gray Scale */
    --gray-50: #F9FAFB;   --gray-100: #F3F4F6;
    --gray-200: #E5E7EB;  --gray-300: #D1D5DB;
    --gray-400: #9CA3AF;  --gray-500: #6B7280;
    --gray-600: #4B5563;  --gray-700: #374151;
    --gray-800: #1F2937;  --gray-900: #111827;

    /* Layout */
    --bg: #F0F2F5;
    --card-bg: #FFFFFF;
    --sidebar-bg: #1E1B4B;
    --sidebar-text: #C7D2FE;
    --sidebar-active: #4F46E5;

    /* Shadows */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);

    /* Layout */
    --radius: 12px;     --radius-sm: 8px;    --radius-lg: 16px;
    --transition: 0.2s ease;
}
```

### 11.2 기본 레이아웃
- `html { font-size: 14px; }`
- `body`: Noto Sans KR, `var(--bg)` 배경, `var(--gray-800)` 글자색, 행간 1.6
- `#app`: flex, min-height 100vh
- `#sidebar`: 250px 고정, `var(--sidebar-bg)` 배경, fixed position, z-index 100
- `#main-content`: flex: 1, margin-left: 250px
- `#header`: sticky top, z-index 50, 하단 그림자
- `#content-area`: padding 24px 28px

### 11.3 반응형 브레이크포인트

#### ≤1024px
```css
.grid-2, .grid-3 { grid-template-columns: 1fr; }
.stats-grid { grid-template-columns: repeat(2, 1fr); }
.form-row, .form-row-3 { grid-template-columns: 1fr; }
```

#### ≤768px
```css
#sidebar { transform: translateX(-250px); }  /* 기본 숨김 */
#sidebar.show { transform: translateX(0); z-index: 1001; }  /* 토글 시 표시 */
#main-content { margin-left: 0; }
#content-area { padding: 16px; }
.stats-grid { grid-template-columns: 1fr; }
.search-box input { width: 180px; }
.student-header { flex-direction: column; }
.modal { max-width: 95vw; margin: 10px; }
.toolbar { flex-direction: column; align-items: flex-start; }
```

### 11.4 인쇄 스타일
```css
@media print {
    #sidebar, #header, .btn, .toolbar { display: none !important; }
    #main-content { margin-left: 0 !important; }
    .card { box-shadow: none !important; border: 1px solid #ddd; }
}
```

### 11.5 주요 컴포넌트 스타일

#### 통계 카드 (`.stat-card`)
- flex, gap 18px, padding 22px 24px
- 아이콘: 52x52px, radius-sm
- hover: translateY(-2px) + shadow-md

#### 카드 (`.card`)
- radius 12px, shadow, overflow hidden
- header: 하단 보더, flex between
- body: padding 20px 24px

#### 버튼 시스템
- `.btn`: 기본 (padding 9px 18px, radius-sm)
- `.btn-primary`: primary 배경, 흰 글자
- `.btn-success/warning/danger`: 각 색상
- `.btn-outline`: 투명 + primary 보더
- `.btn-ghost`: 투명, gray-600 글자
- `.btn-sm`: padding 6px 12px
- `.btn-lg`: padding 12px 24px
- `.btn-icon`: 아이콘 전용 (8px padding, 원형 hover)

#### 테이블
- th: gray-50 배경, 0.82rem 대문자
- hover: gray-50 배경
- `.student-name`: primary 색, 커서 포인터

#### 뱃지 (`.badge`)
- 20px 라운드, 0.75rem, 600 weight
- 색상 변형: primary, success, warning, danger, info, purple, gray

#### 진행바
- 컨테이너: 10px 높이, gray-100 배경, 10px 라운드
- 바: gradient 배경, 0.5s width 트랜지션
- 색상: default(primary gradient), green, yellow, red

#### 모달
- 오버레이: blur(4px) 배경
- 모달: max-width 640px, radius-lg, shadow-lg
- 애니메이션: scale(0.95) + translateY(10px) → 정상

#### 토스트
- 우상단 고정, z-index 2000
- slideIn 0.3s, fadeOut 0.3s (2.7s 딜레이 후)
- success: green, error: red

#### 로그인 화면
- 배경: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- 카드: 16px 라운드, 40px 패딩, 60px 그림자

### 11.6 스크롤바
```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: var(--gray-300); border-radius: 3px; }
```

---

## 12. 배포 설정

### 12.1 GitHub Pages (GitHub Actions)

**워크플로우 파일**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [ master ]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: false
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 12.2 GitHub 설정
- **Repository → Settings → Pages → Source**: "GitHub Actions" 선택
- **Branch**: master

### 12.3 Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase-schema.sql` 실행
3. Settings → API에서 URL과 Anon Key 복사
4. `js/supabase-config.js`에 값 설정

---

## 부록 A: Supabase 설정 파일

```javascript
// js/supabase-config.js
const SUPABASE_URL = '여기에_Supabase_URL';
const SUPABASE_ANON_KEY = '여기에_Anon_Key';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

---

## 부록 B: 주요 유틸리티 함수

### escapeHtml(str)
```javascript
// DOM 기반 XSS 방지
const div = document.createElement('div');
div.textContent = str;
return div.innerHTML;
```

### formatDate(dateStr)
→ `YYYY.MM.DD` 형식

### formatDateTime(dateStr)
→ `YYYY.MM.DD HH:MM` 형식

### getProgressColor(pct)
```javascript
≥75 → 'green'
≥40 → '' (default primary)
≥20 → 'yellow'
<20 → 'red'
```

### getDifficultyBadge(d)
- 상 → badge-danger
- 중 → badge-warning
- 하 → badge-success

### getStatusBadge(s)
- active → badge-primary "진행 중"
- completed → badge-success "완료"
- paused → badge-gray "일시중지"

### getRoleBadge(role)
- teacher → badge-primary "선생님"
- parent → badge-success "학부모"
- student → badge-warning "학생"
- admin → badge-danger "관리자"

---

## 부록 C: 이미지 파일

| 파일 | 위치 | 용도 |
|------|------|------|
| `logo.png` | `/images/` | 로그인 화면 + 회원가입 화면 상단 로고 (최대 280px) |
| `logo1.png` | `/images/` | 사이드바 상단 로고 (최대 180px) |

---

## 부록 D: 네비게이션 라우팅

```javascript
navigate(view, data = {}) {
    // 1. currentView 설정
    // 2. 사이드바 active 클래스 토글
    // 3. page-title 텍스트 변경
    // 4. Charts.destroyAll()
    // 5. switch(view)로 렌더 함수 호출:
    //    dashboard → renderDashboard()
    //    students → renderStudents()
    //    student-detail → renderStudentDetail(data.studentId)
    //    plans → renderPlans()
    //    progress → renderProgress()
    //    comments → renderComments()
    //    grades → renderGrades()
    //    messages → renderMessages()
    //    teachers → renderTeachers()
}
```

**페이지 타이틀 매핑**:
```javascript
{
    dashboard: '대시보드',
    students: '학생 관리',
    'student-detail': '학생 상세',
    plans: '학습 계획',
    progress: '진도 현황',
    comments: '코멘트',
    grades: '성적 관리',
    messages: '내부 소통',
    teachers: '선생님 관리'
}
```

---

> **이 명세서의 모든 내용을 따라 구현하면, 현재 운영 중인 EM플러스 학원 학생 진도 관리 시스템과 동일한 앱을 재현할 수 있습니다.**
