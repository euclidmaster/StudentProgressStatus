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

    async _add(table, item) {
        item.id = this.generateId();
        item.createdAt = new Date().toISOString();
        this._cache[table].push(item);

        if (this._syncEnabled) {
            try {
                const { error } = await supabaseClient.from(table).insert(this._objToSnake(item));
                if (error) {
                    console.error(`[Supabase] ${table} 삽입 오류:`, error);
                    this._cache[table] = this._cache[table].filter(i => i.id !== item.id);
                    throw new Error(error.message);
                }
            } catch (err) {
                if (err.message && !err.message.includes('삽입')) {
                    console.error(`[Supabase] ${table} 네트워크 오류:`, err);
                    this._cache[table] = this._cache[table].filter(i => i.id !== item.id);
                }
                throw err;
            }
        }
        return item;
    },

    async _update(table, id, updates) {
        const items = this._cache[table];
        const idx = items.findIndex(item => item.id === id);
        if (idx === -1) return null;
        const backup = { ...items[idx] };
        updates.updatedAt = new Date().toISOString();
        items[idx] = { ...items[idx], ...updates };

        if (this._syncEnabled) {
            try {
                const { error } = await supabaseClient.from(table).update(this._objToSnake(updates)).eq('id', id);
                if (error) {
                    console.error(`[Supabase] ${table} 수정 오류:`, error);
                    items[idx] = backup;
                    throw new Error(error.message);
                }
            } catch (err) {
                if (err.message && !err.message.includes('수정')) {
                    console.error(`[Supabase] ${table} 네트워크 오류:`, err);
                    items[idx] = backup;
                }
                throw err;
            }
        }
        return items[idx];
    },

    async _delete(table, id) {
        const items = this._cache[table];
        const filtered = items.filter(item => item.id !== id);
        const deletedItem = items.find(item => item.id === id);
        const deleted = filtered.length < items.length;
        this._cache[table] = filtered;

        if (this._syncEnabled && deleted) {
            try {
                const { error } = await supabaseClient.from(table).delete().eq('id', id);
                if (error) {
                    console.error(`[Supabase] ${table} 삭제 오류:`, error);
                    if (deletedItem) this._cache[table].push(deletedItem);
                    throw new Error(error.message);
                }
            } catch (err) {
                if (err.message && !err.message.includes('삭제')) {
                    console.error(`[Supabase] ${table} 네트워크 오류:`, err);
                    if (deletedItem) this._cache[table].push(deletedItem);
                }
                throw err;
            }
        }
        return deleted;
    },

    // === STUDENTS ===
    getStudents() { return this._getAll(this.TABLES.STUDENTS); },
    getStudent(id) { return this._getById(this.TABLES.STUDENTS, id); },
    async addStudent(student) { return await this._add(this.TABLES.STUDENTS, student); },
    async updateStudent(id, updates) { return await this._update(this.TABLES.STUDENTS, id, updates); },
    async deleteStudent(id) {
        for (const p of this.getStudentPlans(id)) await this.deletePlan(p.id);
        for (const c of this.getStudentComments(id)) await this._delete(this.TABLES.COMMENTS, c.id);
        return await this._delete(this.TABLES.STUDENTS, id);
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
    async addPlan(plan) {
        plan.completedUnits = plan.completedUnits || 0;
        plan.status = plan.status || 'active';
        return await this._add(this.TABLES.PLANS, plan);
    },
    async updatePlan(id, updates) { return await this._update(this.TABLES.PLANS, id, updates); },
    async deletePlan(id) {
        for (const p of this.getPlanProgress(id)) await this._delete(this.TABLES.PROGRESS, p.id);
        for (const c of this.getPlanComments(id)) await this._delete(this.TABLES.COMMENTS, c.id);
        return await this._delete(this.TABLES.PLANS, id);
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

    async addProgressEntry(entry) {
        const result = await this._add(this.TABLES.PROGRESS, entry);
        if (entry.planId) {
            const plan = this.getPlan(entry.planId);
            if (plan) {
                const newCompleted = Math.min((plan.completedUnits || 0) + (entry.amount || 0), plan.totalUnits);
                await this.updatePlan(entry.planId, { completedUnits: newCompleted });
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
    async addComment(comment) { return await this._add(this.TABLES.COMMENTS, comment); },
    async deleteComment(id) { return await this._delete(this.TABLES.COMMENTS, id); },

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

    // === INTERNAL MESSAGES (원장 <-> 선생 소통) ===

        this._syncEnabled = false;

        const students = [
            { name: '김민준', school: '서울중학교', grade: '중2', className: 'A반', phone: '010-1234-5678', parentPhone: '010-9876-5432', parentName: '김철수', previousGrades: '1학기 중간: 수학85 영어78 국어90\n1학기 기말: 수학88 영어82 국어87', notes: '수학에 관심이 많음. 영어 독해 보완 필요.' },
            { name: '이서연', school: '강남중학교', grade: '중3', className: 'B반', phone: '010-2345-6789', parentPhone: '010-8765-4321', parentName: '이영희', previousGrades: '2학기 중간: 수학92 영어88 국어85 과학90\n2학기 기말: 수학95 영어91 국어88 과학93', notes: '전반적 우수. 심화 학습 필요.' },
            { name: '박지호', school: '해운대중학교', grade: '중1', className: 'A반', phone: '010-3456-7890', parentPhone: '010-7654-3210', parentName: '박민수', previousGrades: '진단평가: 수학70 영어65', notes: '기초 다지기 필요. 학습 습관 형성 중.' },
            { name: '최수아', school: '서울중학교', grade: '중2', className: 'A반', phone: '010-4567-8901', parentPhone: '010-6543-2109', parentName: '최정호', previousGrades: '1학기 중간: 수학75 영어82 국어78', notes: '영어 회화 우수. 수학 기초 보강 필요.' },
            { name: '정하은', school: '강남중학교', grade: '중3', className: 'B반', phone: '010-5678-9012', parentPhone: '010-5432-1098', parentName: '정미란', previousGrades: '2학기 중간: 수학88 영어92 국어90 과학85', notes: '고교 입시 대비 중. 전과목 고른 성적.' }
        ];

        const saved = [];
        for (const s of students) saved.push(await this.addStudent(s));

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

        const savedPlans = [];
        for (const p of plans) savedPlans.push(await this.addPlan(p));

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

        for (const c of comments) await this.addComment(c);

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

        for (const e of progressEntries) await this._add(this.TABLES.PROGRESS, e);

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

    getMessages() {
        return this._getAll(this.TABLES.MESSAGES).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getMessage(id) { return this._getById(this.TABLES.MESSAGES, id); },

    async addMessage(msg) {
        msg.readBy = msg.readBy || {};
        msg.pinned = msg.pinned || false;
        return await this._add(this.TABLES.MESSAGES, msg);
    },

    async updateMessage(id, updates) { return await this._update(this.TABLES.MESSAGES, id, updates); },
    async deleteMessage(id) { return await this._delete(this.TABLES.MESSAGES, id); },

    async toggleReadBy(messageId, reader) {
        const msg = this.getMessage(messageId);
        if (!msg) return null;
        const readBy = msg.readBy || {};
        if (readBy[reader]) {
            delete readBy[reader];
        } else {
            readBy[reader] = new Date().toISOString();
        }
        return await this.updateMessage(messageId, { readBy });
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

    // === GRADES (성적) ===
    getGrades() { return this._getAll(this.TABLES.GRADES); },
    getGrade(id) { return this._getById(this.TABLES.GRADES, id); },
    async addGrade(grade) {
        if (grade.subjects && grade.subjects.length > 0) {
            const scores = grade.subjects.filter(s => s.score != null && s.score !== '').map(s => Number(s.score));
            grade.totalAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
        }
        return await this._add(this.TABLES.GRADES, grade);
    },
    async updateGrade(id, updates) {
        if (updates.subjects && updates.subjects.length > 0) {
            const scores = updates.subjects.filter(s => s.score != null && s.score !== '').map(s => Number(s.score));
            updates.totalAvg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : 0;
        }
        return await this._update(this.TABLES.GRADES, id, updates);
    },
    async deleteGrade(id) { return await this._delete(this.TABLES.GRADES, id); },

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

    // === TEACHERS / USERS ===
    getTeachers() { return this._getAll(this.TABLES.TEACHERS); },
    getTeacher(id) { return this._getById(this.TABLES.TEACHERS, id); },
    async addTeacher(teacher) { return await this._add(this.TABLES.TEACHERS, teacher); },
    async updateTeacher(id, updates) { return await this._update(this.TABLES.TEACHERS, id, updates); },

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

    async approveUser(id) {
        return await this.updateTeacher(id, { approved: true });
    },

    async rejectUser(id) {
        const user = this.getTeacher(id);
        if (user && user.studentId) {
            await this.deleteStudent(user.studentId);
        }
        return await this._delete(this.TABLES.TEACHERS, id);
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

    async assignStudentToTeacher(teacherId, studentId) {
        const teacher = this.getTeacher(teacherId);
        if (!teacher) return;
        const ids = teacher.assignedStudentIds || [];
        if (!ids.includes(studentId)) {
            ids.push(studentId);
            await this.updateTeacher(teacherId, { assignedStudentIds: ids });
        }
    },

    async unassignStudentFromTeacher(teacherId, studentId) {
        const teacher = this.getTeacher(teacherId);
        if (!teacher) return;
        const ids = (teacher.assignedStudentIds || []).filter(id => id !== studentId);
        await this.updateTeacher(teacherId, { assignedStudentIds: ids });
    },

    async deleteTeacher(id) { return await this._delete(this.TABLES.TEACHERS, id); },

};
