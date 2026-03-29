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
        GRADES: 'grades',
        BOARD_POSTS: 'board_posts',
        BOARD_EVENTS: 'board_events'
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
        grades: [],
        board_posts: [],
        board_events: []
    },

    _syncEnabled: true,
    _loaded: new Set(), // 이미 로드된 테이블 추적

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
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    },

    // === Supabase 초기 로드: 로그인에 필요한 핵심 테이블만 ===
    async initFromSupabase() {
        if (typeof supabaseClient === 'undefined') {
            throw new Error('supabaseClient가 정의되지 않았습니다');
        }
        await this._ensureLoaded(this.TABLES.TEACHERS, this.TABLES.STUDENTS);
    },

    // === 지연 로딩: 아직 로드되지 않은 테이블만 Supabase에서 가져옴 ===
    async _ensureLoaded(...tableKeys) {
        const toLoad = tableKeys.filter(k => !this._loaded.has(k));
        if (toLoad.length === 0) return;

        const results = await Promise.all(
            toLoad.map(table => supabaseClient.from(table).select('*'))
        );
        toLoad.forEach((table, i) => {
            const { data, error } = results[i];
            if (error) {
                console.error(`[Supabase] ${table} 로드 오류:`, error);
                this._cache[table] = [];
            } else {
                this._cache[table] = (data || []).map(row => this._objToCamel(row));
                this._loaded.add(table);
                console.log(`[Supabase] ${table}: ${this._cache[table].length}건 로드`);
            }
        });
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
            let supabaseError;
            try {
                const { error } = await supabaseClient.from(table).insert(this._objToSnake(item));
                supabaseError = error;
            } catch (err) {
                supabaseError = err;
            }
            if (supabaseError) {
                console.error(`[Supabase] ${table} 삽입 오류:`, supabaseError);
                this._cache[table] = this._cache[table].filter(i => i.id !== item.id);
                throw new Error(supabaseError.message || String(supabaseError));
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
            let supabaseError;
            try {
                const { error } = await supabaseClient.from(table).update(this._objToSnake(updates)).eq('id', id);
                supabaseError = error;
            } catch (err) {
                supabaseError = err;
            }
            if (supabaseError) {
                console.error(`[Supabase] ${table} 수정 오류:`, supabaseError);
                items[idx] = backup;
                throw new Error(supabaseError.message || String(supabaseError));
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
            let supabaseError;
            try {
                const { error } = await supabaseClient.from(table).delete().eq('id', id);
                supabaseError = error;
            } catch (err) {
                supabaseError = err;
            }
            if (supabaseError) {
                console.error(`[Supabase] ${table} 삭제 오류:`, supabaseError);
                if (deletedItem) this._cache[table].push(deletedItem);
                throw new Error(supabaseError.message || String(supabaseError));
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
        for (const g of this.getStudentGrades(id)) await this.deleteGrade(g.id);
        for (const m of this.getMessages().filter(m => m.studentId === id)) await this.deleteMessage(m.id);
        // 선생님 담당 목록에서 해당 학생 제거
        for (const t of this.getTeachers()) {
            if (t.assignedStudentIds && t.assignedStudentIds.includes(id)) {
                const updated = t.assignedStudentIds.filter(sid => sid !== id);
                await this.updateTeacher(t.id, { assignedStudentIds: updated });
            }
        }
        // 해당 학생으로 가입된 로그인 계정(teachers 테이블) 삭제
        for (const t of this.getTeachers().filter(t => t.studentId === id)) {
            await this._delete(this.TABLES.TEACHERS, t.id);
        }
        return await this._delete(this.TABLES.STUDENTS, id);
    },

    searchStudents(query) {
        if (!query) return this.getStudents();
        const q = query.toLowerCase();
        return this.getStudents().filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.school || '').toLowerCase().includes(q) ||
            (s.grade || '').toLowerCase().includes(q) ||
            (s.className || '').toLowerCase().includes(q)
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

    getMessages() {
        return this._getAll(this.TABLES.MESSAGES).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    getMessage(id) { return this._getById(this.TABLES.MESSAGES, id); },

    async addMessage(msg) {
        msg.readBy = msg.readBy || {};
        msg.pinned = msg.pinned || false;
        msg.channel = msg.channel || 'internal';
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

    async login(loginId, password) {
        await this._ensureLoaded(this.TABLES.TEACHERS);
        const user = this.getTeachers().find(t => t.loginId === loginId);
        if (!user) return null;

        // bcrypt 해시면 compareSync, 평문이면 직접 비교 후 자동 마이그레이션
        const storedPw = user.password || '';
        const isBcrypt = storedPw.startsWith('$2a$') || storedPw.startsWith('$2b$');
        let passwordMatch = false;
        if (isBcrypt) {
            passwordMatch = bcrypt.compareSync(password, storedPw);
        } else {
            passwordMatch = (storedPw === password);
            if (passwordMatch) {
                const hashed = bcrypt.hashSync(password, 10);
                await this._update(this.TABLES.TEACHERS, user.id, { password: hashed });
            }
        }

        if (!passwordMatch) return null;
        if (user.approved === false) return { rejected: false, pending: true };

        const sessionUser = {
            id: user.id,
            loginId: user.loginId,
            name: user.name,
            role: user.role,
            assignedStudentIds: user.assignedStudentIds || []
        };
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
        // 다음 로그인 시 데이터를 새로 로드하도록 캐시 초기화
        this._loaded.clear();
        Object.keys(this._cache).forEach(k => { this._cache[k] = []; });
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

    // ==========================================
    //  권한 기반 필터링 메서드 (Permissions 모듈 연동)
    // ==========================================

    /**
     * 현재 사용자가 볼 수 있는 코멘트 필터링
     * - 원장/선생: 모든 코멘트
     * - 학생: recipients에 'student'가 포함된 코멘트만
     */
    getVisibleComments(studentId = null) {
        let comments = this.getComments();
        if (studentId) {
            comments = comments.filter(c => c.studentId === studentId);
        }
        
        // Permissions 모듈이 로드되어 있으면 필터링 적용
        if (typeof Permissions !== 'undefined') {
            comments = Permissions.filterVisibleComments(comments);
        }
        
        return comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    /**
     * 학생용 코멘트 필터링 (학생에게 공개된 코멘트만)
     */
    getStudentVisibleComments(studentId) {
        return this.getComments()
            .filter(c => c.studentId === studentId)
            .filter(c => {
                const recipients = c.recipients || [];
                return recipients.includes('student');
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    /**
     * 내부 코멘트 필터링 (선생/원장 간 소통용, 학생 미공개)
     */
    getInternalComments(studentId) {
        return this.getComments()
            .filter(c => c.studentId === studentId)
            .filter(c => {
                const recipients = c.recipients || [];
                return !recipients.includes('student');
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    // === BOARD POSTS (학원 게시판) ===
    getBoardPosts() {
        return this._getAll(this.TABLES.BOARD_POSTS).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    getBoardPost(id) { return this._getById(this.TABLES.BOARD_POSTS, id); },
    async addBoardPost(post) { return await this._add(this.TABLES.BOARD_POSTS, post); },
    async updateBoardPost(id, updates) { return await this._update(this.TABLES.BOARD_POSTS, id, updates); },
    async deleteBoardPost(id) { return await this._delete(this.TABLES.BOARD_POSTS, id); },

    // === BOARD EVENTS (학원 일정) ===
    getBoardEvents() {
        return this._getAll(this.TABLES.BOARD_EVENTS).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    },
    getBoardEvent(id) { return this._getById(this.TABLES.BOARD_EVENTS, id); },
    async addBoardEvent(event) { return await this._add(this.TABLES.BOARD_EVENTS, event); },
    async updateBoardEvent(id, updates) { return await this._update(this.TABLES.BOARD_EVENTS, id, updates); },
    async deleteBoardEvent(id) { return await this._delete(this.TABLES.BOARD_EVENTS, id); },

    getEventsForMonth(year, month) {
        const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
        return this.getBoardEvents().filter(e => (e.date || '').startsWith(prefix));
    },

};
