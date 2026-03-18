// data.js - Student Progress Status 데이터 관리 모듈
// Supabase 서버 전용 저장

const DataStore = {
    TABLES: {
        STUDENTS: 'students',
        PLANS: 'plans',
        PROGRESS: 'progress',
        COMMENTS: 'comments',
        MESSAGES: 'messages',
        TEACHERS: 'teachers',
        GRADES: 'grades'
    },
    CURRENT_USER_KEY: 'sps_current_user',

    // 메모리 캐시 (Supabase에서 로드)
    _cache: {
        students: [],
        plans: [],
        progress: [],
        comments: [],
        messages: [],
        teachers: [],
        grades: []
    },

    _syncEnabled: true,

    // === camelCase <-> snake_case 변환 ===
    _toSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    },
    _toCamel(str) {
        return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    },
    _objToSnake(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[this._toSnake(key)] = value;
        }
        return result;
    },
    _objToCamel(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[this._toCamel(key)] = value;
        }
        return result;
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // === Supabase에서 전체 데이터 로드 ===
    async initFromSupabase() {
        if (typeof supabaseClient === 'undefined') {
            throw new Error('supabaseClient가 정의되지 않았습니다');
        }
        const tableNames = Object.values(this.TABLES);
        const results = await Promise.all(
            tableNames.map(table => supabaseClient.from(table).select('*'))
        );
        let hasError = false;
        tableNames.forEach((table, i) => {
            const { data, error } = results[i];
            if (error) {
                console.error(`[Supabase] ${table} 로드 오류:`, error);
                hasError = true;
                this._cache[table] = [];
            } else {
                this._cache[table] = (data || []).map(row => this._objToCamel(row));
                console.log(`[Supabase] ${table}: ${this._cache[table].length}건 로드`);
            }
        });
        if (hasError) {
            throw new Error('일부 테이블 로드 실패');
        }
    },

    // === Generic CRUD (메모리 캐시 + Supabase 서버 저장) ===
    _getAll(table) {
        return this._cache[table] || [];
    },

    _getById(table, id) {
        return this._getAll(table).find(item => item.id === id) || null;
    },

    _add(table, item) {
        item.id = this.generateId();
        item.createdAt = new Date().toISOString();
        this._cache[table].push(item);

        if (this._syncEnabled) {
            supabaseClient.from(table).insert(this._objToSnake(item)).then(({ error }) => {
                if (error) console.error(`[Supabase] ${table} 삽입 오류:`, error);
            });
        }
        return item;
    },

    _update(table, id, updates) {
        const items = this._cache[table];
        const idx = items.findIndex(item => item.id === id);
        if (idx === -1) return null;
        updates.updatedAt = new Date().toISOString();
        items[idx] = { ...items[idx], ...updates };

        if (this._syncEnabled) {
            supabaseClient.from(table).update(this._objToSnake(updates)).eq('id', id).then(({ error }) => {
                if (error) console.error(`[Supabase] ${table} 수정 오류:`, error);
            });
        }
        return items[idx];
    },

    _delete(table, id) {
        const items = this._cache[table];
        const filtered = items.filter(item => item.id !== id);
        const deleted = filtered.length < items.length;
        this._cache[table] = filtered;

        if (this._syncEnabled && deleted) {
            supabaseClient.from(table).delete().eq('id', id).then(({ error }) => {
                if (error) console.error(`[Supabase] ${table} 삭제 오류:`, error);
            });
        }
        return deleted;
    },

    // === STUDENTS ===
    getStudents() { return this._getAll(this.TABLES.STUDENTS); },
    getStudent(id) { return this._getById(this.TABLES.STUDENTS, id); },
    addStudent(student) { return this._add(this.TABLES.STUDENTS, student); },
    updateStudent(id, updates) { return this._update(this.TABLES.STUDENTS, id, updates); },
    deleteStudent(id) {
        this.getStudentPlans(id).forEach(p => this.deletePlan(p.id));
        this.getStudentComments(id).forEach(c => this._delete(this.TABLES.COMMENTS, c.id));
        return this._delete(this.TABLES.STUDENTS, id);
    },

    searchStudents(query) {
        if (!query) return this.getStudents();
        const q = query.toLowerCase();
        return this.getStudents().filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.school.toLowerCase().includes(q) ||
            s.grade.toLowerCase().includes(q) ||
            s.className.toLowerCase().includes(q)
        );
    },

    getUniqueGrades() {
        return [...new Set(this.getStudents().map(s => s.grade))].sort();
    },

    getUniqueClasses(grade) {
        const students = grade ? this.getStudents().filter(s => s.grade === grade) : this.getStudents();
        return [...new Set(students.map(s => s.className))].sort();
    },

    // === PLANS ===
    getPlans() { return this._getAll(this.TABLES.PLANS); },
    getPlan(id) { return this._getById(this.TABLES.PLANS, id); },
    addPlan(plan) {
        plan.completedUnits = plan.completedUnits || 0;
        plan.status = plan.status || 'active';
        return this._add(this.TABLES.PLANS, plan);
    },
    updatePlan(id, updates) { return this._update(this.TABLES.PLANS, id, updates); },
    deletePlan(id) {
        this.getPlanProgress(id).forEach(p => this._delete(this.TABLES.PROGRESS, p.id));
        this.getPlanComments(id).forEach(c => this._delete(this.TABLES.COMMENTS, c.id));
        return this._delete(this.TABLES.PLANS, id);
    },

    getStudentPlans(studentId) {
        return this.getPlans().filter(p => p.studentId === studentId);
    },

    getActivePlans() {
        return this.getPlans().filter(p => p.status === 'active');
    },

    getUniqueSubjects() {
        return [...new Set(this.getPlans().map(p => p.subject))].sort();
    },

    // === PROGRESS ENTRIES ===
    getProgressEntries() { return this._getAll(this.TABLES.PROGRESS); },

    addProgressEntry(entry) {
        const result = this._add(this.TABLES.PROGRESS, entry);
        if (entry.planId) {
            const plan = this.getPlan(entry.planId);
            if (plan) {
                const newCompleted = Math.min((plan.completedUnits || 0) + (entry.amount || 0), plan.totalUnits);
                this.updatePlan(entry.planId, { completedUnits: newCompleted });
            }
        }
        return result;
    },

    getPlanProgress(planId) {
        return this.getProgressEntries()
            .filter(p => p.planId === planId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    getStudentProgress(studentId) {
        return this.getProgressEntries()
            .filter(p => p.studentId === studentId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // === COMMENTS ===
    getComments() { return this._getAll(this.TABLES.COMMENTS); },
    addComment(comment) { return this._add(this.TABLES.COMMENTS, comment); },
    deleteComment(id) { return this._delete(this.TABLES.COMMENTS, id); },

    getStudentComments(studentId) {
        return this.getComments()
            .filter(c => c.studentId === studentId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getPlanComments(planId) {
        return this.getComments()
            .filter(c => c.planId === planId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    // === STATISTICS ===
    getStats() {
        const students = this.getStudents();
        const plans = this.getPlans();
        const activePlans = plans.filter(p => p.status === 'active');
        const completedPlans = plans.filter(p => p.status === 'completed');
        const comments = this.getComments();

        let avgProgress = 0;
        if (activePlans.length > 0) {
            const total = activePlans.reduce((sum, p) =>
                sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0);
            avgProgress = Math.round(total / activePlans.length);
        }

        return {
            totalStudents: students.length,
            totalPlans: plans.length,
            activePlans: activePlans.length,
            completedPlans: completedPlans.length,
            totalComments: comments.length,
            avgProgress
        };
    },

    getStudentSubjectProgress(studentId) {
        const plans = this.getStudentPlans(studentId).filter(p => p.status === 'active');
        const subjectProgress = {};

        plans.forEach(plan => {
            const progress = plan.totalUnits > 0 ? Math.round((plan.completedUnits / plan.totalUnits) * 100) : 0;
            if (!subjectProgress[plan.subject]) subjectProgress[plan.subject] = [];
            subjectProgress[plan.subject].push({
                planId: plan.id,
                textbook: plan.textbook,
                progress,
                completedUnits: plan.completedUnits,
                totalUnits: plan.totalUnits,
                unitLabel: plan.unitLabel
            });
        });

        return subjectProgress;
    },

    // === SAMPLE DATA ===
    async initSampleData() {
        if (this.getStudents().length > 0) return false;

        this._syncEnabled = false;

        const students = [
            { name: '김민준', school: '서울중학교', grade: '중2', className: 'A반', phone: '010-1234-5678', parentPhone: '010-9876-5432', parentName: '김철수', previousGrades: '1학기 중간: 수학85 영어78 국어90\n1학기 기말: 수학88 영어82 국어87', notes: '수학에 관심이 많음. 영어 독해 보완 필요.' },
            { name: '이서연', school: '강남중학교', grade: '중3', className: 'B반', phone: '010-2345-6789', parentPhone: '010-8765-4321', parentName: '이영희', previousGrades: '2학기 중간: 수학92 영어88 국어85 과학90\n2학기 기말: 수학95 영어91 국어88 과학93', notes: '전반적 우수. 심화 학습 필요.' },
            { name: '박지호', school: '해운대중학교', grade: '중1', className: 'A반', phone: '010-3456-7890', parentPhone: '010-7654-3210', parentName: '박민수', previousGrades: '진단평가: 수학70 영어65', notes: '기초 다지기 필요. 학습 습관 형성 중.' },
            { name: '최수아', school: '서울중학교', grade: '중2', className: 'A반', phone: '010-4567-8901', parentPhone: '010-6543-2109', parentName: '최정호', previousGrades: '1학기 중간: 수학75 영어82 국어78', notes: '영어 회화 우수. 수학 기초 보강 필요.' },
            { name: '정하은', school: '강남중학교', grade: '중3', className: 'B반', phone: '010-5678-9012', parentPhone: '010-5432-1098', parentName: '정미란', previousGrades: '2학기 중간: 수학88 영어92 국어90 과학85', notes: '고교 입시 대비 중. 전과목 고른 성적.' }
        ];

        const saved = students.map(s => this.addStudent(s));

        const plans = [
            { studentId: saved[0].id, subject: '수학', textbook: '개념원리 수학 2-1', studyMethod: '개념 학습 후 유형별 문제풀이', difficulty: '중', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 200, unitLabel: '페이지', completedUnits: 120, status: 'active' },
            { studentId: saved[0].id, subject: '영어', textbook: '능률 영어 중2', studyMethod: '단어 암기 + 독해 + 문법', difficulty: '중', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 15, unitLabel: '단원', completedUnits: 8, status: 'active' },
            { studentId: saved[0].id, subject: '국어', textbook: '비상 국어 2-1', studyMethod: '교과서 정독 + 문제풀이', difficulty: '하', planType: '중간고사', startDate: '2026-03-05', endDate: '2026-04-20', totalUnits: 12, unitLabel: '단원', completedUnits: 7, status: 'active' },
            { studentId: saved[1].id, subject: '수학', textbook: '쎈 수학 3-1', studyMethod: '심화 문제풀이 중심', difficulty: '상', planType: '기말고사', startDate: '2026-03-01', endDate: '2026-05-30', totalUnits: 300, unitLabel: '문제', completedUnits: 85, status: 'active' },
            { studentId: saved[1].id, subject: '영어', textbook: 'Grammar Zone 심화', studyMethod: '문법 심화 + 독해 분석', difficulty: '상', planType: '기말고사', startDate: '2026-03-01', endDate: '2026-05-30', totalUnits: 20, unitLabel: '챕터', completedUnits: 6, status: 'active' },
            { studentId: saved[1].id, subject: '과학', textbook: '오투 과학 3-1', studyMethod: '개념 정리 + 실험 보고서', difficulty: '중', planType: '기말고사', startDate: '2026-03-10', endDate: '2026-05-30', totalUnits: 18, unitLabel: '단원', completedUnits: 4, status: 'active' },
            { studentId: saved[2].id, subject: '수학', textbook: '기본 수학 1-1', studyMethod: '기초 개념 반복 학습', difficulty: '하', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 150, unitLabel: '페이지', completedUnits: 90, status: 'active' },
            { studentId: saved[2].id, subject: '영어', textbook: '기초 영어', studyMethod: '기본 단어 + 기초 문법', difficulty: '하', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 10, unitLabel: '단원', completedUnits: 5, status: 'active' },
            { studentId: saved[3].id, subject: '수학', textbook: '개념유형 수학 2-1', studyMethod: '기본 개념 + 유형 훈련', difficulty: '중', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 180, unitLabel: '페이지', completedUnits: 75, status: 'active' },
            { studentId: saved[3].id, subject: '영어', textbook: 'Reading Expert Lv.2', studyMethod: '독해 집중 + 어휘 확장', difficulty: '중', planType: '중간고사', startDate: '2026-03-01', endDate: '2026-04-20', totalUnits: 25, unitLabel: '지문', completedUnits: 15, status: 'active' },
            { studentId: saved[4].id, subject: '수학', textbook: '일품 수학 3-1', studyMethod: '고난도 문제풀이', difficulty: '상', planType: '기말고사', startDate: '2026-03-01', endDate: '2026-05-30', totalUnits: 250, unitLabel: '문제', completedUnits: 60, status: 'active' },
            { studentId: saved[4].id, subject: '영어', textbook: '수능특강 영어독해', studyMethod: '수능형 독해 연습', difficulty: '상', planType: '기말고사', startDate: '2026-03-01', endDate: '2026-05-30', totalUnits: 30, unitLabel: '세트', completedUnits: 8, status: 'active' },
            { studentId: saved[4].id, subject: '국어', textbook: '비상 국어 3-1 심화', studyMethod: '비문학 독해 + 문학 분석', difficulty: '중', planType: '기말고사', startDate: '2026-03-05', endDate: '2026-05-30', totalUnits: 16, unitLabel: '단원', completedUnits: 5, status: 'active' }
        ];

        const savedPlans = plans.map(p => this.addPlan(p));

        const comments = [
            { studentId: saved[0].id, planId: savedPlans[0].id, author: '김선생', authorRole: 'teacher', content: '수학 진도가 잘 나가고 있습니다. 중간고사 전에 마무리 가능합니다.' },
            { studentId: saved[0].id, planId: savedPlans[1].id, author: '김선생', authorRole: 'teacher', content: '영어 단어 암기 부분을 보강해주세요. 매일 20개씩 외우기 권장합니다.' },
            { studentId: saved[0].id, planId: null, author: '김철수', authorRole: 'parent', content: '자기주도 학습 시간을 늘리고 있습니다. 감사합니다.' },
            { studentId: saved[1].id, planId: savedPlans[3].id, author: '박선생', authorRole: 'teacher', content: '심화 문제에서 실수가 줄고 있어요. 좋은 추세입니다!' },
            { studentId: saved[1].id, planId: null, author: '이영희', authorRole: 'parent', content: '학원 수업에 만족합니다. 고교 대비도 잘 부탁드립니다.' },
            { studentId: saved[2].id, planId: savedPlans[6].id, author: '이선생', authorRole: 'teacher', content: '기초가 잡혀가고 있어요. 꾸준히 복습하면 금세 따라잡을 수 있습니다.' },
            { studentId: saved[3].id, planId: savedPlans[8].id, author: '김선생', authorRole: 'teacher', content: '수학 개념 이해도가 높아지고 있어요. 응용문제도 시도해봅시다.' },
            { studentId: saved[4].id, planId: savedPlans[10].id, author: '박선생', authorRole: 'teacher', content: '고난도 풀이 실력이 향상되었습니다. 이 속도 유지 바랍니다.' },
            { studentId: saved[0].id, planId: null, author: '김민준', authorRole: 'student', content: '수학 3단원이 좀 어려운데 추가 설명 부탁드려요.' },
            { studentId: saved[1].id, planId: savedPlans[4].id, author: '이서연', authorRole: 'student', content: '문법 파트는 이해했는데 독해가 아직 부족한 것 같아요.' }
        ];

        comments.forEach(c => this.addComment(c));

        const progressEntries = [
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-03', amount: 15, note: '1단원 개념 학습 완료' },
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-05', amount: 20, note: '1단원 문제풀이' },
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-08', amount: 25, note: '2단원 개념+문제' },
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-10', amount: 20, note: '2단원 마무리' },
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-12', amount: 20, note: '3단원 시작' },
            { planId: savedPlans[0].id, studentId: saved[0].id, date: '2026-03-15', amount: 20, note: '3단원 진행 중' },
            { planId: savedPlans[3].id, studentId: saved[1].id, date: '2026-03-03', amount: 15, note: '기본 유형 점검' },
            { planId: savedPlans[3].id, studentId: saved[1].id, date: '2026-03-07', amount: 20, note: '심화 유형1' },
            { planId: savedPlans[3].id, studentId: saved[1].id, date: '2026-03-10', amount: 25, note: '심화 유형2' },
            { planId: savedPlans[3].id, studentId: saved[1].id, date: '2026-03-14', amount: 25, note: '고난도 풀이' },
            { planId: savedPlans[6].id, studentId: saved[2].id, date: '2026-03-03', amount: 20, note: '1단원 시작' },
            { planId: savedPlans[6].id, studentId: saved[2].id, date: '2026-03-07', amount: 25, note: '1단원 복습' },
            { planId: savedPlans[6].id, studentId: saved[2].id, date: '2026-03-10', amount: 20, note: '2단원 시작' },
            { planId: savedPlans[6].id, studentId: saved[2].id, date: '2026-03-14', amount: 25, note: '2단원 진행' },
        ];

        progressEntries.forEach(e => this._add(this.TABLES.PROGRESS, e));

        this._syncEnabled = true;

        // Supabase에 배치 삽입
        const batchResults = await Promise.all([
            supabaseClient.from('students').insert(this._getAll('students').map(i => this._objToSnake(i))),
            supabaseClient.from('plans').insert(this._getAll('plans').map(i => this._objToSnake(i))),
            supabaseClient.from('comments').insert(this._getAll('comments').map(i => this._objToSnake(i))),
            supabaseClient.from('progress').insert(this._getAll('progress').map(i => this._objToSnake(i)))
        ]);
        batchResults.forEach(({ error }, idx) => {
            if (error) console.error(`[Supabase] 배치삽입 오류 (${['students','plans','comments','progress'][idx]}):`, error);
        });

        return true;
    },

    // === INTERNAL MESSAGES (원장 <-> 선생 소통) ===
    getMessages() {
        return this._getAll(this.TABLES.MESSAGES).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getMessage(id) { return this._getById(this.TABLES.MESSAGES, id); },

    addMessage(msg) {
        msg.readBy = msg.readBy || {};
        msg.pinned = msg.pinned || false;
        return this._add(this.TABLES.MESSAGES, msg);
    },

    updateMessage(id, updates) { return this._update(this.TABLES.MESSAGES, id, updates); },
    deleteMessage(id) { return this._delete(this.TABLES.MESSAGES, id); },

    toggleReadBy(messageId, reader) {
        const msg = this.getMessage(messageId);
        if (!msg) return null;
        const readBy = msg.readBy || {};
        if (readBy[reader]) {
            delete readBy[reader];
        } else {
            readBy[reader] = new Date().toISOString();
        }
        return this.updateMessage(messageId, { readBy });
    },

    getMessagesForFilter(authorRole, studentId) {
        let msgs = this.getMessages();
        if (authorRole) msgs = msgs.filter(m => m.authorRole === authorRole);
        if (studentId) msgs = msgs.filter(m => m.studentId === studentId);
        return msgs;
    },

    getUnreadCount(reader) {
        return this.getMessages().filter(m => !(m.readBy && m.readBy[reader])).length;
    },

    async initSampleMessages() {
        if (this.getMessages().length > 0) return;
        const students = this.getStudents();
        if (students.length === 0) return;

        this._syncEnabled = false;

        const msgs = [
            { author: '원장', authorRole: 'director', studentId: students[0].id, title: '김민준 수학 진도 확인 요청', content: '김민준 학생의 수학 진도가 예정보다 빠르게 진행되고 있습니다. 심화 문제를 추가로 배정해주세요. 중간고사 대비 모의고사도 한 번 치르면 좋겠습니다.', readBy: {}, pinned: true },
            { author: '김선생', authorRole: 'teacher', studentId: students[0].id, title: 'RE: 김민준 수학 진도 확인', content: '네, 확인했습니다. 이번 주부터 심화 유형 문제집을 추가 배정하겠습니다. 모의고사는 다음 주 수요일에 실시하겠습니다.', readBy: { '원장': '2026-03-16T10:30:00.000Z' }, pinned: false },
            { author: '원장', authorRole: 'director', studentId: students[2].id, title: '박지호 기초 보강 방안 논의', content: '박지호 학생의 기초 실력이 아직 부족합니다. 방과후 추가 보충 수업을 편성할 수 있을까요? 학부모님도 요청하셨습니다.', readBy: {}, pinned: false },
            { author: '이선생', authorRole: 'teacher', studentId: students[2].id, title: 'RE: 박지호 기초 보강 방안', content: '매주 화/목 4시에 30분씩 추가 보충 가능합니다. 현재 기초 연산과 기본 문법 위주로 진행하고 있으며, 서서히 나아지고 있습니다.', readBy: { '원장': '2026-03-17T09:00:00.000Z' }, pinned: false },
            { author: '원장', authorRole: 'director', studentId: null, title: '이번 달 전체 학습 방향 안내', content: '중간고사가 4월 20일 시작입니다. 모든 선생님들은 3월 말까지 각 학생별 시험 범위 학습이 80% 이상 완료될 수 있도록 계획을 점검해주세요. 진도가 느린 학생은 별도 보고 부탁드립니다.', readBy: { '김선생': '2026-03-16T14:00:00.000Z' }, pinned: true },
            { author: '박선생', authorRole: 'teacher', studentId: students[1].id, title: '이서연 심화 학습 보고', content: '이서연 학생은 현재 심화 과정을 잘 소화하고 있으며, 수학 오답률이 15%에서 8%로 줄었습니다. 다만 영어 독해 속도가 다소 느려 추가 연습이 필요합니다.', readBy: {}, pinned: false },
            { author: '원장', authorRole: 'director', studentId: students[3].id, title: '최수아 학부모 상담 결과 공유', content: '최수아 학부모님과 전화 상담을 했습니다. 수학 성적 향상에 만족하고 계시나, 영어 독해 부분을 좀 더 신경 써달라는 요청이 있었습니다. 참고해주세요.', readBy: { '김선생': '2026-03-17T11:00:00.000Z' }, pinned: false }
        ];

        msgs.forEach(m => this.addMessage(m));

        this._syncEnabled = true;

        const { error } = await supabaseClient.from('messages').insert(this._getAll('messages').map(i => this._objToSnake(i)));
        if (error) console.error('[Supabase] messages 배치삽입 오류:', error);
    },

    // === GRADES (성적) ===
    getGrades() { return this._getAll(this.TABLES.GRADES); },
    getGrade(id) { return this._getById(this.TABLES.GRADES, id); },
    addGrade(grade) {
        if (grade.subjects && grade.subjects.length > 0) {
            const scores = grade.subjects.filter(s => s.score != null && s.score !== '').map(s => Number(s.score));
            grade.totalAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
        }
        return this._add(this.TABLES.GRADES, grade);
    },
    updateGrade(id, updates) {
        if (updates.subjects && updates.subjects.length > 0) {
            const scores = updates.subjects.filter(s => s.score != null && s.score !== '').map(s => Number(s.score));
            updates.totalAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
        }
        return this._update(this.TABLES.GRADES, id, updates);
    },
    deleteGrade(id) { return this._delete(this.TABLES.GRADES, id); },

    getStudentGrades(studentId) {
        return this.getGrades()
            .filter(g => g.studentId === studentId)
            .sort((a, b) => {
                const typeOrder = { '중간고사': 0, '기말고사': 1, '모의고사': 2 };
                const semA = a.semester || ''; const semB = b.semester || '';
                if (semA !== semB) return semA.localeCompare(semB);
                if ((typeOrder[a.examType] || 9) !== (typeOrder[b.examType] || 9))
                    return (typeOrder[a.examType] || 9) - (typeOrder[b.examType] || 9);
                return (a.examDate || '').localeCompare(b.examDate || '');
            });
    },

    async initSampleGrades() {
        if (this.getGrades().length > 0) return;
        const students = this.getStudents();
        if (students.length === 0) return;

        this._syncEnabled = false;

        const gradeData = [
            { studentId: students[0].id, semester: '1학기', examType: '중간고사', examDate: '2025-04-20', totalRank: '15/180',
              subjects: [
                { subject: '수학', score: 85, grade: 'B+', rank: '12/180' },
                { subject: '영어', score: 78, grade: 'C+', rank: '35/180' },
                { subject: '국어', score: 90, grade: 'A', rank: '8/180' }
              ] },
            { studentId: students[0].id, semester: '1학기', examType: '기말고사', examDate: '2025-07-10', totalRank: '12/180',
              subjects: [
                { subject: '수학', score: 88, grade: 'B+', rank: '10/180' },
                { subject: '영어', score: 82, grade: 'B', rank: '28/180' },
                { subject: '국어', score: 87, grade: 'B+', rank: '12/180' }
              ] },
            { studentId: students[0].id, semester: '', examType: '모의고사', examDate: '2025-06-05', examName: '6월 모의고사', totalRank: '',
              subjects: [
                { subject: '국어', score: 92, grade: '2', standardScore: 131, percentile: 94 },
                { subject: '수학', score: 88, grade: '2', standardScore: 137, percentile: 93 },
                { subject: '영어', score: 85, grade: '2', standardScore: 0, percentile: 0 }
              ] },
            { studentId: students[1].id, semester: '2학기', examType: '중간고사', examDate: '2025-10-15', totalRank: '3/200',
              subjects: [
                { subject: '수학', score: 92, grade: 'A', rank: '5/200' },
                { subject: '영어', score: 88, grade: 'B+', rank: '10/200' },
                { subject: '국어', score: 85, grade: 'B+', rank: '15/200' },
                { subject: '과학', score: 90, grade: 'A', rank: '6/200' }
              ] },
            { studentId: students[1].id, semester: '2학기', examType: '기말고사', examDate: '2025-12-18', totalRank: '2/200',
              subjects: [
                { subject: '수학', score: 95, grade: 'A+', rank: '2/200' },
                { subject: '영어', score: 91, grade: 'A', rank: '7/200' },
                { subject: '국어', score: 88, grade: 'B+', rank: '12/200' },
                { subject: '과학', score: 93, grade: 'A', rank: '4/200' }
              ] },
            { studentId: students[1].id, semester: '', examType: '모의고사', examDate: '2025-09-03', examName: '9월 모의고사', totalRank: '',
              subjects: [
                { subject: '국어', score: 95, grade: '1', standardScore: 139, percentile: 97 },
                { subject: '수학', score: 100, grade: '1', standardScore: 145, percentile: 99 },
                { subject: '영어', score: 90, grade: '1', standardScore: 0, percentile: 0 }
              ] },
            { studentId: students[2].id, semester: '1학기', examType: '중간고사', examDate: '2025-04-20', totalRank: '45/160',
              subjects: [
                { subject: '수학', score: 70, grade: 'C', rank: '50/160' },
                { subject: '영어', score: 65, grade: 'D+', rank: '60/160' }
              ] },
            { studentId: students[3].id, semester: '1학기', examType: '중간고사', examDate: '2025-04-20', totalRank: '25/180',
              subjects: [
                { subject: '수학', score: 75, grade: 'C+', rank: '30/180' },
                { subject: '영어', score: 82, grade: 'B', rank: '22/180' },
                { subject: '국어', score: 78, grade: 'C+', rank: '28/180' }
              ] },
            { studentId: students[4].id, semester: '2학기', examType: '중간고사', examDate: '2025-10-15', totalRank: '5/200',
              subjects: [
                { subject: '수학', score: 88, grade: 'B+', rank: '8/200' },
                { subject: '영어', score: 92, grade: 'A', rank: '5/200' },
                { subject: '국어', score: 90, grade: 'A', rank: '7/200' },
                { subject: '과학', score: 85, grade: 'B+', rank: '12/200' }
              ] }
        ];

        gradeData.forEach(g => this.addGrade(g));

        this._syncEnabled = true;

        const { error } = await supabaseClient.from('grades').insert(this._getAll('grades').map(i => this._objToSnake(i)));
        if (error) console.error('[Supabase] grades 배치삽입 오류:', error);
    },

    // === TEACHERS / USERS ===
    getTeachers() { return this._getAll(this.TABLES.TEACHERS); },
    getTeacher(id) { return this._getById(this.TABLES.TEACHERS, id); },
    addTeacher(teacher) { return this._add(this.TABLES.TEACHERS, teacher); },
    updateTeacher(id, updates) { return this._update(this.TABLES.TEACHERS, id, updates); },

    getTeacherByLoginId(loginId) {
        return this.getTeachers().find(t => t.loginId === loginId) || null;
    },

    login(loginId, password) {
        const user = this.getTeachers().find(t => t.loginId === loginId && t.password === password);
        if (!user) return null;
        if (user.approved === false) return { rejected: false, pending: true };
        const sessionUser = { id: user.id, loginId: user.loginId, name: user.name, role: user.role, assignedStudentIds: user.assignedStudentIds || [] };
        if (user.studentId) sessionUser.studentId = user.studentId;
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(sessionUser));
        return sessionUser;
    },

    getPendingUsers() {
        return this.getTeachers().filter(t => t.approved === false);
    },

    approveUser(id) {
        return this.updateTeacher(id, { approved: true });
    },

    rejectUser(id) {
        const user = this.getTeacher(id);
        if (user && user.studentId) {
            this.deleteStudent(user.studentId);
        }
        return this._delete(this.TABLES.TEACHERS, id);
    },

    logout() {
        localStorage.removeItem(this.CURRENT_USER_KEY);
    },

    getCurrentUser() {
        try {
            const data = localStorage.getItem(this.CURRENT_USER_KEY);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    },

    refreshCurrentUser() {
        const cu = this.getCurrentUser();
        if (!cu) return null;
        const teacher = this.getTeacher(cu.id);
        if (!teacher) { this.logout(); return null; }
        const sessionUser = { id: teacher.id, loginId: teacher.loginId, name: teacher.name, role: teacher.role, assignedStudentIds: teacher.assignedStudentIds || [] };
        if (teacher.studentId) sessionUser.studentId = teacher.studentId;
        localStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(sessionUser));
        return sessionUser;
    },

    getAssignedStudents(teacherId) {
        const teacher = this.getTeacher(teacherId);
        if (!teacher || !teacher.assignedStudentIds) return [];
        return teacher.assignedStudentIds.map(sid => this.getStudent(sid)).filter(Boolean);
    },

    getStudentTeachers(studentId) {
        return this.getTeachers().filter(t => t.role === 'teacher' && (t.assignedStudentIds || []).includes(studentId));
    },

    assignStudentToTeacher(teacherId, studentId) {
        const teacher = this.getTeacher(teacherId);
        if (!teacher) return;
        const ids = teacher.assignedStudentIds || [];
        if (!ids.includes(studentId)) {
            ids.push(studentId);
            this.updateTeacher(teacherId, { assignedStudentIds: ids });
        }
    },

    unassignStudentFromTeacher(teacherId, studentId) {
        const teacher = this.getTeacher(teacherId);
        if (!teacher) return;
        const ids = (teacher.assignedStudentIds || []).filter(id => id !== studentId);
        this.updateTeacher(teacherId, { assignedStudentIds: ids });
    },

    deleteTeacher(id) { return this._delete(this.TABLES.TEACHERS, id); },

    async initSampleTeachers() {
        if (this.getTeachers().length > 0) return;
        const students = this.getStudents();
        if (students.length === 0) return;

        this._syncEnabled = false;

        const teachers = [
            { loginId: 'director', password: '1234', name: '원장', role: 'director', assignedStudentIds: students.map(s => s.id) },
            { loginId: 'kimteacher', password: '1234', name: '김선생', role: 'teacher', assignedStudentIds: [students[0].id, students[2].id, students[3].id] },
            { loginId: 'parkteacher', password: '1234', name: '박선생', role: 'teacher', assignedStudentIds: [students[1].id, students[2].id, students[4].id] },
            { loginId: 'leeteacher', password: '1234', name: '이선생', role: 'teacher', assignedStudentIds: [students[2].id, students[4].id] }
        ];

        teachers.forEach(t => this.addTeacher(t));

        this._syncEnabled = true;

        const { error } = await supabaseClient.from('teachers').insert(this._getAll('teachers').map(i => this._objToSnake(i)));
        if (error) console.error('[Supabase] teachers 배치삽입 오류:', error);
    },

    async clearAll() {
        // 캐시 초기화
        Object.values(this.TABLES).forEach(table => { this._cache[table] = []; });
        localStorage.removeItem(this.CURRENT_USER_KEY);

        // Supabase 테이블 전체 삭제
        await Promise.all(Object.values(this.TABLES).map(table =>
            supabaseClient.from(table).delete().not('id', 'is', null)
        ));
    }
};
