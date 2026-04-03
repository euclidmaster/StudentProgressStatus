// app.js - Student Progress Status 메인 애플리케이션 로직

const App = {
    currentView: 'dashboard',
    currentStudentId: null,
    currentUser: null,
    msgChannel: 'internal',

    async init() {
        let supabaseOk = false;
        const loadingMsg = document.querySelector('#loading-screen p');

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1 && loadingMsg) {
                    loadingMsg.textContent = `서버 연결 중... (${attempt}/3)`;
                }
                await DataStore.initFromSupabase();
                supabaseOk = true;
                break;
            } catch (e) {
                console.warn(`Supabase 연결 시도 ${attempt} 실패:`, e);
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, 2000)); // 2초 대기 후 재시도
                } else {
                    alert('서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요.');
                }
            }
        }
        this.createToastContainer();

        // 로딩 화면 숨기기
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';

        // Check if already logged in
        const user = DataStore.getCurrentUser();
        if (user) {
            this.currentUser = DataStore.refreshCurrentUser();
            if (this.currentUser) {
                this.showApp();
                return;
            }
        }
        this.showLoginScreen();
    },

    showLoginScreen() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';

        // Show login card, hide register card
        document.getElementById('register-card').style.display = 'none';
        const loginCard = document.querySelector('.login-card:not(.register-card)');
        loginCard.style.display = '';

        const form = document.getElementById('login-form');
        // Remove old listener by cloning
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const loginId = document.getElementById('login-id').value.trim();
            const password = document.getElementById('login-pw').value;
            const errorEl = document.getElementById('login-error');

            const user = await DataStore.login(loginId, password);
            if (user && user.pending) {
                errorEl.textContent = '가입 승인 대기 중입니다. 원장 승인 후 로그인할 수 있습니다.';
                errorEl.style.display = 'block';
            } else if (user && user.id) {
                this.currentUser = user;
                errorEl.style.display = 'none';
                this.showApp();
            } else {
                errorEl.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
                errorEl.style.display = 'block';
            }
        });

        // Toggle to register
        document.getElementById('show-register').addEventListener('click', (e) => {
            e.preventDefault();
            loginCard.style.display = 'none';
            document.getElementById('register-card').style.display = '';
            this.initRegisterForm();
        });

        // Toggle back to login
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-card').style.display = 'none';
            loginCard.style.display = '';
        });
    },

    initRegisterForm() {
        const regForm = document.getElementById('register-form');
        const newRegForm = regForm.cloneNode(true);
        regForm.parentNode.replaceChild(newRegForm, regForm);

        // Role tabs
        const roleTabs = newRegForm.querySelectorAll('.role-tab');
        const roleInput = newRegForm.querySelector('#reg-role');
        const studentFields = newRegForm.querySelector('#reg-student-fields');

        roleTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                roleTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                roleInput.value = tab.dataset.role;
                studentFields.style.display = tab.dataset.role === 'student' ? '' : 'none';
            });
        });

        // Submit
        newRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorEl = newRegForm.querySelector('#register-error');
            const role = newRegForm.querySelector('#reg-role').value;
            const name = newRegForm.querySelector('#reg-name').value.trim();
            const loginId = newRegForm.querySelector('#reg-id').value.trim();
            const pw = newRegForm.querySelector('#reg-pw').value;
            const pwConfirm = newRegForm.querySelector('#reg-pw-confirm').value;

            errorEl.style.display = 'none';

            if (!name || !loginId || !pw) {
                errorEl.textContent = '필수 항목을 모두 입력해주세요.';
                errorEl.style.display = 'block';
                return;
            }
            if (pw !== pwConfirm) {
                errorEl.textContent = '비밀번호가 일치하지 않습니다.';
                errorEl.style.display = 'block';
                return;
            }
            if (pw.length < 4) {
                errorEl.textContent = '비밀번호는 4자 이상이어야 합니다.';
                errorEl.style.display = 'block';
                return;
            }
            if (DataStore.getTeacherByLoginId(loginId)) {
                errorEl.textContent = '이미 사용 중인 아이디입니다.';
                errorEl.style.display = 'block';
                return;
            }

            try {
                if (role === 'student') {
                    // Register as student + teacher account (pending approval)
                    const school = newRegForm.querySelector('#reg-school').value.trim() || '-';
                    const grade = newRegForm.querySelector('#reg-grade').value;
                    const className = newRegForm.querySelector('#reg-class').value.trim() || '-';
                    const phone = newRegForm.querySelector('#reg-phone').value.trim() || '';
                    const hashedPw = bcrypt.hashSync(pw, 10);
                    const student = await DataStore.addStudent({ name, school, grade, className, phone, status: '대기', enrollDate: new Date().toISOString().slice(0, 10) });
                    await DataStore.addTeacher({ name, loginId, password: hashedPw, role: 'student', assignedStudentIds: [student.id], studentId: student.id, approved: false, regDate: new Date().toISOString().slice(0, 10) });
                } else {
                    const hashedPw = bcrypt.hashSync(pw, 10);
                    await DataStore.addTeacher({ name, loginId, password: hashedPw, role, assignedStudentIds: [], approved: false, regDate: new Date().toISOString().slice(0, 10) });
                }
            } catch (err) {
                errorEl.textContent = '가입 처리 중 오류가 발생했습니다: ' + err.message;
                errorEl.style.display = 'block';
                return;
            }

            this.toast('회원가입 신청이 완료되었습니다. 원장 승인 후 로그인할 수 있습니다.', 'success');
            document.getElementById('register-card').style.display = 'none';
            document.querySelector('.login-card:not(.register-card)').style.display = '';
            document.getElementById('login-id').value = loginId;
            document.getElementById('login-pw').value = '';
            document.getElementById('login-pw').focus();
        });
    },

    showApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = '';

        const role = this.currentUser ? this.currentUser.role : '';

        // Update user badge
        const badge = document.getElementById('user-badge');
        if (badge && this.currentUser) {
            const roleLabels = { director: '원장', teacher: '선생님', student: '학생', parent: '학부모' };
            const roleLabel = roleLabels[role] || '사용자';
            const badgeClass = role === 'director' ? 'badge-danger' : role === 'student' ? 'badge-success' : role === 'parent' ? 'badge-warning' : 'badge-primary';
            badge.innerHTML = `<i class="fas fa-user-circle"></i> ${this.escapeHtml(this.currentUser.name)} <span class="badge ${badgeClass}" style="font-size:0.7rem">${roleLabel}</span> <span style="font-size:0.75rem;color:var(--gray-400)">EM플러스</span>`;
        }

        // Show/hide nav items based on role
        const teacherNav = document.getElementById('nav-teachers');
        if (teacherNav) {
            teacherNav.style.display = role === 'director' ? '' : 'none';
            if (role === 'director') {
                const pendingCount = DataStore.getPendingUsers().length;
                let pendingBadge = teacherNav.querySelector('.pending-badge');
                if (pendingCount > 0) {
                    if (!pendingBadge) {
                        pendingBadge = document.createElement('span');
                        pendingBadge.className = 'pending-badge unread-badge';
                        teacherNav.appendChild(pendingBadge);
                    }
                    pendingBadge.textContent = pendingCount;
                    pendingBadge.style.display = '';
                } else if (pendingBadge) {
                    pendingBadge.style.display = 'none';
                }
            }
        }

        // 업무 노트 nav: 원장/선생만 표시
        const tasksNav = document.getElementById('nav-tasks');
        if (tasksNav) {
            tasksNav.style.display = (role === 'director' || role === 'teacher') ? '' : 'none';
        }

        // 출석 관리 nav: 원장/선생만 표시
        const attendanceNav = document.getElementById('nav-attendance');
        if (attendanceNav) {
            attendanceNav.style.display = (role === 'director' || role === 'teacher') ? '' : 'none';
        }

        // 상담 일지 nav: 원장/선생만 표시 + 다음 상담 예정 배지
        const consultNav = document.getElementById('nav-consultations');
        if (consultNav) {
            consultNav.style.display = (role === 'director' || role === 'teacher') ? '' : 'none';
        }

        // 수업료 관리 nav: 원장만 표시
        const tuitionNav = document.getElementById('nav-tuition');
        if (tuitionNav) {
            tuitionNav.style.display = role === 'director' ? '' : 'none';
        }

        // 비교 분석 nav: 원장/선생만 표시
        const analyticsNav = document.getElementById('nav-analytics');
        if (analyticsNav) {
            analyticsNav.style.display = (role === 'director' || role === 'teacher') ? '' : 'none';
        }

        // 시간표 nav: 모든 역할 표시 (학생/학부모도 자신의 시간표 조회 가능)
        // (별도 숨김 처리 없음 — restrictedHiddenViews에 포함 안 함)

        // Student/Parent role: hide management-heavy nav items
        const restrictedHiddenViews = ['plans', 'progress', 'comments', 'teachers', 'messages', 'tasks', 'attendance', 'consultations', 'tuition', 'analytics'];
        document.querySelectorAll('.nav-item').forEach(item => {
            const view = item.dataset.view;
            if ((role === 'student' || role === 'parent') && restrictedHiddenViews.includes(view)) {
                item.style.display = 'none';
            } else if (view !== 'teachers' && view !== 'tasks' && view !== 'attendance' && view !== 'consultations' && view !== 'tuition' && view !== 'analytics') {
                item.style.display = '';
            }
        });

        this.bindEvents();

        // 학생/학부모는 전용 페이지로 바로 이동
        if (role === 'parent' && this.currentUser.studentId) {
            this.navigate('parent-home');
        } else if (role === 'student' && this.currentUser.studentId) {
            this.navigate('student-detail', { studentId: this.currentUser.studentId });
        } else {
            this.navigate('dashboard');
        }
        this.updateUnreadBadge();
        this.updateNotificationBadge();
    },

    handleLogout() {
        DataStore.logout();
        this.currentUser = null;
        this.showLoginScreen();
    },

    // Helper to get students visible to current user
    getVisibleStudents() {
        if (!this.currentUser) return DataStore.getStudents();
        if (this.currentUser.role === 'director') return DataStore.getStudents();
        if (this.currentUser.role === 'student') {
            const s = DataStore.getStudent(this.currentUser.studentId);
            return s ? [s] : [];
        }
        // Teacher sees only assigned students
        return DataStore.getAssignedStudents(this.currentUser.id);
    },

    getVisibleStudentIds() {
        return this.getVisibleStudents().map(s => s.id);
    },

    updateUnreadBadge() {
        const badge = document.getElementById('unread-badge');
        if (!badge) return;
        const userName = this.currentUser ? this.currentUser.name : '';
        const isTeacher = this.currentUser && this.currentUser.role === 'teacher';

        // 내부 소통 메시지 (기존)
        let internalMsgs = DataStore.getMessages().filter(m => m.channel !== 'team');
        if (isTeacher) {
            internalMsgs = internalMsgs.filter(m => m.authorRole === 'director' || m.author === userName);
        }
        // 업무 공유 메시지
        const teamMsgs = (isTeacher || (this.currentUser && this.currentUser.role === 'director'))
            ? DataStore.getMessages().filter(m => m.channel === 'team' && m.author !== userName)
            : [];

        const allRelevant = [...internalMsgs, ...teamMsgs];
        const unread = allRelevant.filter(m => !(m.readBy && m.readBy[userName])).length;

        if (unread > 0) {
            badge.textContent = unread;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    },

    // === Utilities ===
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    },

    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    getProgressColor(pct) {
        if (pct >= 75) return 'green';
        if (pct >= 40) return '';
        if (pct >= 20) return 'yellow';
        return 'red';
    },

    getDifficultyBadge(d) {
        const map = { '상': 'badge-danger', '중': 'badge-warning', '하': 'badge-success' };
        return `<span class="badge ${map[d] || 'badge-gray'}">${this.escapeHtml(d)}</span>`;
    },

    getStatusBadge(s) {
        const map = { active: ['badge-primary', '진행 중'], completed: ['badge-success', '완료'], paused: ['badge-gray', '일시중지'] };
        const [cls, label] = map[s] || ['badge-gray', s];
        return `<span class="badge ${cls}">${label}</span>`;
    },

    getRoleBadge(role) {
        const map = { teacher: ['badge-primary', '선생님'], parent: ['badge-success', '학부모'], student: ['badge-warning', '학생'], admin: ['badge-danger', '관리자'] };
        const [cls, label] = map[role] || ['badge-gray', role];
        return `<span class="badge ${cls}">${label}</span>`;
    },

    // === Toast ===
    createToastContainer() {
        if (!document.querySelector('.toast-container')) {
            const tc = document.createElement('div');
            tc.className = 'toast-container';
            document.body.appendChild(tc);
        }
    },

    toast(message, type = '') {
        const tc = document.querySelector('.toast-container');
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${this.escapeHtml(message)}`;
        tc.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },

    // === Event Binding ===
    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(item.dataset.view);
            });
        });

        // Nav group toggle
        document.querySelectorAll('.nav-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const group = document.getElementById(header.dataset.group);
                if (group) group.classList.toggle('open');
            });
        });

        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            const sb = document.getElementById('sidebar');
            if (window.innerWidth > 768) {
                // 데스크탑: slim 모드 토글
                sb.classList.toggle('slim');
                // slim 모드일 때 그룹 모두 열기 (아이콘 다 보이게)
                if (sb.classList.contains('slim')) {
                    document.querySelectorAll('.nav-group').forEach(g => g.classList.add('open'));
                }
            } else {
                // 모바일: 오버레이 show/hide
                sb.classList.toggle('show');
                document.getElementById('sidebar-overlay').classList.toggle('active', sb.classList.contains('show'));
            }
        });

        document.getElementById('sidebar-overlay').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('show');
            document.getElementById('sidebar-overlay').classList.remove('active');
        });

        // Close sidebar on nav item click (mobile)
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('show');
                    document.getElementById('sidebar-overlay').classList.remove('active');
                }
            });
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
            this.handleLogout();
        });

        const bellBtn = document.getElementById('btn-notifications');
        if (bellBtn) {
            bellBtn.addEventListener('click', () => this.navigate('notifications'));
        }

        const searchInput = document.getElementById('global-search');
        const searchBox = searchInput.closest('.search-box');
        const searchBtn = document.getElementById('btn-search');

        const doSearch = (q) => {
            if (this.currentView === 'students') {
                this.renderStudents(q);
            } else if (q.length >= 1) {
                this.navigate('students');
                setTimeout(() => this.renderStudents(q), 300);
            }
        };

        searchInput.addEventListener('input', (e) => doSearch(e.target.value));

        searchBtn.addEventListener('click', () => {
            // 모바일: 검색창 열기/닫기 토글
            if (window.innerWidth <= 640) {
                if (!searchBox.classList.contains('open')) {
                    searchBox.classList.add('open');
                    searchInput.focus();
                    return;
                }
            }
            const q = searchInput.value.trim();
            if (q) {
                doSearch(q);
            } else {
                searchInput.focus();
            }
        });

        // 모바일: 검색창 바깥 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!searchBox.contains(e.target)) {
                searchBox.classList.remove('open');
            }
        });

        document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        document.getElementById('content-area').addEventListener('click', (e) => this.handleContentClick(e));
    },

    // === Navigation ===
    async navigate(view, data = {}) {
        this.currentView = view;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        // Auto-expand the nav group containing the active view
        const viewGroupMap = {
            dashboard: 'navg-student', students: 'navg-student', 'student-detail': 'navg-student',
            attendance: 'navg-student', consultations: 'navg-student', teachers: 'navg-student', analytics: 'navg-student',
            plans: 'navg-study', progress: 'navg-study', homework: 'navg-study',
            exam: 'navg-study', comments: 'navg-study', report: 'navg-study', schedule: 'navg-study',
            grades: 'navg-ops', board: 'navg-ops', notifications: 'navg-ops',
            messages: 'navg-ops', tasks: 'navg-ops', tuition: 'navg-ops'
        };
        const targetGroup = viewGroupMap[view];
        if (targetGroup) {
            document.getElementById(targetGroup)?.classList.add('open');
        }

        const titles = { dashboard: '대시보드', students: '학생 관리', 'student-detail': '학생 상세', plans: '학습 계획', progress: '진도 현황', comments: '코멘트', grades: '성적 관리', board: '학원 게시판', messages: '내부 소통', tasks: '업무 노트', attendance: '출석 관리', homework: '숙제 관리', exam: '시험 플래너', consultations: '상담 일지', notifications: '알림 센터', report: '월간 리포트', teachers: '선생님 관리', tuition: '수업료 관리', analytics: '학생 비교 분석', 'parent-home': '학부모 홈', schedule: '시간표' };
        document.getElementById('page-title').textContent = titles[view] || '';

        Charts.destroyAll();

        // 뷰별 필요 테이블 정의 (students/teachers는 초기 로드됨)
        const T = DataStore.TABLES;
        const viewTables = {
            'dashboard':      [T.PLANS, T.PROGRESS, T.COMMENTS, T.GRADES],
            'students':       [],
            'student-detail': [T.PLANS, T.PROGRESS, T.COMMENTS, T.GRADES, T.ATTENDANCE, T.HOMEWORK, T.EXAM_PLANS, T.CONSULTATIONS],
            'plans':          [T.PLANS],
            'progress':       [T.PLANS, T.PROGRESS],
            'comments':       [T.PLANS, T.COMMENTS],
            'grades':         [T.GRADES],
            'board':          [T.BOARD_POSTS, T.BOARD_EVENTS],
            'messages':       [T.MESSAGES],
            'tasks':          [],
            'attendance':     [T.ATTENDANCE],
            'homework':       [T.HOMEWORK],
            'exam':           [T.EXAM_PLANS],
            'consultations':  [T.CONSULTATIONS],
            'notifications':  [T.HOMEWORK, T.EXAM_PLANS, T.CONSULTATIONS, T.ATTENDANCE, T.COMMENTS],
            'report':         [T.PLANS, T.PROGRESS, T.ATTENDANCE, T.HOMEWORK, T.GRADES, T.COMMENTS],
            'teachers':       [],
            'tuition':        [T.TUITION],
            'analytics':      [T.PLANS, T.ATTENDANCE, T.GRADES, T.HOMEWORK],
            'parent-home':    [T.PLANS, T.PROGRESS, T.ATTENDANCE, T.HOMEWORK, T.EXAM_PLANS, T.COMMENTS, T.GRADES],
            'schedule':       [T.SCHEDULES],
        };

        const needed = viewTables[view] || [];
        if (needed.length > 0) {
            document.getElementById('content-area').innerHTML =
                '<div style="padding:2rem;text-align:center;color:var(--gray-400)"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>';
            try {
                await DataStore._ensureLoaded(...needed);
            } catch (err) {
                document.getElementById('content-area').innerHTML =
                    `<div style="padding:2rem;text-align:center;color:var(--danger)"><i class="fas fa-exclamation-triangle"></i> 데이터를 불러오지 못했습니다.<br><small>${this.escapeHtml(err.message)}</small></div>`;
                return;
            }
        }

        switch (view) {
            case 'dashboard': this.renderDashboard(); break;
            case 'students': this.renderStudents(); break;
            case 'student-detail': this.renderStudentDetail(data.studentId); break;
            case 'plans': this.renderPlans(); break;
            case 'progress': this.renderProgress(); break;
            case 'comments': this.renderComments(); break;
            case 'grades': this.renderGrades(); break;
            case 'board': this.renderBoard(); break;
            case 'messages': this.renderMessages(); break;
            case 'tasks': this.renderTasks(); break;
            case 'attendance': this.renderAttendance(); break;
            case 'homework': this.renderHomework(); break;
            case 'exam': this.renderExam(); break;
            case 'consultations': this.renderConsultations(data.studentId); break;
            case 'notifications': this.renderNotifications(); break;
            case 'report': this.renderReport(data.studentId, data.ym); break;
            case 'teachers': this.renderTeachers(); break;
            case 'tuition': this.renderTuition(); break;
            case 'analytics': this.renderAnalytics(); break;
            case 'parent-home': this.renderParentHome(); break;
            case 'schedule': this.renderSchedule(); break;
        }
    },

    // === Modal ===
    openModal(title, contentHtml) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = contentHtml;
        document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-body').innerHTML = '';
    },

    // =========================================
    //  VIEW: DASHBOARD
    // =========================================
    renderDashboard() {
        const students = this.getVisibleStudents();
        const visibleIds = students.map(s => s.id);
        const allPlans = DataStore.getPlans().filter(p => visibleIds.includes(p.studentId));
        const activePlans = allPlans.filter(p => p.status === 'active');
        const completedPlans = allPlans.filter(p => p.status === 'completed');
        // 권한 기반 코멘트 필터링
        const allComments = Permissions.filterVisibleComments(
            DataStore.getComments().filter(c => visibleIds.includes(c.studentId))
        );
        const isStudent = Permissions.isStudent();

        let avgProgress = 0;
        if (activePlans.length > 0) {
            const total = activePlans.reduce((sum, p) =>
                sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0);
            avgProgress = Math.round(total / activePlans.length);
        }

        const stats = {
            totalStudents: students.length,
            totalPlans: allPlans.length,
            activePlans: activePlans.length,
            completedPlans: completedPlans.length,
            totalComments: allComments.length,
            avgProgress
        };

        const recentComments = allComments
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        const userLabel = this.currentUser
            ? (this.currentUser.role === 'director' ? '전체' : this.currentUser.role === 'student' ? '내' : `${this.currentUser.name} 담당`)
            : '전체';

        const html = `
            ${this.currentUser && this.currentUser.role === 'teacher' ? `<div class="teacher-context-banner"><i class="fas fa-chalkboard-teacher"></i> <strong>${this.escapeHtml(this.currentUser.name)}</strong> 담당 학생 현황 (${students.length}명)</div>` : ''}
            ${isStudent ? `<div class="student-context-banner"><i class="fas fa-user-graduate"></i> <strong>${this.escapeHtml(this.currentUser.name)}</strong>님의 학습 현황</div>` : ''}
            <div class="stats-grid">
                ${!isStudent ? `<div class="stat-card">
                    <div class="stat-icon blue"><i class="fas fa-user-graduate"></i></div>
                    <div class="stat-info"><h3>${stats.totalStudents}</h3><p>${userLabel} 학생</p></div>
                </div>` : ''}
                <div class="stat-card">
                    <div class="stat-icon green"><i class="fas fa-book-open"></i></div>
                    <div class="stat-info"><h3>${stats.activePlans}</h3><p>진행 중인 학습 계획</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon yellow"><i class="fas fa-chart-line"></i></div>
                    <div class="stat-info"><h3>${stats.avgProgress}%</h3><p>평균 진행률</p></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon purple"><i class="fas fa-comments"></i></div>
                    <div class="stat-info"><h3>${stats.totalComments}</h3><p>전체 코멘트</p></div>
                </div>
            </div>

            <div class="grid-2">
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-chart-pie"></i> 학습 계획 현황</h2></div>
                    <div class="card-body"><div class="chart-container"><canvas id="chart-overview"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-chart-bar"></i> 학생 진도 분포</h2></div>
                    <div class="card-body"><div class="chart-container"><canvas id="chart-distribution"></canvas></div></div>
                </div>
            </div>

            <div class="grid-2">
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-chart-bar"></i> 과목별 평균 진행률</h2></div>
                    <div class="card-body"><div class="chart-container"><canvas id="chart-subjects"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-clock"></i> 최근 코멘트</h2></div>
                    <div class="card-body">
                        ${recentComments.length === 0 ? '<div class="empty-state"><p>아직 코멘트가 없습니다.</p></div>' :
                            recentComments.map(c => {
                                const student = DataStore.getStudent(c.studentId);
                                // 내부 코멘트 표시 (학생에게는 보이지 않음)
                                const isInternal = !(c.recipients || []).includes('student');
                                const internalTag = (!isStudent && isInternal) ? ' <span class="badge badge-gray" style="font-size:0.6rem"><i class="fas fa-lock"></i></span>' : '';
                                return `<div class="activity-item">
                                    <div class="activity-dot ${c.authorRole === 'teacher' ? 'blue' : c.authorRole === 'parent' ? 'green' : 'yellow'}"></div>
                                    <div class="activity-text">
                                        <strong>${this.escapeHtml(c.author)}</strong> ${this.getRoleBadge(c.authorRole)}${internalTag}
                                        ${student ? `→ <span class="student-name" data-action="view-student" data-id="${student.id}">${this.escapeHtml(student.name)}</span>` : ''}
                                        <br>${this.escapeHtml(c.content).substring(0, 60)}${c.content.length > 60 ? '...' : ''}
                                    </div>
                                    <div class="activity-time">${this.formatDate(c.createdAt)}</div>
                                </div>`;
                            }).join('')}
                    </div>
                </div>
            </div>

            <div class="card" style="margin-top:20px">
                <div class="card-header">
                    <h2><i class="fas fa-users"></i> 학생별 진도 요약</h2>
                    ${!isStudent ? `<button class="btn btn-sm btn-outline" data-action="go-students">전체 보기</button>` : ''}
                </div>
                <div class="card-body no-padding">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>학생명</th><th>학교/학년</th><th>반</th><th>진행 계획</th><th>평균 진행률</th>${!isStudent ? '<th></th>' : ''}</tr></thead>
                            <tbody>
                                ${students.map(s => {
                                    const plans = DataStore.getStudentPlans(s.id).filter(p => p.status === 'active');
                                    let avg = 0;
                                    if (plans.length > 0) avg = Math.round(plans.reduce((sum, p) => sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / plans.length);
                                    return `<tr>
                                        <td><span class="student-name" data-action="view-student" data-id="${s.id}">${this.escapeHtml(s.name)}</span></td>
                                        <td>${this.escapeHtml(s.school)} / ${this.escapeHtml(s.grade)}</td>
                                        <td>${this.escapeHtml(s.className)}</td>
                                        <td>${plans.length}개</td>
                                        <td>
                                            <div class="progress-bar-container" style="width:120px;display:inline-block;vertical-align:middle;margin-right:8px">
                                                <div class="progress-bar ${this.getProgressColor(avg)}" style="width:${avg}%"></div>
                                            </div>
                                            <span style="font-weight:600;font-size:0.85rem">${avg}%</span>
                                        </td>
                                        ${!isStudent ? `<td><button class="btn btn-sm btn-ghost" data-action="view-student" data-id="${s.id}"><i class="fas fa-arrow-right"></i></button></td>` : ''}
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;

        setTimeout(() => {
            Charts.createOverviewDoughnut('chart-overview', stats);
            Charts.createProgressDistribution('chart-distribution', students);
            Charts.createAllStudentsSubject('chart-subjects');
        }, 50);
    },

    // =========================================
    //  VIEW: STUDENTS LIST
    // =========================================
    renderStudents(searchQuery = '') {
        // 학생 역할이면 본인 상세 페이지로 바로 이동
        if (Permissions.isStudent() && this.currentUser && this.currentUser.studentId) {
            this.navigate('student-detail', { studentId: this.currentUser.studentId });
            return;
        }

        const visibleStudents = this.getVisibleStudents();
        const visibleIds = visibleStudents.map(s => s.id);
        const allStudents = visibleStudents;
        const grades = [...new Set(visibleStudents.map(s => s.grade))].sort();
        let students = searchQuery
            ? visibleStudents.filter(s => {
                const q = searchQuery.toLowerCase();
                return (s.name || '').toLowerCase().includes(q) ||
                       (s.school || '').toLowerCase().includes(q) ||
                       (s.grade || '').toLowerCase().includes(q) ||
                       (s.className || '').toLowerCase().includes(q) ||
                       (s.phone || '').includes(q) ||
                       (s.parentName || '').toLowerCase().includes(q) ||
                       (s.parentPhone || '').includes(q);
              })
            : allStudents;

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-grade" onchange="App.filterStudents()">
                        <option value="">전체 학년</option>
                        ${grades.map(g => `<option value="${this.escapeHtml(g)}">${this.escapeHtml(g)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-class" onchange="App.filterStudents()">
                        <option value="">전체 반</option>
                    </select>
                    <span style="color:var(--gray-500);font-size:0.85rem">${students.length}명</span>
                </div>
                ${!Permissions.isStudent() ? `<button class="btn btn-primary" data-action="add-student"><i class="fas fa-plus"></i> 학생 등록</button>` : ''}
            </div>

            <div class="card">
                <div class="card-body no-padding">
                    <div class="table-wrapper">
                        <table id="students-table">
                            <thead><tr><th>이름</th><th>학교</th><th>학년</th><th>반</th><th>전화번호</th><th>학부모</th><th>진행 계획</th><th>평균 진행률</th><th>관리</th></tr></thead>
                            <tbody>
                                ${students.length === 0 ? '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-user-slash"></i><h3>학생이 없습니다</h3><p>새 학생을 등록해주세요.</p></div></td></tr>' :
                                    students.map(s => {
                                        const plans = DataStore.getStudentPlans(s.id).filter(p => p.status === 'active');
                                        let avg = 0;
                                        if (plans.length > 0) avg = Math.round(plans.reduce((sum, p) => sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / plans.length);
                                        return `<tr>
                                            <td><span class="student-name" data-action="view-student" data-id="${s.id}">${this.escapeHtml(s.name)}</span></td>
                                            <td>${this.escapeHtml(s.school)}</td>
                                            <td>${this.escapeHtml(s.grade)}</td>
                                            <td>${this.escapeHtml(s.className)}</td>
                                            <td>${this.escapeHtml(s.phone)}</td>
                                            <td>${this.escapeHtml(s.parentName)}</td>
                                            <td>${plans.length}개</td>
                                            <td>
                                                <div class="progress-bar-container" style="width:100px;display:inline-block;vertical-align:middle;margin-right:6px">
                                                    <div class="progress-bar ${this.getProgressColor(avg)}" style="width:${avg}%"></div>
                                                </div>
                                                <span style="font-weight:600;font-size:0.82rem">${avg}%</span>
                                            </td>
                                            <td>
                                                <button class="btn-icon" data-action="edit-student" data-id="${s.id}" title="수정"><i class="fas fa-edit"></i></button>
                                                <button class="btn-icon" data-action="delete-student" data-id="${s.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    filterStudents() {
        const grade = document.getElementById('filter-grade').value;
        const cls = document.getElementById('filter-class').value;

        // Update class options when grade changes
        const classSelect = document.getElementById('filter-class');
        if (grade) {
            const visibleStudents = this.getVisibleStudents().filter(s => s.grade === grade);
            const classes = [...new Set(visibleStudents.map(s => s.className))].sort();
            classSelect.innerHTML = `<option value="">전체 반</option>` + classes.map(c => `<option value="${this.escapeHtml(c)}" ${c === cls ? 'selected' : ''}>${this.escapeHtml(c)}</option>`).join('');
        } else {
            classSelect.innerHTML = '<option value="">전체 반</option>';
        }

        let students = this.getVisibleStudents();
        if (grade) students = students.filter(s => s.grade === grade);
        if (cls) students = students.filter(s => s.className === cls);

        const search = document.getElementById('global-search').value;
        if (search) {
            const q = search.toLowerCase();
            students = students.filter(s =>
                (s.name || '').toLowerCase().includes(q) ||
                (s.school || '').toLowerCase().includes(q) ||
                (s.grade || '').toLowerCase().includes(q) ||
                (s.className || '').toLowerCase().includes(q) ||
                (s.phone || '').includes(q) ||
                (s.parentName || '').toLowerCase().includes(q) ||
                (s.parentPhone || '').includes(q)
            );
        }

        const tbody = document.querySelector('#students-table tbody');
        if (!tbody) return;

        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="fas fa-user-slash"></i><h3>조건에 맞는 학생이 없습니다</h3></div></td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => {
            const plans = DataStore.getStudentPlans(s.id).filter(p => p.status === 'active');
            let avg = 0;
            if (plans.length > 0) avg = Math.round(plans.reduce((sum, p) => sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / plans.length);
            return `<tr>
                <td><span class="student-name" data-action="view-student" data-id="${s.id}">${this.escapeHtml(s.name)}</span></td>
                <td>${this.escapeHtml(s.school)}</td>
                <td>${this.escapeHtml(s.grade)}</td>
                <td>${this.escapeHtml(s.className)}</td>
                <td>${this.escapeHtml(s.phone)}</td>
                <td>${this.escapeHtml(s.parentName)}</td>
                <td>${plans.length}개</td>
                <td>
                    <div class="progress-bar-container" style="width:100px;display:inline-block;vertical-align:middle;margin-right:6px">
                        <div class="progress-bar ${this.getProgressColor(avg)}" style="width:${avg}%"></div>
                    </div>
                    <span style="font-weight:600;font-size:0.82rem">${avg}%</span>
                </td>
                <td>
                    <button class="btn-icon" data-action="edit-student" data-id="${s.id}" title="수정"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" data-action="delete-student" data-id="${s.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    },

    // =========================================
    //  VIEW: STUDENT DETAIL
    // =========================================
    renderStudentDetail(studentId) {
        if (!studentId && this.currentStudentId) studentId = this.currentStudentId;
        if (!studentId) { this.navigate('students'); return; }
        this.currentStudentId = studentId;

        const student = DataStore.getStudent(studentId);
        if (!student) { this.navigate('students'); return; }

        const plans = DataStore.getStudentPlans(studentId);
        const activePlans = plans.filter(p => p.status === 'active');
        const subjectProgress = DataStore.getStudentSubjectProgress(studentId);
        // 권한 기반 코멘트 필터링
        const comments = DataStore.getVisibleComments(studentId);
        const studentGrades = DataStore.getStudentGrades(studentId);
        const assignedTeachers = DataStore.getStudentTeachers(studentId);

        // 권한 체크
        const canEdit = Permissions.canEditStudent(studentId);
        const canAddProgress = Permissions.canAddProgress(studentId);
        const canAddComment = Permissions.canAddComment(studentId);
        const isStudent = Permissions.isStudent();

        const initial = student.name.charAt(0);

        const html = `
            <a class="back-link" data-action="go-students"><i class="fas fa-arrow-left"></i> 학생 목록으로</a>

            <div class="student-header">
                <div class="student-avatar">${this.escapeHtml(initial)}</div>
                <div class="student-header-info">
                    <h2>${this.escapeHtml(student.name)}</h2>
                    <div class="student-meta">
                        <span><i class="fas fa-school"></i> ${this.escapeHtml(student.school)}</span>
                        <span><i class="fas fa-graduation-cap"></i> ${this.escapeHtml(student.grade)}</span>
                        <span><i class="fas fa-users"></i> ${this.escapeHtml(student.className)}</span>
                        <span><i class="fas fa-phone"></i> ${this.escapeHtml(student.phone)}</span>
                        ${assignedTeachers.length > 0 ? `<span><i class="fas fa-chalkboard-teacher"></i> ${assignedTeachers.filter(t => this.currentUser.role === 'director' || t.id === (this.currentUser && this.currentUser.id)).map(t => this.escapeHtml(t.name)).join(', ')}</span>` : ''}
                    </div>
                </div>
                <div class="student-header-actions">
                    ${canEdit ? `<button class="btn btn-outline btn-sm" data-action="edit-student" data-id="${studentId}"><i class="fas fa-edit"></i> 수정</button>` : ''}
                    ${this.currentUser && this.currentUser.role === 'director' ? `<button class="btn btn-outline btn-sm" data-action="assign-teachers" data-student-id="${studentId}"><i class="fas fa-chalkboard-teacher"></i> 담당 지정</button>` : ''}
                    ${canEdit ? `<button class="btn btn-primary btn-sm" data-action="add-plan" data-student-id="${studentId}"><i class="fas fa-plus"></i> 학습 계획 추가</button>` : ''}
                </div>
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-header"><h2><i class="fas fa-info-circle"></i> 학생 정보</h2></div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item"><div class="info-label">학교</div><div class="info-value">${this.escapeHtml(student.school)}</div></div>
                        <div class="info-item"><div class="info-label">학년</div><div class="info-value">${this.escapeHtml(student.grade)}</div></div>
                        <div class="info-item"><div class="info-label">반</div><div class="info-value">${this.escapeHtml(student.className)}</div></div>
                        <div class="info-item"><div class="info-label">전화번호</div><div class="info-value">${this.escapeHtml(student.phone)}</div></div>
                        <div class="info-item"><div class="info-label">학부모</div><div class="info-value">${this.escapeHtml(student.parentName)} (${this.escapeHtml(student.parentPhone)})</div></div>
                        <div class="info-item"><div class="info-label">등록일</div><div class="info-value">${this.formatDate(student.createdAt)}</div></div>
                    </div>
                    ${student.previousGrades ? `
                    <div style="margin-top:16px">
                        <div class="info-label" style="font-size:0.82rem;color:var(--gray-500);margin-bottom:6px;font-weight:500">이전 성적</div>
                        <div style="background:var(--gray-50);padding:12px;border-radius:8px;font-size:0.88rem;white-space:pre-line;color:var(--gray-700)">${this.escapeHtml(student.previousGrades)}</div>
                    </div>` : ''}
                    ${student.notes ? `
                    <div style="margin-top:12px">
                        <div class="info-label" style="font-size:0.82rem;color:var(--gray-500);margin-bottom:6px;font-weight:500">메모</div>
                        <div style="background:var(--warning-bg);padding:12px;border-radius:8px;font-size:0.88rem;color:var(--gray-700)">${this.escapeHtml(student.notes)}</div>
                    </div>` : ''}
                </div>
            </div>

            ${Object.keys(subjectProgress).length > 0 ? `
            <div class="grid-2" style="margin-bottom:20px">
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-chart-bar"></i> 과목별 진행률</h2></div>
                    <div class="card-body"><div class="chart-container"><canvas id="chart-student-bar"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-spider"></i> 과목 균형</h2></div>
                    <div class="card-body"><div class="chart-container"><canvas id="chart-student-radar"></canvas></div></div>
                </div>
            </div>` : ''}

            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <h2><i class="fas fa-book-open"></i> 학습 계획 (${plans.length}개)</h2>
                    ${canEdit ? `<button class="btn btn-sm btn-primary" data-action="add-plan" data-student-id="${studentId}"><i class="fas fa-plus"></i> 추가</button>` : ''}
                </div>
                <div class="card-body">
                    ${plans.length === 0 ? '<div class="empty-state"><i class="fas fa-book"></i><h3>등록된 학습 계획이 없습니다</h3><p>학습 계획을 추가해주세요.</p></div>' :
                        plans.map(plan => {
                            const pct = plan.totalUnits > 0 ? Math.round((plan.completedUnits / plan.totalUnits) * 100) : 0;
                            const isChecklist = plan.trackingMode === 'checklist';
                            return `<div class="plan-card">
                                <div class="plan-card-header">
                                    <div class="plan-card-title">
                                        <h3>${this.escapeHtml(plan.subject)}</h3>
                                        ${this.getStatusBadge(plan.status)}
                                        ${this.getDifficultyBadge(plan.difficulty)}
                                        ${isChecklist ? '<span class="badge badge-info" style="font-size:0.68rem"><i class="fas fa-tasks"></i> 단원별</span>' : ''}
                                    </div>
                                    ${(canEdit || canAddProgress) ? `<div class="plan-card-actions">
                                        ${(!isChecklist && canAddProgress) ? `<button class="btn btn-sm btn-success" data-action="add-progress" data-plan-id="${plan.id}" data-student-id="${studentId}"><i class="fas fa-plus"></i> 진도 입력</button>` : ''}
                                        ${canEdit ? `<button class="btn btn-sm btn-outline" data-action="edit-plan" data-plan-id="${plan.id}" data-student-id="${studentId}"><i class="fas fa-edit"></i></button>` : ''}
                                        ${canEdit ? `<button class="btn btn-sm btn-ghost" data-action="delete-plan" data-plan-id="${plan.id}" data-student-id="${studentId}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                                    </div>` : ''}
                                </div>
                                <div class="plan-card-meta">
                                    <span><i class="fas fa-book"></i> ${this.escapeHtml(plan.textbook)}</span>
                                    <span><i class="fas fa-calendar-check"></i> 체크기간: ${this.formatDate(plan.startDate)} ~ ${this.formatDate(plan.endDate)}</span>
                                    <span><i class="fas fa-bullseye"></i> ${this.escapeHtml(plan.planType)}</span>
                                    <span><i class="fas fa-pencil-alt"></i> ${this.escapeHtml(plan.studyMethod)}</span>
                                </div>
                                <div class="progress-item">
                                    <div class="progress-label">
                                        <span>${plan.completedUnits} / ${plan.totalUnits} ${this.escapeHtml(plan.unitLabel)}</span>
                                        <span>${pct}%</span>
                                    </div>
                                    <div class="progress-bar-container">
                                        <div class="progress-bar ${this.getProgressColor(pct)}" style="width:${pct}%"></div>
                                    </div>
                                </div>
                                ${isChecklist && plan.checklistItems ? `
                                    <div class="checklist-display">
                                        ${plan.checklistItems.map((item, ci) => `
                                            <label class="checklist-item ${item.completed ? 'completed' : ''}" data-plan-id="${plan.id}" data-ci="${ci}">
                                                <input type="checkbox" ${item.completed ? 'checked' : ''} data-action="toggle-checklist" data-plan-id="${plan.id}" data-ci="${ci}">
                                                <span>${this.escapeHtml(item.name)}</span>
                                            </label>
                                        `).join('')}
                                    </div>
                                ` : ''}
                                ${!isChecklist ? this.renderPlanTimeline(plan) : ''}
                            </div>`;
                        }).join('')}
                </div>
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <h2><i class="fas fa-trophy"></i> 성적 (${studentGrades.length}건)</h2>
                    <div style="display:flex;gap:6px;align-items:center">
                        ${studentGrades.length > 1 ? `
                        <button class="btn btn-sm ${this._gradeDetailView!=='trend'?'btn-outline':'btn-primary'}" data-action="grade-detail-view" data-mode="table" data-student-id="${studentId}"><i class="fas fa-table"></i></button>
                        <button class="btn btn-sm ${this._gradeDetailView==='trend'?'btn-primary':'btn-outline'}" data-action="grade-detail-view" data-mode="trend" data-student-id="${studentId}"><i class="fas fa-chart-line"></i> 추이</button>
                        ` : ''}
                        ${canEdit ? `<button class="btn btn-sm btn-primary" data-action="add-grade" data-student-id="${studentId}"><i class="fas fa-plus"></i> 성적 입력</button>` : ''}
                    </div>
                </div>
                <div class="card-body ${studentGrades.length > 0 && this._gradeDetailView !== 'trend' ? 'no-padding' : ''}">
                    ${studentGrades.length === 0 ? '<div class="empty-state"><i class="fas fa-trophy"></i><h3>등록된 성적이 없습니다</h3><p>시험 성적을 입력해주세요.</p></div>' :
                    this._gradeDetailView === 'trend' ? `
                        <div style="height:280px"><canvas id="chart-grade-trend-detail"></canvas></div>
                    ` :
                        `<div class="table-wrapper"><table class="pivot-table">
                            <thead><tr><th>시험</th>${(() => {
                                const allSubs = new Set();
                                studentGrades.forEach(g => (g.subjects || []).forEach(s => allSubs.add(s.subject)));
                                return [...allSubs].sort().map(s => `<th>${this.escapeHtml(s)}</th>`).join('');
                            })()}<th>평균</th><th>석차</th>${canEdit ? '<th></th>' : ''}</tr></thead>
                            <tbody>${studentGrades.map(g => {
                                const allSubs = new Set();
                                studentGrades.forEach(gg => (gg.subjects || []).forEach(s => allSubs.add(s.subject)));
                                const sortedSubs = [...allSubs].sort();
                                const subMap = {};
                                (g.subjects || []).forEach(s => { subMap[s.subject] = s; });
                                const isMock = g.examType === '모의고사';
                                const examLabel = isMock ? (g.examName || '모의고사') : `${g.semester} ${g.examType}`;
                                return `<tr>
                                    <td>${this.escapeHtml(examLabel)}</td>
                                    ${sortedSubs.map(sub => {
                                        const d = subMap[sub];
                                        if (!d) return '<td style="color:var(--gray-300)">-</td>';
                                        if (isMock) {
                                            return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span> <span class="mock-grade-badge mock-grade-${d.grade}">${d.grade}등급</span>${d.standardScore ? `<br><span style="font-size:0.72rem;color:var(--gray-500)">표${d.standardScore} / 백${d.percentile || ''}</span>` : ''}</td>`;
                                        }
                                        return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span>${d.grade ? ` <span class="grade-badge grade-${d.grade}">${d.grade}등급</span>` : ''}</td>`;
                                    }).join('')}
                                    <td><strong>${g.totalAvg || '-'}</strong></td>
                                    <td style="font-size:0.82rem;color:var(--gray-500)">${this.escapeHtml(g.totalRank || '-')}</td>
                                    ${canEdit ? `<td>
                                        <button class="btn-icon" data-action="edit-grade" data-grade-id="${g.id}" title="수정"><i class="fas fa-edit"></i></button>
                                        <button class="btn-icon" data-action="delete-grade" data-grade-id="${g.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                                    </td>` : ''}
                                </tr>`;
                            }).join('')}</tbody>
                        </table></div>`}
                </div>
            </div>

            ${this.renderAttendanceMiniCard(studentId, canEdit)}

            ${this.renderExamMiniCard(studentId)}

            ${this.renderConsultationMiniCard(studentId, canEdit)}

            ${this.renderHomeworkMiniCard(studentId)}

            ${this.renderSelfJournalCard(studentId, canAddProgress)}

            <div class="card">
                <div class="card-header">
                    <h2><i class="fas fa-comments"></i> 코멘트 (${comments.length}개)</h2>
                    ${canAddComment ? `<button class="btn btn-sm btn-primary" data-action="add-comment" data-student-id="${studentId}"><i class="fas fa-plus"></i> 코멘트 작성</button>` : ''}
                </div>
                <div class="card-body" style="padding:0">
                    ${comments.length === 0 ? '<div class="empty-state" style="padding:40px"><i class="fas fa-comment-slash"></i><h3>코멘트가 없습니다</h3></div>' :
                        comments.map(c => {
                            const plan = c.planId ? DataStore.getPlan(c.planId) : null;
                            const canDeleteThis = Permissions.canDeleteComment(c);
                            // 학생에게는 수신 대상 표시 안함, 선생/원장에게만 표시
                            const recipientTags = (!isStudent && c.recipients && c.recipients.length > 0)
                                ? `<div class="comment-recipients"><i class="fas fa-share"></i> ${c.recipients.map(r => r === 'student' ? '<span class="badge badge-warning">학생</span>' : r === 'parent' ? '<span class="badge badge-success">학부모</span>' : '<span class="badge badge-danger">원장</span>').join(' ')}${!(c.recipients || []).includes('student') ? ' <span class="badge badge-gray" style="font-size:0.65rem"><i class="fas fa-lock"></i> 내부</span>' : ''}</div>`
                                : '';
                            return `<div class="comment-item">
                                <div class="comment-avatar ${c.authorRole}">${this.escapeHtml(c.author.charAt(0))}</div>
                                <div class="comment-content">
                                    <div class="comment-header">
                                        <span class="comment-author">${this.escapeHtml(c.author)}</span>
                                        ${this.getRoleBadge(c.authorRole)}
                                        <span class="comment-date">${this.formatDateTime(c.createdAt)}</span>
                                        ${canDeleteThis ? `<button class="btn-icon" data-action="delete-comment" data-comment-id="${c.id}" data-student-id="${studentId}" style="margin-left:auto;font-size:0.75rem;color:var(--gray-400)"><i class="fas fa-trash"></i></button>` : ''}
                                    </div>
                                    <div class="comment-text">${this.escapeHtml(c.content)}</div>
                                    ${recipientTags}
                                    ${plan ? `<div class="comment-plan-ref"><i class="fas fa-link"></i> ${this.escapeHtml(plan.subject)} - ${this.escapeHtml(plan.textbook)}</div>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;

        if (Object.keys(subjectProgress).length > 0) {
            setTimeout(() => {
                Charts.createSubjectBar('chart-student-bar', subjectProgress);
                Charts.createRadar('chart-student-radar', subjectProgress);
            }, 50);
        }

        // 성적 추이 차트
        if (this._gradeDetailView === 'trend' && studentGrades.length > 1) {
            setTimeout(() => {
                Charts.createGradeTrend('chart-grade-trend-detail', studentGrades);
            }, 50);
        }
    },

    // 로컬 날짜 문자열 반환 (YYYY-MM-DD) - 타임존 보정
    getLocalDateStr(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    // 학생 상세 페이지 출석 미니 카드
    renderAttendanceMiniCard(studentId, canEdit) {
        const ym = this.getLocalDateStr().slice(0, 7);
        const [year, month] = ym.split('-').map(Number);
        const stats = DataStore.getAttendanceStats(studentId, ym);
        const STATUS_COLOR = { '출석': 'var(--success)', '결석': 'var(--danger)', '지각': 'var(--warning)', '조퇴': 'var(--info)' };

        return `
        <div class="card" style="margin-bottom:20px">
            <div class="card-header">
                <h2><i class="fas fa-calendar-check"></i> ${year}년 ${month}월 출석</h2>
                ${canEdit ? `<button class="btn btn-sm btn-outline" data-action="att-input-student" data-student-id="${studentId}" data-student-name="${this.escapeHtml(DataStore.getStudent(studentId)?.name || '')}"><i class="fas fa-edit"></i> 출석 입력</button>` : ''}
            </div>
            <div class="card-body">
                ${stats.total === 0
                    ? '<div style="color:var(--gray-400);font-size:0.9rem">이번 달 출석 기록이 없습니다.</div>'
                    : `<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center">
                        ${['출석','결석','지각','조퇴'].map(st => `
                            <div style="text-align:center">
                                <div style="font-size:1.4rem;font-weight:700;color:${STATUS_COLOR[st]}">${stats[st]}</div>
                                <div style="font-size:0.78rem;color:var(--gray-500)">${st}</div>
                            </div>`).join('')}
                        <div style="margin-left:auto;text-align:center">
                            <div style="font-size:1.6rem;font-weight:800;color:${stats.rate >= 90 ? 'var(--success)' : stats.rate >= 70 ? 'var(--warning)' : 'var(--danger)'}">${stats.rate}%</div>
                            <div style="font-size:0.78rem;color:var(--gray-500)">출석률</div>
                        </div>
                    </div>`}
            </div>
        </div>`;
    },

    // 이번 주 월요일 날짜 반환 (YYYY-MM-DD)
    getWeekStart(date = new Date()) {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        return this.getLocalDateStr(d);
    },

    // 주간 자기 진도 일지 카드 HTML 생성
    renderSelfJournalCard(studentId, canWrite) {
        const week = this.getWeekStart();
        const goal = DataStore.getSelfWeeklyGoal(studentId, week);
        const journals = DataStore.getSelfJournals(studentId);
        const today = this.getLocalDateStr();

        // 이번 주 일지만 별도 표시 (나머지는 이전 기록)
        const weekEnd = new Date(week);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        const thisWeekJournals = journals.filter(j => j.date >= week && j.date <= weekEndStr);
        const prevJournals = journals.filter(j => j.date < week);

        return `
        <div class="card" style="margin-bottom:20px">
            <div class="card-header">
                <h2><i class="fas fa-book-open"></i> 자기 진도 일지</h2>
            </div>
            <div class="card-body">

                <!-- 주간 목표 -->
                <div style="margin-bottom:20px;padding:16px;background:var(--primary-light, #f0f4ff);border-radius:10px;border-left:4px solid var(--primary)">
                    <div style="font-weight:700;color:var(--primary);margin-bottom:8px"><i class="fas fa-bullseye"></i> 이번 주 목표 <span style="font-size:0.78rem;color:var(--gray-400)">(${week} 주)</span></div>
                    ${canWrite ? `
                    <div style="display:flex;gap:8px;align-items:flex-start">
                        <textarea id="self-goal-input" rows="2" class="form-control" style="flex:1;resize:vertical" placeholder="이번 주 목표를 적어보세요...">${this.escapeHtml(goal ? goal.note : '')}</textarea>
                        <button class="btn btn-primary btn-sm" data-action="set-self-goal" data-student-id="${studentId}" data-week="${week}" style="white-space:nowrap;margin-top:2px"><i class="fas fa-save"></i> 저장</button>
                    </div>` : `
                    <div style="color:var(--gray-700);white-space:pre-wrap">${goal ? this.escapeHtml(goal.note) : '<span style="color:var(--gray-400)">아직 목표가 없습니다</span>'}</div>`}
                </div>

                <!-- 진도 입력 (학생 본인만) -->
                ${canWrite ? `
                <div style="margin-bottom:20px">
                    <div style="font-weight:600;color:var(--gray-700);margin-bottom:10px"><i class="fas fa-pen"></i> 오늘의 진도 기록</div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        <input type="date" id="self-journal-date" class="form-control" value="${today}" style="max-width:180px">
                        <textarea id="self-journal-note" rows="3" class="form-control" placeholder="오늘 공부한 내용을 자유롭게 적어보세요. (예: 수학 P.120~135, 영어 단어 50개)"></textarea>
                        <div><button class="btn btn-success btn-sm" data-action="add-self-journal" data-student-id="${studentId}"><i class="fas fa-plus"></i> 기록 추가</button></div>
                    </div>
                </div>` : ''}

                <!-- 이번 주 기록 -->
                <div style="margin-bottom:16px">
                    <div style="font-weight:600;color:var(--gray-600);margin-bottom:10px;font-size:0.9rem"><i class="fas fa-calendar-week"></i> 이번 주 기록 (${thisWeekJournals.length}건)</div>
                    ${thisWeekJournals.length === 0
                        ? '<div style="color:var(--gray-400);font-size:0.88rem;padding:8px 0">아직 이번 주 기록이 없습니다.</div>'
                        : thisWeekJournals.map(j => `
                        <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
                            <div style="min-width:90px;font-size:0.82rem;color:var(--gray-500);padding-top:2px">${j.date}</div>
                            <div style="flex:1;white-space:pre-wrap;font-size:0.92rem">${this.escapeHtml(j.note)}</div>
                            ${canWrite ? `<button class="btn-icon" data-action="delete-self-journal" data-journal-id="${j.id}" data-student-id="${studentId}" title="삭제" style="color:var(--danger);font-size:0.8rem"><i class="fas fa-trash"></i></button>` : ''}
                        </div>`).join('')}
                </div>

                <!-- 이전 기록 -->
                ${prevJournals.length > 0 ? `
                <details>
                    <summary style="cursor:pointer;font-size:0.88rem;color:var(--gray-500);margin-bottom:8px"><i class="fas fa-history"></i> 이전 기록 (${prevJournals.length}건)</summary>
                    ${prevJournals.slice(0, 30).map(j => `
                    <div style="display:flex;align-items:flex-start;gap:12px;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                        <div style="min-width:90px;font-size:0.82rem;color:var(--gray-500);padding-top:2px">${j.date}</div>
                        <div style="flex:1;white-space:pre-wrap;font-size:0.88rem;color:var(--gray-600)">${this.escapeHtml(j.note)}</div>
                        ${canWrite ? `<button class="btn-icon" data-action="delete-self-journal" data-journal-id="${j.id}" data-student-id="${studentId}" title="삭제" style="color:var(--danger);font-size:0.8rem"><i class="fas fa-trash"></i></button>` : ''}
                    </div>`).join('')}
                </details>` : ''}

            </div>
        </div>`;
    },

    renderPlanTimeline(plan) {
        const entries = DataStore.getPlanProgress(plan.id);
        if (entries.length === 0) return '';
        const canvasId = `chart-timeline-${plan.id}`;
        setTimeout(() => Charts.createTimeline(canvasId, entries, plan), 100);
        return `<div style="margin-top:16px;border-top:1px solid var(--gray-100);padding-top:16px">
            <div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:8px"><i class="fas fa-chart-line"></i> 진도 추이</div>
            <div class="chart-container-sm"><canvas id="${canvasId}"></canvas></div>
        </div>`;
    },

    // =========================================
    //  VIEW: PLANS LIST
    // =========================================
    renderPlans() {
        const visibleIds = this.getVisibleStudentIds();
        const plans = DataStore.getPlans().filter(p => visibleIds.includes(p.studentId));
        const subjects = [...new Set(plans.map(p => p.subject))].sort();
        const students = this.getVisibleStudents();

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-plan-student" onchange="App.filterPlans()">
                        <option value="">전체 학생</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-plan-subject" onchange="App.filterPlans()">
                        <option value="">전체 과목</option>
                        ${subjects.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-plan-status" onchange="App.filterPlans()">
                        <option value="">전체 상태</option>
                        <option value="active">진행 중</option>
                        <option value="completed">완료</option>
                        <option value="paused">일시중지</option>
                    </select>
                </div>
            </div>

            <div id="plans-container">
                ${this.renderPlanCards(plans)}
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    renderPlanCards(plans) {
        if (plans.length === 0) return '<div class="empty-state"><i class="fas fa-book"></i><h3>학습 계획이 없습니다</h3></div>';

        return plans.map(plan => {
            const student = DataStore.getStudent(plan.studentId);
            const pct = plan.totalUnits > 0 ? Math.round((plan.completedUnits / plan.totalUnits) * 100) : 0;
            const isChecklist = plan.trackingMode === 'checklist';
            return `<div class="plan-card">
                <div class="plan-card-header">
                    <div class="plan-card-title">
                        <h3>${this.escapeHtml(plan.subject)}</h3>
                        ${this.getStatusBadge(plan.status)}
                        ${this.getDifficultyBadge(plan.difficulty)}
                        ${isChecklist ? '<span class="badge badge-info" style="font-size:0.68rem"><i class="fas fa-tasks"></i> 단원별</span>' : ''}
                    </div>
                    <div class="plan-card-actions">
                        ${!isChecklist ? `<button class="btn btn-sm btn-success" data-action="add-progress" data-plan-id="${plan.id}" data-student-id="${plan.studentId}"><i class="fas fa-plus"></i> 진도</button>` : ''}
                        <button class="btn btn-sm btn-outline" data-action="edit-plan" data-plan-id="${plan.id}" data-student-id="${plan.studentId}"><i class="fas fa-edit"></i></button>
                    </div>
                </div>
                <div class="plan-card-meta">
                    ${student ? `<span><i class="fas fa-user"></i> <span class="student-name" data-action="view-student" data-id="${student.id}">${this.escapeHtml(student.name)}</span></span>` : ''}
                    <span><i class="fas fa-book"></i> ${this.escapeHtml(plan.textbook)}</span>
                    <span><i class="fas fa-calendar-check"></i> 체크기간: ${this.formatDate(plan.startDate)} ~ ${this.formatDate(plan.endDate)}</span>
                    <span><i class="fas fa-bullseye"></i> ${this.escapeHtml(plan.planType)}</span>
                </div>
                <div class="progress-item">
                    <div class="progress-label">
                        <span>${plan.completedUnits} / ${plan.totalUnits} ${this.escapeHtml(plan.unitLabel)}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar ${this.getProgressColor(pct)}" style="width:${pct}%"></div>
                    </div>
                </div>
                ${isChecklist && plan.checklistItems ? `
                    <div class="checklist-display">
                        ${plan.checklistItems.map((item, ci) => `
                            <label class="checklist-item ${item.completed ? 'completed' : ''}" data-plan-id="${plan.id}" data-ci="${ci}">
                                <input type="checkbox" ${item.completed ? 'checked' : ''} data-action="toggle-checklist" data-plan-id="${plan.id}" data-ci="${ci}">
                                <span>${this.escapeHtml(item.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                ` : ''}
            </div>`;
        }).join('');
    },

    filterPlans() {
        const studentId = document.getElementById('filter-plan-student').value;
        const subject = document.getElementById('filter-plan-subject').value;
        const status = document.getElementById('filter-plan-status').value;

        const visibleIds = this.getVisibleStudentIds();
        let plans = DataStore.getPlans().filter(p => visibleIds.includes(p.studentId));
        if (studentId) plans = plans.filter(p => p.studentId === studentId);
        if (subject) plans = plans.filter(p => p.subject === subject);
        if (status) plans = plans.filter(p => p.status === status);

        document.getElementById('plans-container').innerHTML = this.renderPlanCards(plans);
    },

    // =========================================
    //  VIEW: PROGRESS
    // =========================================
    renderProgress() {
        const students = this.getVisibleStudents();
        const visibleIds = students.map(s => s.id);
        const allProgress = DataStore.getProgressEntries()
            .filter(p => visibleIds.includes(p.studentId) && p.planId !== 'self_journal' && p.planId !== 'self_goal')
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 30);

        const html = `
            <div class="grid-2">
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-plus-circle"></i> 진도 빠른 입력</h2></div>
                    <div class="card-body">
                        <form id="quick-progress-form" onsubmit="App.handleQuickProgress(event)">
                            <div class="form-group">
                                <label>학생 <span class="required">*</span></label>
                                <select class="form-control" id="qp-student" required onchange="App.loadStudentPlansForQuickProgress()">
                                    <option value="">학생 선택</option>
                                    ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)})</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>학습 계획 <span class="required">*</span></label>
                                <select class="form-control" id="qp-plan" required>
                                    <option value="">학생을 먼저 선택하세요</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>진행량 <span class="required">*</span></label>
                                    <input type="number" class="form-control" id="qp-amount" min="1" required placeholder="숫자 입력">
                                </div>
                                <div class="form-group">
                                    <label>날짜 <span class="required">*</span></label>
                                    <input type="date" class="form-control" id="qp-date" required value="${new Date().toISOString().split('T')[0]}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>메모</label>
                                <input type="text" class="form-control" id="qp-note" placeholder="학습 내용 메모">
                            </div>
                            <button type="submit" class="btn btn-primary" style="width:100%"><i class="fas fa-save"></i> 진도 기록</button>
                        </form>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-history"></i> 최근 진도 기록</h2></div>
                    <div class="card-body" style="padding:0;max-height:500px;overflow-y:auto">
                        ${allProgress.length === 0 ? '<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>진도 기록이 없습니다</h3></div>' :
                            `<table>
                                <thead><tr><th>날짜</th><th>학생</th><th>과목</th><th>진행량</th><th>메모</th></tr></thead>
                                <tbody>${allProgress.map(p => {
                                    const student = DataStore.getStudent(p.studentId);
                                    const plan = DataStore.getPlan(p.planId);
                                    return `<tr>
                                        <td>${this.formatDate(p.date)}</td>
                                        <td>${student ? `<span class="student-name" data-action="view-student" data-id="${student.id}">${this.escapeHtml(student.name)}</span>` : '-'}</td>
                                        <td>${plan ? this.escapeHtml(plan.subject) : '-'}</td>
                                        <td><strong>${p.amount}</strong> ${plan ? this.escapeHtml(plan.unitLabel) : ''}</td>
                                        <td style="color:var(--gray-500)">${this.escapeHtml(p.note || '')}</td>
                                    </tr>`;
                                }).join('')}</tbody>
                            </table>`}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    loadStudentPlansForQuickProgress() {
        const studentId = document.getElementById('qp-student').value;
        const planSelect = document.getElementById('qp-plan');
        if (!studentId) {
            planSelect.innerHTML = '<option value="">학생을 먼저 선택하세요</option>';
            return;
        }
        const plans = DataStore.getStudentPlans(studentId).filter(p => p.status === 'active');
        planSelect.innerHTML = '<option value="">계획 선택</option>' + plans.map(p => {
            const pct = p.totalUnits > 0 ? Math.round((p.completedUnits / p.totalUnits) * 100) : 0;
            return `<option value="${p.id}">${this.escapeHtml(p.subject)} - ${this.escapeHtml(p.textbook)} (${pct}%)</option>`;
        }).join('');
    },

    handleQuickProgress(e) {
        e.preventDefault();
        const studentId = document.getElementById('qp-student').value;
        const planId = document.getElementById('qp-plan').value;
        const amount = parseInt(document.getElementById('qp-amount').value);
        const date = document.getElementById('qp-date').value;
        const note = document.getElementById('qp-note').value;

        if (!studentId || !planId || !amount || !date) return;

        DataStore.addProgressEntry({ studentId, planId, amount, date, note }).then(() => {
            this.toast('진도가 기록되었습니다!', 'success');
            this.renderProgress();
        }).catch(err => {
            this.toast('진도 저장 실패: ' + err.message, 'error');
        });
    },

    // =========================================
    //  VIEW: COMMENTS
    // =========================================
    renderComments() {
        const visibleIds = this.getVisibleStudentIds();
        // 권한 기반 코멘트 필터링
        const comments = Permissions.filterVisibleComments(
            DataStore.getComments().filter(c => visibleIds.includes(c.studentId))
        ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const students = this.getVisibleStudents();
        const isStudent = Permissions.isStudent();

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-comment-student" onchange="App.filterComments()">
                        <option value="">전체 학생</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    ${!isStudent ? `<select class="filter-select" id="filter-comment-role" onchange="App.filterComments()">
                        <option value="">전체 역할</option>
                        <option value="teacher">선생님</option>
                        <option value="parent">학부모</option>
                        <option value="student">학생</option>
                        <option value="admin">관리자</option>
                    </select>` : ''}
                    <span style="color:var(--gray-500);font-size:0.85rem">${comments.length}개</span>
                </div>
            </div>

            <div class="card">
                <div class="card-body" style="padding:0" id="comments-container">
                    ${this.renderCommentList(comments, isStudent)}
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    renderCommentList(comments, isStudentView = false) {
        if (comments.length === 0) return '<div class="empty-state"><i class="fas fa-comment-slash"></i><h3>코멘트가 없습니다</h3></div>';
        const isStudent = isStudentView || Permissions.isStudent();
        return comments.map(c => {
            const student = DataStore.getStudent(c.studentId);
            const plan = c.planId ? DataStore.getPlan(c.planId) : null;
            const canDeleteThis = Permissions.canDeleteComment(c);
            // 학생에게는 수신 대상 표시 안함, 선생/원장에게만 표시
            const isInternal = !(c.recipients || []).includes('student');
            const recipientTags = (!isStudent && c.recipients && c.recipients.length > 0)
                ? `<div class="comment-recipients"><i class="fas fa-share"></i> ${c.recipients.map(r => r === 'student' ? '<span class="badge badge-warning">학생</span>' : r === 'parent' ? '<span class="badge badge-success">학부모</span>' : '<span class="badge badge-danger">원장</span>').join(' ')}${isInternal ? ' <span class="badge badge-gray" style="font-size:0.65rem"><i class="fas fa-lock"></i> 내부</span>' : ''}</div>`
                : '';
            return `<div class="comment-item">
                <div class="comment-avatar ${c.authorRole}">${this.escapeHtml(c.author.charAt(0))}</div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${this.escapeHtml(c.author)}</span>
                        ${this.getRoleBadge(c.authorRole)}
                        ${student ? `<span style="color:var(--gray-400)">→</span> <span class="student-name" data-action="view-student" data-id="${student.id}" style="font-size:0.85rem">${this.escapeHtml(student.name)}</span>` : ''}
                        <span class="comment-date">${this.formatDateTime(c.createdAt)}</span>
                        ${canDeleteThis ? `<button class="btn-icon" data-action="delete-comment" data-comment-id="${c.id}" style="margin-left:auto;font-size:0.75rem;color:var(--gray-400)"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                    <div class="comment-text">${this.escapeHtml(c.content)}</div>
                    ${recipientTags}
                    ${plan ? `<div class="comment-plan-ref"><i class="fas fa-link"></i> ${this.escapeHtml(plan.subject)} - ${this.escapeHtml(plan.textbook)}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    },

    filterComments() {
        const studentId = document.getElementById('filter-comment-student').value;
        const roleEl = document.getElementById('filter-comment-role');
        const role = roleEl ? roleEl.value : '';
        const visibleIds = this.getVisibleStudentIds();
        // 권한 기반 필터링
        let comments = Permissions.filterVisibleComments(
            DataStore.getComments().filter(c => visibleIds.includes(c.studentId))
        ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        if (studentId) comments = comments.filter(c => c.studentId === studentId);
        if (role) comments = comments.filter(c => c.authorRole === role);
        document.getElementById('comments-container').innerHTML = this.renderCommentList(comments);
    },

    // =========================================
    //  VIEW: GRADES (성적 관리)
    // =========================================
    _gradesSortCol: null,
    _gradesSortAsc: true,
    _gradesViewMode: 'table', // 'table' | 'pivot' | 'chart'

    renderGrades() {
        const students = this.getVisibleStudents();
        const visibleIds = students.map(s => s.id);
        const allGrades = DataStore.getGrades().filter(g => visibleIds.includes(g.studentId));

        const semesters = [...new Set(allGrades.map(g => g.semester))].sort();
        const examTypes = [...new Set(allGrades.map(g => g.examType))];
        const subjects = [...new Set(allGrades.flatMap(g => (g.subjects || []).map(s => s.subject)))].sort();

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-grade-student" onchange="App.filterGrades()">
                        <option value="">전체 학생</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-grade-semester" onchange="App.filterGrades()">
                        <option value="">전체 학기</option>
                        ${semesters.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-grade-exam" onchange="App.filterGrades()">
                        <option value="">전체 시험</option>
                        ${examTypes.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-grade-subject" onchange="App.filterGrades()">
                        <option value="">전체 과목</option>
                        ${subjects.map(s => `<option value="${this.escapeHtml(s)}">${this.escapeHtml(s)}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-primary" data-action="add-grade"><i class="fas fa-plus"></i> 시험 성적 입력</button>
            </div>

            <div class="grades-view-tabs">
                <button class="grades-tab ${this._gradesViewMode === 'table' ? 'active' : ''}" data-action="grades-view-mode" data-mode="table"><i class="fas fa-table"></i> 테이블</button>
                <button class="grades-tab ${this._gradesViewMode === 'pivot' ? 'active' : ''}" data-action="grades-view-mode" data-mode="pivot"><i class="fas fa-th"></i> 피벗</button>
                <button class="grades-tab ${this._gradesViewMode === 'chart' ? 'active' : ''}" data-action="grades-view-mode" data-mode="chart"><i class="fas fa-chart-line"></i> 차트</button>
            </div>

            <div id="grades-container"></div>
        `;

        document.getElementById('content-area').innerHTML = html;
        this.filterGrades();
    },

    filterGrades() {
        const studentId = (document.getElementById('filter-grade-student') || {}).value || '';
        const semester = (document.getElementById('filter-grade-semester') || {}).value || '';
        const examType = (document.getElementById('filter-grade-exam') || {}).value || '';
        const subjectFilter = (document.getElementById('filter-grade-subject') || {}).value || '';

        const visibleIds = this.getVisibleStudentIds();
        let grades = DataStore.getGrades().filter(g => visibleIds.includes(g.studentId));

        if (studentId) grades = grades.filter(g => g.studentId === studentId);
        if (semester) grades = grades.filter(g => g.semester === semester);
        if (examType) grades = grades.filter(g => g.examType === examType);
        if (subjectFilter) grades = grades.filter(g => (g.subjects || []).some(s => s.subject === subjectFilter));

        const container = document.getElementById('grades-container');
        if (!container) return;

        switch (this._gradesViewMode) {
            case 'table': container.innerHTML = this.renderGradesTable(grades, subjectFilter); break;
            case 'pivot': container.innerHTML = this.renderGradesPivot(grades, subjectFilter); break;
            case 'chart': container.innerHTML = this.renderGradesChart(grades, subjectFilter);
                setTimeout(() => this.drawGradesCharts(grades, subjectFilter), 50);
                break;
        }
    },

    // --- Table View ---
    renderGradesTable(grades, subjectFilter) {
        // Flatten to rows
        let rows = [];
        grades.forEach(g => {
            const student = DataStore.getStudent(g.studentId);
            let subs = g.subjects || [];
            if (subjectFilter) subs = subs.filter(s => s.subject === subjectFilter);
            const isMock = g.examType === '모의고사';
            subs.forEach(s => {
                rows.push({
                    gradeId: g.id, studentName: student ? student.name : '-', studentId: g.studentId,
                    semester: g.semester || '', examType: g.examType, examDate: g.examDate,
                    examName: g.examName || '', isMock,
                    subject: s.subject, score: s.score, grade: s.grade,
                    rank: s.rank || '-', achievement: s.achievement || '',
                    standardScore: s.standardScore || '', percentile: s.percentile || '',
                    totalAvg: g.totalAvg || 0, totalRank: g.totalRank || '-'
                });
            });
        });

        // Sort
        if (this._gradesSortCol) {
            const col = this._gradesSortCol;
            const asc = this._gradesSortAsc;
            rows.sort((a, b) => {
                let va = a[col], vb = b[col];
                if (col === 'score' || col === 'totalAvg' || col === 'standardScore' || col === 'percentile') { va = Number(va) || 0; vb = Number(vb) || 0; }
                else { va = String(va); vb = String(vb); }
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                return 0;
            });
        }

        if (rows.length === 0) return '<div class="card"><div class="empty-state"><i class="fas fa-trophy"></i><h3>성적 데이터가 없습니다</h3><p>시험 성적을 입력해주세요.</p></div></div>';

        const sortIcon = (col) => {
            if (this._gradesSortCol !== col) return '<i class="fas fa-sort" style="opacity:0.3"></i>';
            return this._gradesSortAsc ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        };

        const hasMock = rows.some(r => r.isMock);

        return `<div class="card"><div class="card-body no-padding"><div class="table-wrapper">
            <table id="grades-table">
                <thead><tr>
                    <th class="sortable" data-action="sort-grades" data-col="studentName">학생 ${sortIcon('studentName')}</th>
                    <th class="sortable" data-action="sort-grades" data-col="examType">시험 ${sortIcon('examType')}</th>
                    <th class="sortable" data-action="sort-grades" data-col="subject">과목 ${sortIcon('subject')}</th>
                    <th class="sortable" data-action="sort-grades" data-col="score">원점수 ${sortIcon('score')}</th>
                    <th class="sortable" data-action="sort-grades" data-col="grade">등급 ${sortIcon('grade')}</th>
                    <th>성취도</th>
                    <th>석차</th>
                    ${hasMock ? `<th class="sortable" data-action="sort-grades" data-col="standardScore">표준점수 ${sortIcon('standardScore')}</th>
                    <th class="sortable" data-action="sort-grades" data-col="percentile">백분위 ${sortIcon('percentile')}</th>` : ''}
                    <th class="sortable" data-action="sort-grades" data-col="totalAvg">전체평균 ${sortIcon('totalAvg')}</th>
                    <th>전체석차</th>
                    <th>관리</th>
                </tr></thead>
                <tbody>${rows.map(r => {
                    const examLabel = r.isMock ? (r.examName || '모의고사') : `${r.semester} ${r.examType}`;
                    const gradeDisplay = r.isMock
                        ? `<span class="mock-grade-badge mock-grade-${r.grade}">${r.grade}등급</span>`
                        : (r.grade ? `<span class="grade-badge grade-${r.grade}">${r.grade}등급</span>` : '-');
                    return `<tr>
                    <td><span class="student-name" data-action="view-student" data-id="${r.studentId}">${this.escapeHtml(r.studentName)}</span></td>
                    <td>${this.escapeHtml(examLabel)}</td>
                    <td><strong>${this.escapeHtml(r.subject)}</strong></td>
                    <td><span class="grade-score ${r.score >= 90 ? 'high' : r.score >= 70 ? 'mid' : 'low'}">${r.score}</span></td>
                    <td>${gradeDisplay}</td>
                    <td style="font-size:0.85rem;font-weight:600">${r.isMock ? '-' : (r.achievement || '-')}</td>
                    <td style="color:var(--gray-500);font-size:0.82rem">${r.isMock ? '-' : this.escapeHtml(r.rank)}</td>
                    ${hasMock ? `<td style="color:var(--gray-600);font-size:0.85rem">${r.isMock && r.standardScore ? r.standardScore : '-'}</td>
                    <td style="color:var(--gray-600);font-size:0.85rem">${r.isMock && r.percentile ? r.percentile : '-'}</td>` : ''}
                    <td><strong>${r.totalAvg}</strong></td>
                    <td style="color:var(--gray-500);font-size:0.82rem">${this.escapeHtml(r.totalRank)}</td>
                    <td>
                        <button class="btn-icon" data-action="edit-grade" data-grade-id="${r.gradeId}" title="수정"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="delete-grade" data-grade-id="${r.gradeId}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`}).join('')}</tbody>
            </table>
        </div></div></div>`;
    },

    // --- Pivot View ---
    renderGradesPivot(grades, subjectFilter) {
        // Build pivot: rows = subjects, cols = semester+exam
        const exams = [];
        const examSet = new Set();
        grades.forEach(g => {
            const key = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
            if (!examSet.has(key)) { examSet.add(key); exams.push({ key, semester: g.semester, examType: g.examType, isMock: g.examType === '모의고사' }); }
        });

        const subjectSet = new Set();
        grades.forEach(g => (g.subjects || []).forEach(s => {
            if (!subjectFilter || s.subject === subjectFilter) subjectSet.add(s.subject);
        }));
        const subjects = [...subjectSet].sort();

        // Group by student
        const studentIds = [...new Set(grades.map(g => g.studentId))];

        if (subjects.length === 0 || exams.length === 0) return '<div class="card"><div class="empty-state"><i class="fas fa-th"></i><h3>피벗 표시할 데이터가 없습니다</h3></div></div>';

        let html = '';
        studentIds.forEach(sid => {
            const student = DataStore.getStudent(sid);
            const sGrades = grades.filter(g => g.studentId === sid);

            // Build lookup: examKey -> subject -> {score, grade, standardScore, percentile}
            const lookup = {};
            const examMockMap = {};
            sGrades.forEach(g => {
                const key = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
                examMockMap[key] = g.examType === '모의고사';
                (g.subjects || []).forEach(s => {
                    if (!subjectFilter || s.subject === subjectFilter) {
                        if (!lookup[key]) lookup[key] = {};
                        lookup[key][s.subject] = s;
                    }
                });
            });

            const studentExams = exams.filter(e => sGrades.some(g => {
                const k = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
                return k === e.key;
            }));
            if (studentExams.length === 0) return;

            html += `<div class="card" style="margin-bottom:16px">
                <div class="card-header"><h2><i class="fas fa-user-graduate"></i> ${this.escapeHtml(student ? student.name : '-')} 
                    <span style="font-size:0.8rem;color:var(--gray-500);font-weight:400">${student ? this.escapeHtml(student.grade) + ' ' + this.escapeHtml(student.className) : ''}</span></h2>
                </div>
                <div class="card-body no-padding"><div class="table-wrapper">
                    <table class="pivot-table">
                        <thead><tr><th>과목</th>${studentExams.map(e => `<th>${this.escapeHtml(e.key)}</th>`).join('')}<th>추이</th></tr></thead>
                        <tbody>${subjects.map(sub => {
                            const scores = studentExams.map(e => (lookup[e.key] && lookup[e.key][sub]) ? lookup[e.key][sub].score : null);
                            const validScores = scores.filter(s => s != null);
                            let trend = '';
                            if (validScores.length >= 2) {
                                const diff = validScores[validScores.length - 1] - validScores[0];
                                trend = diff > 0 ? `<span class="trend-up">📈 +${diff}</span>` : diff < 0 ? `<span class="trend-down">📉 ${diff}</span>` : `<span class="trend-flat">→ 0</span>`;
                            }
                            return `<tr>
                                <td><strong>${this.escapeHtml(sub)}</strong></td>
                                ${studentExams.map(e => {
                                    const d = lookup[e.key] && lookup[e.key][sub];
                                    if (!d) return '<td style="color:var(--gray-300)">-</td>';
                                    const isMock = examMockMap[e.key];
                                    if (isMock) {
                                        return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span> <span class="mock-grade-badge mock-grade-${d.grade}">${d.grade}등급</span>${d.standardScore ? `<br><span style="font-size:0.72rem;color:var(--gray-500)">표${d.standardScore} / 백${d.percentile || ''}</span>` : ''}</td>`;
                                    }
                                    return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span>${d.grade ? ` <span class="grade-badge grade-${d.grade}">${d.grade}등급</span>` : ''}</td>`;
                                }).join('')}
                                <td>${trend}</td>
                            </tr>`;
                        }).join('')}</tbody>
                    </table>
                </div></div>
            </div>`;
        });

        return html || '<div class="card"><div class="empty-state"><i class="fas fa-th"></i><h3>피벗 표시할 데이터가 없습니다</h3></div></div>';
    },

    // --- Chart View ---
    renderGradesChart(grades, subjectFilter) {
        return `<div class="grid-2">
            <div class="card"><div class="card-header"><h2><i class="fas fa-chart-line"></i> 과목별 점수 추이</h2></div>
                <div class="card-body"><div class="chart-container"><canvas id="chart-grades-trend"></canvas></div></div>
            </div>
            <div class="card"><div class="card-header"><h2><i class="fas fa-chart-bar"></i> 시험별 평균 비교</h2></div>
                <div class="card-body"><div class="chart-container"><canvas id="chart-grades-avg"></canvas></div></div>
            </div>
        </div>`;
    },

    drawGradesCharts(grades, subjectFilter) {
        // Trend chart: line per subject over exams
        const exams = [];
        const examSet = new Set();
        grades.forEach(g => {
            const key = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
            if (!examSet.has(key)) { examSet.add(key); exams.push(key); }
        });

        const subjectSet = new Set();
        grades.forEach(g => (g.subjects || []).forEach(s => {
            if (!subjectFilter || s.subject === subjectFilter) subjectSet.add(s.subject);
        }));
        const subjects = [...subjectSet].sort();

        const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];

        // Trend line chart
        const trendCanvas = document.getElementById('chart-grades-trend');
        if (trendCanvas && exams.length > 0) {
            const datasets = subjects.map((sub, i) => {
                const data = exams.map(examKey => {
                    const matching = grades.filter(g => {
                        const k = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
                        return k === examKey;
                    });
                    const scores = matching.flatMap(g => (g.subjects || []).filter(s => s.subject === sub).map(s => s.score));
                    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
                });
                return { label: sub, data, borderColor: colors[i % colors.length], backgroundColor: colors[i % colors.length] + '20', tension: 0.3, fill: false, spanGaps: true };
            });
            Charts.destroyAll();
            new Chart(trendCanvas, { type: 'line', data: { labels: exams, datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { position: 'bottom' } } } });
        }

        // Avg bar chart
        const avgCanvas = document.getElementById('chart-grades-avg');
        if (avgCanvas && exams.length > 0) {
            const avgData = exams.map(examKey => {
                const matching = grades.filter(g => {
                    const k = g.examType === '모의고사' ? (g.examName || `모의고사 ${g.examDate || ''}`) : `${g.semester} ${g.examType}`;
                    return k === examKey;
                });
                const avgs = matching.map(g => g.totalAvg || 0).filter(a => a > 0);
                return avgs.length > 0 ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length * 10) / 10 : 0;
            });
            new Chart(avgCanvas, { type: 'bar', data: { labels: exams, datasets: [{ label: '전체 평균', data: avgData, backgroundColor: colors.slice(0, exams.length).map(c => c + '80'), borderColor: colors.slice(0, exams.length), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } }, plugins: { legend: { display: false } } } });
        }
    },

    // --- Grade Form (Matrix input) ---
    showGradeForm(gradeObj = null) {
        const isEdit = !!gradeObj;
        const students = this.getVisibleStudents();
        const isMock = isEdit && gradeObj.examType === '모의고사';
        const existingSubjects = isEdit && gradeObj.subjects ? gradeObj.subjects : [
            { subject: '수학', score: '', grade: '', achievement: '', rank: '', standardScore: '', percentile: '' },
            { subject: '영어', score: '', grade: '', achievement: '', rank: '', standardScore: '', percentile: '' },
            { subject: '국어', score: '', grade: '', achievement: '', rank: '', standardScore: '', percentile: '' }
        ];

        const gradeOptions9 = ['1','2','3','4','5','6','7','8','9'];
        const gradeOptions5 = ['1','2','3','4','5'];
        const currentGradeSystem = isEdit && gradeObj.gradeSystem ? gradeObj.gradeSystem : '9';

        const getGradeOpts = (mock, system) => {
            if (mock) return gradeOptions9;
            return system === '5' ? gradeOptions5 : gradeOptions9;
        };

        const buildMatrixRow = (s, i, mock, gradeSystem) => {
            const gradeOpts = getGradeOpts(mock, gradeSystem);
            if (mock) {
                return `<div class="grade-matrix-row mock" data-idx="${i}">
                    <input type="text" class="form-control" name="sub_name_${i}" value="${this.escapeHtml(s.subject)}" placeholder="과목명" list="subject-list-g">
                    <input type="number" class="form-control" name="sub_score_${i}" value="${s.score !== '' && s.score != null ? s.score : ''}" placeholder="원점수" min="0" max="100">
                    <select class="form-control" name="sub_grade_${i}">
                        <option value="">등급</option>
                        ${gradeOpts.map(g => `<option value="${g}" ${String(s.grade) === g ? 'selected' : ''}>${g}등급</option>`).join('')}
                    </select>
                    <input type="number" class="form-control" name="sub_std_${i}" value="${s.standardScore || ''}" placeholder="표준점수">
                    <input type="number" class="form-control" name="sub_pct_${i}" value="${s.percentile || ''}" placeholder="백분위" min="0" max="100">
                    <button type="button" class="btn-icon grade-remove-row" title="삭제"><i class="fas fa-times"></i></button>
                </div>`;
            }
            return `<div class="grade-matrix-row" data-idx="${i}">
                <input type="text" class="form-control" name="sub_name_${i}" value="${this.escapeHtml(s.subject)}" placeholder="과목명" list="subject-list-g">
                <input type="number" class="form-control" name="sub_score_${i}" value="${s.score !== '' && s.score != null ? s.score : ''}" placeholder="원점수" min="0" max="100">
                <select class="form-control" name="sub_grade_${i}">
                    <option value="">등급</option>
                    ${gradeOpts.map(g => `<option value="${g}" ${String(s.grade) === g ? 'selected' : ''}>${g}등급</option>`).join('')}
                </select>
                <select class="form-control" name="sub_achv_${i}">
                    <option value="">성취도</option>
                    ${['A','B','C'].map(a => `<option value="${a}" ${s.achievement === a ? 'selected' : ''}>${a}</option>`).join('')}
                </select>
                <div class="rank-input-group">
                    <input type="number" class="form-control" name="sub_rank_${i}" value="${(() => { const p = (s.rank || '').split('/'); return p[0] ? p[0].trim() : ''; })()}" placeholder="석차" min="1">
                    <span>/</span>
                    <input type="number" class="form-control" name="sub_total_${i}" value="${(() => { const p = (s.rank || '').split('/'); return p[1] ? p[1].trim() : ''; })()}" placeholder="전체" min="1">
                </div>
                <button type="button" class="btn-icon grade-remove-row" title="삭제"><i class="fas fa-times"></i></button>
            </div>`;
        };

        const html = `
            <form id="grade-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>학생 <span class="required">*</span></label>
                        <select class="form-control" name="studentId" required ${isEdit ? 'disabled' : ''}>
                            <option value="">선택</option>
                            ${students.map(s => `<option value="${s.id}" ${isEdit && gradeObj.studentId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>시험일</label>
                        <input type="date" class="form-control" name="examDate" value="${isEdit ? gradeObj.examDate || '' : new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="form-row-3">
                    <div class="form-group">
                        <label>시험 유형 <span class="required">*</span></label>
                        <select class="form-control" name="examType" required id="grade-exam-type">
                            <option value="중간고사" ${isEdit && gradeObj.examType === '중간고사' ? 'selected' : ''}>중간고사</option>
                            <option value="기말고사" ${isEdit && gradeObj.examType === '기말고사' ? 'selected' : ''}>기말고사</option>
                            <option value="모의고사" ${isEdit && gradeObj.examType === '모의고사' ? 'selected' : ''}>모의고사</option>
                        </select>
                    </div>
                    <div class="form-group" id="grade-semester-group" ${isMock ? 'style="display:none"' : ''}>
                        <label>학기 <span class="required">*</span></label>
                        <select class="form-control" name="semester">
                            <option value="1학기" ${isEdit && gradeObj.semester === '1학기' ? 'selected' : ''}>1학기</option>
                            <option value="2학기" ${isEdit && gradeObj.semester === '2학기' ? 'selected' : ''}>2학기</option>
                        </select>
                    </div>
                    <div class="form-group" id="grade-examname-group" ${!isMock ? 'style="display:none"' : ''}>
                        <label>시험명</label>
                        <input type="text" class="form-control" name="examName" value="${isEdit ? this.escapeHtml(gradeObj.examName || '') : ''}" placeholder="예: 6월 모의고사">
                    </div>
                    <div class="form-group" id="grade-rank-group" ${isMock ? 'style="display:none"' : ''}>
                        <label>전체 석차</label>
                        <input type="text" class="form-control" name="totalRank" value="${isEdit ? this.escapeHtml(gradeObj.totalRank || '') : ''}" placeholder="예: 15/180">
                    </div>
                </div>

                <div class="grade-matrix-header">
                    <h3><i class="fas fa-th"></i> 과목별 성적</h3>
                    <div style="display:flex;align-items:center;gap:10px">
                        <div id="grade-system-group" ${isMock ? 'style="display:none"' : 'style="display:flex;align-items:center;gap:6px"'}>
                            <label style="font-size:0.82rem;font-weight:600;color:var(--gray-600);white-space:nowrap">등급제</label>
                            <select class="form-control" name="gradeSystem" id="grade-system-select" style="width:auto;padding:5px 10px;font-size:0.82rem">
                                <option value="9" ${currentGradeSystem === '9' ? 'selected' : ''}>9등급제</option>
                                <option value="5" ${currentGradeSystem === '5' ? 'selected' : ''}>5등급제</option>
                            </select>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline" id="btn-add-subject-row"><i class="fas fa-plus"></i> 과목 추가</button>
                    </div>
                </div>
                <div class="grade-matrix" id="grade-matrix">
                    <div class="grade-matrix-labels ${isMock ? 'mock' : ''}" id="grade-matrix-labels">
                        ${isMock
                            ? '<span>과목</span><span>원점수</span><span>등급</span><span>표준점수</span><span>백분위</span><span></span>'
                            : '<span>과목</span><span>원점수</span><span>등급</span><span>성취도</span><span>석차/전체</span><span></span>'}
                    </div>
                    ${existingSubjects.map((s, i) => buildMatrixRow(s, i, isMock, currentGradeSystem)).join('')}
                </div>
                <datalist id="subject-list-g">
                    <option value="수학"><option value="영어"><option value="국어"><option value="과학"><option value="사회"><option value="한국사"><option value="물리"><option value="화학"><option value="생물"><option value="지구과학">
                </datalist>

                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '저장'}</button>
                </div>
                ${isEdit ? `<input type="hidden" name="gradeId" value="${gradeObj.id}">` : ''}
            </form>
        `;

        this.openModal(isEdit ? '시험 성적 수정' : '시험 성적 입력', html);

        let rowIdx = existingSubjects.length;
        const self = this;

        // Dynamic exam type toggle
        const examTypeSelect = document.getElementById('grade-exam-type');
        const gradeSystemSelect = document.getElementById('grade-system-select');
        const rebuildMatrix = () => {
            const mock = examTypeSelect.value === '모의고사';
            const gradeSystem = gradeSystemSelect.value;
            document.getElementById('grade-semester-group').style.display = mock ? 'none' : '';
            document.getElementById('grade-examname-group').style.display = mock ? '' : 'none';
            document.getElementById('grade-rank-group').style.display = mock ? 'none' : '';
            document.getElementById('grade-system-group').style.display = mock ? 'none' : 'flex';

            // Rebuild matrix labels
            const labels = document.getElementById('grade-matrix-labels');
            labels.className = 'grade-matrix-labels' + (mock ? ' mock' : '');
            labels.innerHTML = mock
                ? '<span>과목</span><span>원점수</span><span>등급</span><span>표준점수</span><span>백분위</span><span></span>'
                : '<span>과목</span><span>원점수</span><span>등급</span><span>성취도</span><span>석차/전체</span><span></span>';

            // Rebuild existing rows preserving values
            const matrix = document.getElementById('grade-matrix');
            const rows = matrix.querySelectorAll('.grade-matrix-row');
            rows.forEach(row => {
                const idx = row.dataset.idx;
                const form = document.getElementById('grade-form');
                const name = form[`sub_name_${idx}`]?.value || '';
                const score = form[`sub_score_${idx}`]?.value || '';
                const grade = form[`sub_grade_${idx}`]?.value || '';
                const achv = form[`sub_achv_${idx}`]?.value || '';
                const rankVal = form[`sub_rank_${idx}`]?.value || '';
                const totalVal = form[`sub_total_${idx}`]?.value || '';
                const rank = rankVal && totalVal ? `${rankVal}/${totalVal}` : rankVal || '';
                const std = form[`sub_std_${idx}`]?.value || '';
                const pct = form[`sub_pct_${idx}`]?.value || '';
                const s = { subject: name, score, grade, achievement: achv, rank, standardScore: std, percentile: pct };
                const newRow = document.createElement('div');
                newRow.innerHTML = self.buildGradeMatrixRowHtml(s, idx, mock, gradeSystem);
                row.replaceWith(newRow.firstElementChild);
            });
        };
        examTypeSelect.addEventListener('change', rebuildMatrix);
        gradeSystemSelect.addEventListener('change', rebuildMatrix);

        // Add subject row
        document.getElementById('btn-add-subject-row').addEventListener('click', () => {
            const matrix = document.getElementById('grade-matrix');
            const mock = examTypeSelect.value === '모의고사';
            const gradeSystem = gradeSystemSelect.value;
            const s = { subject: '', score: '', grade: '', achievement: '', rank: '', standardScore: '', percentile: '' };
            const div = document.createElement('div');
            div.innerHTML = self.buildGradeMatrixRowHtml(s, rowIdx, mock, gradeSystem);
            matrix.appendChild(div.firstElementChild);
            rowIdx++;
        });

        // Remove row
        document.getElementById('grade-matrix').addEventListener('click', (e) => {
            const btn = e.target.closest('.grade-remove-row');
            if (btn) btn.closest('.grade-matrix-row').remove();
        });

        // Submit
        document.getElementById('grade-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const studentId = isEdit ? gradeObj.studentId : form.studentId.value;
            const mock = form.examType.value === '모의고사';
            const subjects = [];
            form.querySelectorAll('.grade-matrix-row').forEach(row => {
                const idx = row.dataset.idx;
                const name = form[`sub_name_${idx}`]?.value?.trim();
                const score = form[`sub_score_${idx}`]?.value;
                const grade = form[`sub_grade_${idx}`]?.value;
                if (name) {
                    const sub = { subject: name, score: score !== '' ? Number(score) : null, grade: grade || '' };
                    if (mock) {
                        sub.standardScore = form[`sub_std_${idx}`]?.value ? Number(form[`sub_std_${idx}`].value) : null;
                        sub.percentile = form[`sub_pct_${idx}`]?.value ? Number(form[`sub_pct_${idx}`].value) : null;
                    } else {
                        sub.achievement = form[`sub_achv_${idx}`]?.value || '';
                        const rv = form[`sub_rank_${idx}`]?.value?.trim() || '';
                        const tv = form[`sub_total_${idx}`]?.value?.trim() || '';
                        sub.rank = rv && tv ? `${rv}/${tv}` : rv || '';
                    }
                    subjects.push(sub);
                }
            });

            const data = {
                studentId,
                semester: mock ? '' : form.semester.value,
                examType: form.examType.value,
                examDate: form.examDate.value,
                examName: mock ? (form.examName.value.trim() || '') : '',
                totalRank: mock ? '' : form.totalRank.value.trim(),
                gradeSystem: mock ? '9' : gradeSystemSelect.value,
                subjects
            };

            try {
                if (isEdit) {
                    await DataStore.updateGrade(gradeObj.id, data);
                    this.toast('성적이 수정되었습니다.', 'success');
                } else {
                    await DataStore.addGrade(data);
                    this.toast('성적이 저장되었습니다.', 'success');
                }
                this.closeModal();
                if (this.currentView === 'grades') this.renderGrades();
                else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
            } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        });
    },

    buildGradeMatrixRowHtml(s, idx, mock, gradeSystem) {
        const gradeOptions9 = ['1','2','3','4','5','6','7','8','9'];
        const gradeOptions5 = ['1','2','3','4','5'];
        const gradeOpts = mock ? gradeOptions9 : (gradeSystem === '5' ? gradeOptions5 : gradeOptions9);
        if (mock) {
            return `<div class="grade-matrix-row mock" data-idx="${idx}">
                <input type="text" class="form-control" name="sub_name_${idx}" value="${this.escapeHtml(s.subject)}" placeholder="과목명" list="subject-list-g">
                <input type="number" class="form-control" name="sub_score_${idx}" value="${s.score !== '' && s.score != null ? s.score : ''}" placeholder="원점수" min="0" max="100">
                <select class="form-control" name="sub_grade_${idx}">
                    <option value="">등급</option>
                    ${gradeOpts.map(g => `<option value="${g}" ${String(s.grade) === g ? 'selected' : ''}>${g}등급</option>`).join('')}
                </select>
                <input type="number" class="form-control" name="sub_std_${idx}" value="${s.standardScore || ''}" placeholder="표준점수">
                <input type="number" class="form-control" name="sub_pct_${idx}" value="${s.percentile || ''}" placeholder="백분위" min="0" max="100">
                <button type="button" class="btn-icon grade-remove-row" title="삭제"><i class="fas fa-times"></i></button>
            </div>`;
        }
        return `<div class="grade-matrix-row" data-idx="${idx}">
            <input type="text" class="form-control" name="sub_name_${idx}" value="${this.escapeHtml(s.subject)}" placeholder="과목명" list="subject-list-g">
            <input type="number" class="form-control" name="sub_score_${idx}" value="${s.score !== '' && s.score != null ? s.score : ''}" placeholder="원점수" min="0" max="100">
            <select class="form-control" name="sub_grade_${idx}">
                <option value="">등급</option>
                ${gradeOpts.map(g => `<option value="${g}" ${String(s.grade) === g ? 'selected' : ''}>${g}등급</option>`).join('')}
            </select>
            <select class="form-control" name="sub_achv_${idx}">
                <option value="">성취도</option>
                ${['A','B','C'].map(a => `<option value="${a}" ${s.achievement === a ? 'selected' : ''}>${a}</option>`).join('')}
            </select>
            <div class="rank-input-group">
                <input type="number" class="form-control" name="sub_rank_${idx}" value="${(() => { const p = (s.rank || '').split('/'); return p[0] ? p[0].trim() : ''; })()}" placeholder="석차" min="1">
                <span>/</span>
                <input type="number" class="form-control" name="sub_total_${idx}" value="${(() => { const p = (s.rank || '').split('/'); return p[1] ? p[1].trim() : ''; })()}" placeholder="전체" min="1">
            </div>
            <button type="button" class="btn-icon grade-remove-row" title="삭제"><i class="fas fa-times"></i></button>
        </div>`;
    },

    // =========================================
    //  MODAL FORMS
    // =========================================
    showStudentForm(student = null) {
        const isEdit = !!student;
        const html = `
            <form id="student-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>이름 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" required value="${isEdit ? this.escapeHtml(student.name) : ''}" placeholder="학생 이름">
                    </div>
                    <div class="form-group">
                        <label>학교 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="school" required value="${isEdit ? this.escapeHtml(student.school) : ''}" placeholder="학교명">
                    </div>
                </div>
                <div class="form-row-3">
                    <div class="form-group">
                        <label>학년 <span class="required">*</span></label>
                        <select class="form-control" name="grade" required>
                            <option value="">선택</option>
                            ${['중1', '중2', '중3', '고1', '고2', '고3'].map(g => `<option value="${g}" ${isEdit && student.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>반 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="className" required value="${isEdit ? this.escapeHtml(student.className) : ''}" placeholder="예: A반">
                    </div>
                    <div class="form-group">
                        <label>전화번호</label>
                        <input type="tel" class="form-control" name="phone" value="${isEdit ? this.escapeHtml(student.phone) : ''}" placeholder="010-0000-0000">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>학부모 이름</label>
                        <input type="text" class="form-control" name="parentName" value="${isEdit ? this.escapeHtml(student.parentName) : ''}" placeholder="학부모 성함">
                    </div>
                    <div class="form-group">
                        <label>학부모 전화번호</label>
                        <input type="tel" class="form-control" name="parentPhone" value="${isEdit ? this.escapeHtml(student.parentPhone) : ''}" placeholder="010-0000-0000">
                    </div>
                </div>
                <div class="form-group">
                    <label>이전 성적</label>
                    <textarea class="form-control" name="previousGrades" rows="3" placeholder="이전 시험 성적 등을 기록해주세요">${isEdit ? this.escapeHtml(student.previousGrades) : ''}</textarea>
                </div>
                <div class="form-group">
                    <label>메모</label>
                    <textarea class="form-control" name="notes" rows="2" placeholder="학습 관련 참고사항">${isEdit ? this.escapeHtml(student.notes) : ''}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '등록'}</button>
                </div>
                ${isEdit ? `<input type="hidden" name="id" value="${student.id}">` : ''}
            </form>
        `;

        this.openModal(isEdit ? '학생 정보 수정' : '새 학생 등록', html);

        document.getElementById('student-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const data = {
                name: form.name.value.trim(),
                school: form.school.value.trim(),
                grade: form.grade.value,
                className: form.className.value.trim(),
                phone: form.phone.value.trim(),
                parentName: form.parentName.value.trim(),
                parentPhone: form.parentPhone.value.trim(),
                previousGrades: form.previousGrades.value.trim(),
                notes: form.notes.value.trim()
            };

            try {
                if (isEdit) {
                    await DataStore.updateStudent(student.id, data);
                    this.toast('학생 정보가 수정되었습니다.', 'success');
                } else {
                    data.status = 'active';
                    data.enrollDate = new Date().toISOString().slice(0, 10);
                    await DataStore.addStudent(data);
                    this.toast('새 학생이 등록되었습니다.', 'success');
                }

                this.closeModal();
                if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                else this.navigate('students');
            } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        });
    },

    showPlanForm(studentId, plan = null) {
        const isEdit = !!plan;
        const currentMode = isEdit && plan.trackingMode === 'checklist' ? 'checklist' : 'numeric';
        const existingChecklist = isEdit && plan.checklistItems ? plan.checklistItems : [];
        const html = `
            <form id="plan-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>과목 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="subject" required value="${isEdit ? this.escapeHtml(plan.subject) : ''}" placeholder="예: 수학, 영어" list="subject-list">
                        <datalist id="subject-list">
                            <option value="수학"><option value="영어"><option value="국어"><option value="과학"><option value="사회"><option value="한국사">
                        </datalist>
                    </div>
                    <div class="form-group">
                        <label>교재 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="textbook" required value="${isEdit ? this.escapeHtml(plan.textbook) : ''}" placeholder="교재명">
                    </div>
                </div>
                <div class="form-group">
                    <label>학습 방법</label>
                    <input type="text" class="form-control" name="studyMethod" value="${isEdit ? this.escapeHtml(plan.studyMethod) : ''}" placeholder="예: 개념 학습 후 문제풀이">
                </div>
                <div class="form-row-3">
                    <div class="form-group">
                        <label>난이도</label>
                        <select class="form-control" name="difficulty">
                            <option value="하" ${isEdit && plan.difficulty === '하' ? 'selected' : ''}>하 (기초)</option>
                            <option value="중" ${!isEdit || plan.difficulty === '중' ? 'selected' : ''}>중 (보통)</option>
                            <option value="상" ${isEdit && plan.difficulty === '상' ? 'selected' : ''}>상 (심화)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>계획 유형</label>
                        <select class="form-control" name="planType">
                            ${['중간고사', '기말고사', '방학', '수시'].map(t => `<option value="${t}" ${isEdit && plan.planType === t ? 'selected' : ''}>${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>상태</label>
                        <select class="form-control" name="status">
                            <option value="active" ${!isEdit || plan.status === 'active' ? 'selected' : ''}>진행 중</option>
                            <option value="completed" ${isEdit && plan.status === 'completed' ? 'selected' : ''}>완료</option>
                            <option value="paused" ${isEdit && plan.status === 'paused' ? 'selected' : ''}>일시중지</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>체크 시작일 <span class="required">*</span></label>
                        <input type="date" class="form-control" name="startDate" required value="${isEdit ? plan.startDate : new Date().toISOString().split('T')[0]}">
                    </div>
                    <div class="form-group">
                        <label>체크 종료일 <span class="required">*</span></label>
                        <input type="date" class="form-control" name="endDate" required value="${isEdit ? plan.endDate : new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}">
                    </div>
                </div>

                <div class="tracking-mode-tabs">
                    <button type="button" class="tracking-tab ${currentMode === 'numeric' ? 'active' : ''}" data-mode="numeric"><i class="fas fa-hashtag"></i> 숫자 입력</button>
                    <button type="button" class="tracking-tab ${currentMode === 'checklist' ? 'active' : ''}" data-mode="checklist"><i class="fas fa-tasks"></i> 단원별 체크</button>
                </div>
                <input type="hidden" name="trackingMode" value="${currentMode}">

                <div id="tracking-numeric" style="${currentMode === 'numeric' ? '' : 'display:none'}">
                    <div class="form-row-3">
                        <div class="form-group">
                            <label>주간 학습량 <span class="required">*</span></label>
                            <input type="number" class="form-control" name="totalUnits" min="1" value="${isEdit ? plan.totalUnits : ''}" placeholder="이번 주 목표 분량">
                        </div>
                        <div class="form-group">
                            <label>단위</label>
                            <input type="text" class="form-control" name="unitLabel" value="${isEdit ? this.escapeHtml(plan.unitLabel) : '페이지'}" placeholder="예: 페이지, 단원" list="unit-list">
                            <datalist id="unit-list">
                                <option value="페이지"><option value="단원"><option value="챕터"><option value="문제"><option value="세트"><option value="지문">
                            </datalist>
                        </div>
                        <div class="form-group">
                            <label>현재 진행량</label>
                            <input type="number" class="form-control" name="completedUnits" min="0" value="${isEdit ? plan.completedUnits : 0}">
                        </div>
                    </div>
                </div>

                <div id="tracking-checklist" style="${currentMode === 'checklist' ? '' : 'display:none'}">
                    <div class="form-group">
                        <label>단원 추가</label>
                        <div style="display:flex;gap:8px">
                            <input type="text" class="form-control" id="checklist-new-item" placeholder="예: 지수, 로그, 삼각함수 (쉼표로 구분)">
                            <button type="button" class="btn btn-sm btn-outline" id="btn-add-checklist"><i class="fas fa-plus"></i> 추가</button>
                        </div>
                    </div>
                    <div id="checklist-items">
                        ${existingChecklist.map((item, i) => `
                            <div class="checklist-form-item" data-idx="${i}">
                                <label class="checklist-label">
                                    <input type="checkbox" ${item.completed ? 'checked' : ''}>
                                    <span>${this.escapeHtml(item.name)}</span>
                                </label>
                                <button type="button" class="btn-icon checklist-remove" title="삭제"><i class="fas fa-times"></i></button>
                            </div>
                        `).join('')}
                    </div>
                    ${existingChecklist.length === 0 ? '' : ''}
                </div>

                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '추가'}</button>
                </div>
            </form>
        `;

        this.openModal(isEdit ? '학습 계획 수정' : '학습 계획 추가', html);

        // Tab switching
        document.querySelectorAll('.tracking-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                document.querySelectorAll('.tracking-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector('[name="trackingMode"]').value = mode;
                document.getElementById('tracking-numeric').style.display = mode === 'numeric' ? '' : 'none';
                document.getElementById('tracking-checklist').style.display = mode === 'checklist' ? '' : 'none';
            });
        });

        // Add checklist items
        const addChecklistItems = (text) => {
            const container = document.getElementById('checklist-items');
            const items = text.split(',').map(s => s.trim()).filter(Boolean);
            items.forEach(name => {
                const idx = container.children.length;
                const div = document.createElement('div');
                div.className = 'checklist-form-item';
                div.dataset.idx = idx;
                div.innerHTML = `
                    <label class="checklist-label">
                        <input type="checkbox">
                        <span>${this.escapeHtml(name)}</span>
                    </label>
                    <button type="button" class="btn-icon checklist-remove" title="삭제"><i class="fas fa-times"></i></button>
                `;
                container.appendChild(div);
            });
        };

        document.getElementById('btn-add-checklist').addEventListener('click', () => {
            const input = document.getElementById('checklist-new-item');
            if (input.value.trim()) {
                addChecklistItems(input.value);
                input.value = '';
                input.focus();
            }
        });
        document.getElementById('checklist-new-item').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-add-checklist').click();
            }
        });

        // Remove checklist item
        document.getElementById('checklist-items').addEventListener('click', (e) => {
            const btn = e.target.closest('.checklist-remove');
            if (btn) btn.closest('.checklist-form-item').remove();
        });

        document.getElementById('plan-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const trackingMode = form.trackingMode.value;

            const data = {
                studentId,
                subject: form.subject.value.trim(),
                textbook: form.textbook.value.trim(),
                studyMethod: form.studyMethod.value.trim(),
                difficulty: form.difficulty.value,
                planType: form.planType.value,
                status: form.status.value,
                startDate: form.startDate.value,
                endDate: form.endDate.value,
                trackingMode
            };

            if (trackingMode === 'checklist') {
                const items = [];
                document.querySelectorAll('#checklist-items .checklist-form-item').forEach(el => {
                    const name = el.querySelector('.checklist-label span').textContent;
                    const completed = el.querySelector('input[type="checkbox"]').checked;
                    items.push({ name, completed });
                });
                if (items.length === 0) {
                    this.toast('단원을 하나 이상 추가해주세요.', 'error');
                    return;
                }
                data.checklistItems = items;
                data.totalUnits = items.length;
                data.completedUnits = items.filter(i => i.completed).length;
                data.unitLabel = '단원';
            } else {
                data.totalUnits = parseInt(form.totalUnits.value);
                data.unitLabel = form.unitLabel.value.trim() || '단위';
                data.completedUnits = parseInt(form.completedUnits.value) || 0;
                data.checklistItems = null;
                if (!data.totalUnits || data.totalUnits < 1) {
                    this.toast('주간 학습량을 입력해주세요.', 'error');
                    return;
                }
            }

            try {
                if (isEdit) {
                    await DataStore.updatePlan(plan.id, data);
                    this.toast('학습 계획이 수정되었습니다.', 'success');
                } else {
                    await DataStore.addPlan(data);
                    this.toast('학습 계획이 추가되었습니다.', 'success');
                }

                this.closeModal();
                if (this.currentView === 'student-detail') this.renderStudentDetail(studentId);
                else this.navigate('plans');
            } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        });
    },

    showProgressForm(studentId, planId) {
        const plan = DataStore.getPlan(planId);
        if (!plan) return;

        const pct = plan.totalUnits > 0 ? Math.round((plan.completedUnits / plan.totalUnits) * 100) : 0;
        const remaining = plan.totalUnits - plan.completedUnits;

        const html = `
            <div style="margin-bottom:20px;padding:14px;background:var(--gray-50);border-radius:8px">
                <div style="font-weight:600;margin-bottom:6px">${this.escapeHtml(plan.subject)} - ${this.escapeHtml(plan.textbook)}</div>
                <div class="progress-item">
                    <div class="progress-label"><span>${plan.completedUnits} / ${plan.totalUnits} ${this.escapeHtml(plan.unitLabel)}</span><span>${pct}%</span></div>
                    <div class="progress-bar-container"><div class="progress-bar ${this.getProgressColor(pct)}" style="width:${pct}%"></div></div>
                </div>
                <div style="font-size:0.82rem;color:var(--gray-500);margin-top:6px">남은 학습량: ${remaining} ${this.escapeHtml(plan.unitLabel)}</div>
            </div>
            <form id="progress-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>진행량 <span class="required">*</span></label>
                        <input type="number" class="form-control" name="amount" min="1" max="${remaining}" required placeholder="숫자 입력">
                    </div>
                    <div class="form-group">
                        <label>날짜 <span class="required">*</span></label>
                        <input type="date" class="form-control" name="date" required value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="form-group">
                    <label>메모</label>
                    <input type="text" class="form-control" name="note" placeholder="학습 내용 메모">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-success"><i class="fas fa-check"></i> 기록</button>
                </div>
            </form>
        `;

        this.openModal('진도 입력', html);

        document.getElementById('progress-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
                await DataStore.addProgressEntry({
                    studentId,
                    planId,
                    amount: parseInt(form.amount.value),
                    date: form.date.value,
                    note: form.note.value.trim()
                });
                this.toast('진도가 기록되었습니다!', 'success');
                this.closeModal();
                if (this.currentView === 'student-detail') this.renderStudentDetail(studentId);
                else this.navigate(this.currentView);
            } catch(err) { this.toast('진도 저장 실패: ' + err.message, 'error'); }
        });
    },

    showCommentForm(studentId, planId = null) {
        const plans = DataStore.getStudentPlans(studentId).filter(p => p.status === 'active');
        const student = DataStore.getStudent(studentId);
        const user = this.currentUser;
        const authorName = user ? user.name : '';
        const authorRole = user ? (user.role === 'director' ? 'admin' : 'teacher') : 'teacher';

        const html = `
            <form id="comment-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>작성자</label>
                        <input type="text" class="form-control" name="author" required value="${this.escapeHtml(authorName)}" readonly style="background:var(--gray-50)">
                    </div>
                    <div class="form-group">
                        <label>역할</label>
                        <select class="form-control" name="authorRole" required>
                            <option value="teacher" ${authorRole === 'teacher' ? 'selected' : ''}>선생님</option>
                            <option value="admin" ${authorRole === 'admin' ? 'selected' : ''}>관리자</option>
                            <option value="parent">학부모</option>
                            <option value="student">학생</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>수신 대상 <span class="comment-recipient-hint">(이 코멘트를 전달할 대상)</span></label>
                    <div class="recipient-checks">
                        <label class="recipient-check"><input type="checkbox" name="recipient" value="student" checked> <i class="fas fa-user-graduate"></i> 학생 (${student ? this.escapeHtml(student.name) : ''})</label>
                        <label class="recipient-check"><input type="checkbox" name="recipient" value="parent" checked> <i class="fas fa-user-friends"></i> 학부모 (${student ? this.escapeHtml(student.parentName) : ''})</label>
                        <label class="recipient-check"><input type="checkbox" name="recipient" value="director" ${authorRole === 'admin' ? '' : 'checked'}> <i class="fas fa-user-tie"></i> 원장</label>
                    </div>
                </div>
                <div class="form-group">
                    <label>관련 학습 계획</label>
                    <select class="form-control" name="planId">
                        <option value="">전체 (특정 계획 없음)</option>
                        ${plans.map(p => `<option value="${p.id}" ${p.id === planId ? 'selected' : ''}>${this.escapeHtml(p.subject)} - ${this.escapeHtml(p.textbook)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>내용 <span class="required">*</span></label>
                    <textarea class="form-control" name="content" rows="4" required placeholder="코멘트 내용을 입력하세요"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> 전달</button>
                </div>
            </form>
        `;

        this.openModal('코멘트 작성 / 전달', html);

        document.getElementById('comment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const recipients = Array.from(form.querySelectorAll('input[name="recipient"]:checked')).map(cb => cb.value);

            try {
                await DataStore.addComment({
                    studentId,
                    planId: form.planId.value || null,
                    author: form.author.value.trim(),
                    authorRole: form.authorRole.value,
                    content: form.content.value.trim(),
                    recipients
                });
                this.toast(`코멘트가 전달되었습니다. (${recipients.map(r => r === 'student' ? '학생' : r === 'parent' ? '학부모' : '원장').join(', ')})`, 'success');
                this.closeModal();
                if (this.currentView === 'student-detail') this.renderStudentDetail(studentId);
                else this.navigate(this.currentView);
            } catch(err) { this.toast('코멘트 저장 실패: ' + err.message, 'error'); }
        });
    },

    // =========================================
    //  EVENT DELEGATION
    // =========================================
    async handleContentClick(e) {
        // For checkboxes with data-action, use the input itself
        if (e.target.tagName === 'INPUT' && e.target.dataset.action === 'toggle-read') {
            const msgId = e.target.dataset.messageId;
            const reader = e.target.dataset.reader;
            try { await DataStore.toggleReadBy(msgId, reader); } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
            this.renderMessages();
            this.updateUnreadBadge();
            return;
        }

        // Checklist item toggle
        if (e.target.tagName === 'INPUT' && e.target.dataset.action === 'toggle-checklist') {
            const planId = e.target.dataset.planId;
            const ci = parseInt(e.target.dataset.ci);
            const plan = DataStore.getPlan(planId);
            if (plan && plan.checklistItems) {
                const updatedItems = plan.checklistItems.map((item, i) =>
                    i === ci ? { ...item, completed: e.target.checked } : { ...item }
                );
                const completed = updatedItems.filter(i => i.completed).length;
                try {
                    await DataStore.updatePlan(planId, { checklistItems: updatedItems, completedUnits: completed });
                    if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                    else this.navigate(this.currentView);
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
            }
            return;
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;

        // Prevent card click when interacting with checkbox area
        if (target.dataset.action === 'toggle-read') return;

        const action = target.dataset.action;
        const id = target.dataset.id;
        const studentId = target.dataset.studentId;
        const planId = target.dataset.planId;
        const commentId = target.dataset.commentId;

        switch (action) {
            case 'view-student':
                this.navigate('student-detail', { studentId: id });
                break;

            case 'go-students':
                this.navigate('students');
                break;

            case 'add-student':
                this.showStudentForm();
                break;

            case 'edit-student': {
                const student = DataStore.getStudent(id || studentId);
                if (student) this.showStudentForm(student);
                break;
            }

            case 'delete-student':
                if (confirm('이 학생의 모든 데이터(학습 계획, 진도, 코멘트)가 삭제됩니다. 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteStudent(id);
                        this.toast('학생이 삭제되었습니다.', 'success');
                        this.navigate('students');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                }
                break;

            case 'add-plan':
                this.showPlanForm(studentId);
                break;

            case 'edit-plan': {
                const plan = DataStore.getPlan(planId);
                if (plan) this.showPlanForm(studentId, plan);
                break;
            }

            case 'delete-plan':
                if (confirm('이 학습 계획과 관련된 진도 기록이 모두 삭제됩니다. 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deletePlan(planId);
                        this.toast('학습 계획이 삭제되었습니다.', 'success');
                        if (this.currentView === 'student-detail') this.renderStudentDetail(studentId);
                        else this.navigate('plans');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                }
                break;

            case 'add-progress':
                this.showProgressForm(studentId, planId);
                break;

            case 'add-comment':
                this.showCommentForm(studentId);
                break;

            case 'delete-comment':
                if (confirm('이 코멘트를 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteComment(commentId);
                        this.toast('코멘트가 삭제되었습니다.', 'success');
                        if (this.currentView === 'student-detail') this.renderStudentDetail(studentId);
                        else this.navigate('comments');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                }
                break;

            case 'add-message':
                this.showMessageForm();
                break;

            case 'add-team-message':
                this.showTeamMessageForm();
                break;

            case 'view-team-message-detail':
                this.showTeamMessageDetail(target.dataset.messageId);
                break;

            case 'toggle-read': {
                const msgId = target.dataset.messageId;
                const reader = target.dataset.reader;
                try { await DataStore.toggleReadBy(msgId, reader); } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
                this.renderMessages();
                this.updateUnreadBadge();
                break;
            }

            case 'pin-message': {
                const msg = DataStore.getMessage(target.dataset.messageId);
                if (msg) {
                    try {
                        await DataStore.updateMessage(msg.id, { pinned: !msg.pinned });
                    } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
                    this.renderMessages();
                }
                break;
            }

            case 'delete-message':
                if (confirm('이 메시지를 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteMessage(target.dataset.messageId);
                        this.toast('메시지가 삭제되었습니다.', 'success');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                    this.renderMessages();
                    this.updateUnreadBadge();
                }
                break;

            case 'view-message-detail':
                this.showMessageDetail(target.dataset.messageId);
                break;

            // Grades actions
            case 'add-grade':
                this.showGradeForm();
                break;

            case 'edit-grade': {
                const gradeObj = DataStore.getGrade(target.dataset.gradeId);
                if (gradeObj) this.showGradeForm(gradeObj);
                break;
            }

            // 자기 진도 일지 actions
            case 'set-self-goal': {
                const week = target.dataset.week;
                const sid = target.dataset.studentId;
                const goalText = (document.getElementById('self-goal-input') || {}).value || '';
                if (!goalText.trim()) { this.toast('목표를 입력해주세요.', 'warning'); break; }
                try {
                    await DataStore.setSelfWeeklyGoal(sid, week, goalText.trim());
                    this.toast('주간 목표가 저장되었습니다!', 'success');
                    this.renderStudentDetail(sid);
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'add-self-journal': {
                const sid = target.dataset.studentId;
                const dateEl = document.getElementById('self-journal-date');
                const noteEl = document.getElementById('self-journal-note');
                const date = (dateEl || {}).value || '';
                const note = (noteEl || {}).value || '';
                if (!date) { this.toast('날짜를 선택해주세요.', 'warning'); break; }
                if (!note.trim()) { this.toast('내용을 입력해주세요.', 'warning'); break; }
                try {
                    await DataStore.addSelfJournal(sid, date, note.trim());
                    this.toast('진도가 기록되었습니다!', 'success');
                    this.renderStudentDetail(sid);
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-self-journal': {
                if (!confirm('이 기록을 삭제하시겠습니까?')) break;
                const sid = target.dataset.studentId;
                try {
                    await DataStore.deleteSelfJournal(target.dataset.journalId);
                    this.toast('삭제되었습니다.', 'success');
                    this.renderStudentDetail(sid);
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-grade':
                if (confirm('이 성적을 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteGrade(target.dataset.gradeId);
                        this.toast('성적이 삭제되었습니다.', 'success');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                    if (this.currentView === 'grades') this.renderGrades();
                    else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                }
                break;

            // 출석 관리 actions
            case 'att-prev-month': {
                const [y, m] = (this._attendanceYM || this.getLocalDateStr().slice(0,7)).split('-').map(Number);
                const prev = new Date(y, m - 2, 1);
                this._attendanceYM = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
                this.renderAttendance();
                break;
            }
            case 'att-next-month': {
                const [y, m] = (this._attendanceYM || this.getLocalDateStr().slice(0,7)).split('-').map(Number);
                const next = new Date(y, m, 1);
                this._attendanceYM = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
                this.renderAttendance();
                break;
            }
            case 'att-load-day':
                this.loadAttBulkDay();
                break;

            case 'att-set-status': {
                const { studentId, date, status } = target.dataset;
                try {
                    await DataStore.upsertAttendance(studentId, date, status);
                    this.loadAttBulkDay();
                    // 통계 테이블 갱신
                    this.renderAttendance();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }
            case 'att-set-status-modal': {
                const { studentId, date, status } = target.dataset;
                try {
                    await DataStore.upsertAttendance(studentId, date, status);
                    const s = DataStore.getStudent(studentId);
                    this.showStudentAttendanceModal(studentId, s ? s.name : '');
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }
            case 'att-input-student': {
                const { studentId, studentName } = target.dataset;
                await DataStore._ensureLoaded(DataStore.TABLES.ATTENDANCE);
                this.showStudentAttendanceModal(studentId, studentName);
                break;
            }

            // 업무 노트 actions
            case 'add-task': {
                const content = (document.getElementById('task-content-input') || {}).value || '';
                if (!content.trim()) { this.toast('할 일 내용을 입력해주세요.', 'warning'); break; }
                const studentId = (document.getElementById('task-student-select') || {}).value || null;
                const dueDate = (document.getElementById('task-due-date') || {}).value || null;
                try {
                    await DataStore.addTask(content.trim(), studentId || null, dueDate || null);
                    this.toast('할 일이 추가되었습니다.', 'success');
                    this.renderTasks();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'toggle-task': {
                const taskId = target.dataset.taskId;
                const completed = target.checked;
                try {
                    await DataStore.updateTask(taskId, { completed });
                    this.renderTasks();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-task': {
                if (!confirm('이 할 일을 삭제하시겠습니까?')) break;
                try {
                    await DataStore.deleteTask(target.dataset.taskId);
                    this.toast('삭제되었습니다.', 'success');
                    this.renderTasks();
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'sort-grades': {
                const col = target.dataset.col;
                if (this._gradesSortCol === col) this._gradesSortAsc = !this._gradesSortAsc;
                else { this._gradesSortCol = col; this._gradesSortAsc = true; }
                this.filterGrades();
                break;
            }

            case 'grades-view-mode':
                this._gradesViewMode = target.dataset.mode;
                this.renderGrades();
                break;

            // Teacher management actions (director only)
            case 'assign-teachers':
                this.showTeacherAssignmentModal(target.dataset.studentId);
                break;

            case 'unassign-student': {
                const tid = target.dataset.teacherId;
                const sid = target.dataset.studentId;
                if (confirm('이 학생의 담당을 해제하시겠습니까?')) {
                    try {
                        await DataStore.unassignStudentFromTeacher(tid, sid);
                        this.toast('담당이 해제되었습니다.', 'success');
                    } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
                    this.renderTeachers();
                }
                break;
            }

            case 'add-teacher':
                this.showTeacherForm();
                break;

            case 'view-teacher':
                this.showTeacherDetail(target.dataset.teacherId);
                break;

            case 'edit-teacher-assignment':
                this.showTeacherEditAssignment(target.dataset.teacherId);
                break;

            case 'delete-teacher':
                if (confirm('이 선생님을 삭제하시겠습니까? 담당 학생 지정도 모두 해제됩니다.')) {
                    try {
                        await DataStore.deleteTeacher(target.dataset.teacherId);
                        this.toast('선생님이 삭제되었습니다.', 'success');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                    this.renderTeachers();
                }
                break;

            case 'approve-user': {
                const userId = target.dataset.userId;
                const pendingUser = DataStore.getTeacher(userId);
                if (pendingUser) {
                    try {
                        await DataStore.approveUser(userId);
                        if (pendingUser.studentId) {
                            await DataStore.updateStudent(pendingUser.studentId, { status: '재원' });
                        }
                        this.toast(`${pendingUser.name}님의 가입을 승인했습니다.`, 'success');
                    } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
                    this.renderTeachers();
                }
                break;
            }

            case 'reject-user':
                if (confirm('이 가입 신청을 거절하시겠습니까?')) {
                    try {
                        const rUserId = target.dataset.userId;
                        await DataStore.rejectUser(rUserId);
                        this.toast('가입 신청이 거절되었습니다.', 'success');
                    } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
                    this.renderTeachers();
                }
                break;

            // Board actions
            case 'board-switch-tab':
                this._boardTab = target.dataset.tab;
                this.renderBoard();
                break;

            case 'add-board-post':
                this.showBoardPostForm();
                break;

            case 'view-board-post':
                this.showBoardPostDetail(target.dataset.postId);
                break;

            case 'delete-board-post':
                if (confirm('이 게시글을 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteBoardPost(target.dataset.postId);
                        this.toast('게시글이 삭제되었습니다.', 'success');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                    this.renderBoard();
                }
                break;

            case 'add-board-event':
                this.showBoardEventForm();
                break;

            case 'delete-board-event':
                if (confirm('이 일정을 삭제하시겠습니까?')) {
                    try {
                        await DataStore.deleteBoardEvent(target.dataset.eventId);
                        this.toast('일정이 삭제되었습니다.', 'success');
                    } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                    this.renderBoard();
                }
                break;

            case 'board-cal-prev':
                this._boardCalMonth--;
                if (this._boardCalMonth < 0) { this._boardCalMonth = 11; this._boardCalYear--; }
                this.renderBoard();
                break;

            case 'board-cal-next':
                this._boardCalMonth++;
                if (this._boardCalMonth > 11) { this._boardCalMonth = 0; this._boardCalYear++; }
                this.renderBoard();
                break;

            case 'board-cal-today':
                this._boardCalYear = new Date().getFullYear();
                this._boardCalMonth = new Date().getMonth();
                this.renderBoard();
                break;

            case 'board-cal-click':
                this.showDateEvents(target.dataset.date || target.closest('[data-date]').dataset.date);
                break;

            // 월간 리포트 actions
            case 'report-prev-month': {
                const [ry, rm] = (this._reportYM || this.getLocalDateStr().slice(0,7)).split('-').map(Number);
                const prev = new Date(ry, rm - 2, 1);
                this._reportYM = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
                this.renderReport(this._reportStudentId, this._reportYM);
                break;
            }
            case 'report-next-month': {
                const [ry, rm] = (this._reportYM || this.getLocalDateStr().slice(0,7)).split('-').map(Number);
                const next = new Date(ry, rm, 1);
                this._reportYM = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
                this.renderReport(this._reportStudentId, this._reportYM);
                break;
            }

            case 'report-print':
                window.print();
                break;

            // 상담 일지 actions
            case 'add-consultation': {
                const studentId = (document.getElementById('consult-student-id') || {}).value || '';
                if (!studentId) { this.toast('학생을 선택해주세요.', 'warning'); break; }
                const content = (document.getElementById('consult-content') || {}).value || '';
                if (!content.trim()) { this.toast('상담 내용을 입력해주세요.', 'warning'); break; }
                const type = (document.getElementById('consult-type') || {}).value || '학생상담';
                const date = (document.getElementById('consult-date') || {}).value || this.getLocalDateStr();
                const nextDate = (document.getElementById('consult-next-date') || {}).value || '';
                const nextMemo = (document.getElementById('consult-next-memo') || {}).value || '';
                try {
                    await DataStore.addConsultation({
                        studentId,
                        teacherId: this.currentUser ? this.currentUser.id : '',
                        teacherName: this.currentUser ? this.currentUser.name : '',
                        date, type,
                        content: content.trim(),
                        nextDate: nextDate || null,
                        nextMemo: nextMemo.trim()
                    });
                    this.toast('상담이 기록되었습니다.', 'success');
                    this.renderConsultations(this._consultStudentId);
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-consultation': {
                if (!confirm('이 상담 기록을 삭제하시겠습니까?')) break;
                try {
                    await DataStore.deleteConsultation(target.dataset.consultId);
                    this.toast('삭제되었습니다.', 'success');
                    if (this.currentView === 'consultations') this.renderConsultations(this._consultStudentId);
                    else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'go-consultations': {
                this._consultStudentId = target.dataset.studentId;
                await DataStore._ensureLoaded(DataStore.TABLES.CONSULTATIONS);
                this.navigate('consultations', { studentId: target.dataset.studentId });
                break;
            }

            case 'go-notifications':
                this.navigate('notifications');
                break;

            // 성적 추이 탭 전환
            case 'grade-detail-view':
                this._gradeDetailView = target.dataset.mode;
                this.renderStudentDetail(target.dataset.studentId);
                break;

            // 시간표 actions
            case 'schedule-add':
                this.openScheduleModal(null);
                break;

            case 'schedule-edit':
                this.openScheduleModal(target.dataset.id);
                break;

            case 'schedule-delete': {
                if (!confirm('이 수업을 삭제하시겠습니까?')) break;
                try {
                    await DataStore.deleteSchedule(target.dataset.id);
                    this.toast('삭제되었습니다.', 'success');
                    this.renderSchedule();
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'schedule-save': {
                const day = document.getElementById('sch-day').value;
                const subject = (document.getElementById('sch-subject').value || '').trim();
                if (!subject) { this.toast('과목을 입력해주세요.', 'warning'); break; }
                const startTime = document.getElementById('sch-start').value;
                const endTime = document.getElementById('sch-end').value;
                if (!startTime || !endTime) { this.toast('시간을 입력해주세요.', 'warning'); break; }
                const teacherName = (document.getElementById('sch-teacher').value || '').trim();
                const room = (document.getElementById('sch-room').value || '').trim();
                const colorEl = document.querySelector('input[name="sch-color"]:checked');
                const color = colorEl ? colorEl.value : '#4F46E5';
                const studentIds = [...document.querySelectorAll('.sch-student-chk:checked')].map(el => el.value);
                const editId = target.dataset.id;
                try {
                    if (editId) {
                        await DataStore.updateSchedule(editId, { dayOfWeek: day, subject, startTime, endTime, teacherName, room, color, studentIds });
                        this.toast('수정되었습니다.', 'success');
                    } else {
                        await DataStore.addSchedule({
                            dayOfWeek: day, subject, startTime, endTime,
                            teacherName, teacherId: this.currentUser?.id || '',
                            room, color, studentIds
                        });
                        this.toast('수업이 추가되었습니다.', 'success');
                    }
                    this.closeModal();
                    this.renderSchedule();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            // 학부모 홈 actions
            case 'parent-view-detail':
                this.navigate('student-detail', { studentId: this.currentUser.studentId });
                break;

            // 비교 분석 actions
            case 'analytics-filter':
                this._analyticsGrade = target.dataset.grade;
                this.renderAnalytics();
                break;

            // 수업료 관리 actions
            case 'tuition-prev-month': {
                const [ty, tm] = (this._tuitionYM || new Date().toISOString().slice(0,7)).split('-').map(Number);
                const d = new Date(ty, tm - 2, 1);
                this._tuitionYM = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                this.renderTuition();
                break;
            }
            case 'tuition-next-month': {
                const [ty, tm] = (this._tuitionYM || new Date().toISOString().slice(0,7)).split('-').map(Number);
                const d = new Date(ty, tm, 1);
                this._tuitionYM = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                this.renderTuition();
                break;
            }
            case 'tuition-edit':
                this.openTuitionEditModal(target.dataset.studentId, target.dataset.ym);
                break;

            case 'tuition-bulk-set':
                this.openTuitionBulkModal(target.dataset.ym);
                break;

            case 'tuition-save': {
                const amount = parseInt(document.getElementById('tuition-amount').value) || 0;
                const paidAmount = parseInt(document.getElementById('tuition-paid').value) || 0;
                const paidDate = document.getElementById('tuition-paid-date').value;
                const note = document.getElementById('tuition-note').value.trim();
                let status = '미납';
                if (amount > 0 && paidAmount >= amount) status = '납부완료';
                else if (paidAmount > 0) status = '부분납부';
                try {
                    await DataStore.upsertTuition({
                        studentId: target.dataset.studentId,
                        yearMonth: target.dataset.ym,
                        amount, paidAmount, status, paidDate, note
                    });
                    this.closeModal();
                    this.renderTuition();
                    this.toast('저장되었습니다.', 'success');
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }
            case 'tuition-delete': {
                if (!confirm('이 납부 기록을 삭제하시겠습니까?')) break;
                try {
                    await DataStore._delete(DataStore.TABLES.TUITION, target.dataset.id);
                    this.closeModal();
                    this.renderTuition();
                    this.toast('삭제되었습니다.', 'success');
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }
            case 'tuition-bulk-save': {
                const bulkAmount = parseInt(document.getElementById('tuition-bulk-amount').value) || 0;
                if (!bulkAmount) { this.toast('금액을 입력해주세요.', 'warning'); break; }
                const allStudents = DataStore.getStudents().filter(s => s.status !== '퇴원');
                try {
                    for (const s of allStudents) {
                        const existing = DataStore.getStudentTuitionRecord(s.id, target.dataset.ym);
                        await DataStore.upsertTuition({
                            studentId: s.id,
                            yearMonth: target.dataset.ym,
                            amount: bulkAmount,
                            paidAmount: existing?.paidAmount || 0,
                            status: existing?.status || '미납',
                            paidDate: existing?.paidDate || '',
                            note: existing?.note || ''
                        });
                    }
                    this.closeModal();
                    this.renderTuition();
                    this.toast(`${allStudents.length}명에게 수업료가 설정되었습니다.`, 'success');
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            // 시험 플래너 actions
            case 'exam-add-item': {
                const container = document.getElementById('exam-checklist-rows');
                if (!container) break;
                const row = document.createElement('div');
                row.className = 'exam-item-input-row';
                row.innerHTML = `
                    <input type="text" class="form-control exam-item-subject" placeholder="과목 (예: 수학)" style="width:100px;flex-shrink:0">
                    <input type="text" class="form-control exam-item-text" placeholder="항목 내용 (예: 2단원 개념 정리)" style="flex:1">
                    <button class="btn-icon" style="color:var(--danger)" onclick="this.closest('.exam-item-input-row').remove()"><i class="fas fa-times"></i></button>`;
                container.appendChild(row);
                row.querySelector('.exam-item-text').focus();
                break;
            }

            case 'add-exam-plan': {
                const name = (document.getElementById('exam-name') || {}).value || '';
                if (!name.trim()) { this.toast('시험명을 입력해주세요.', 'warning'); break; }
                const date = (document.getElementById('exam-date') || {}).value || '';
                const checked = [...document.querySelectorAll('.exam-student-chk:checked')].map(el => el.value);
                // 체크리스트 아이템 수집
                const checklist = [...document.querySelectorAll('.exam-item-input-row')].map((row, i) => ({
                    id: `ci_${Date.now()}_${i}`,
                    subject: (row.querySelector('.exam-item-subject') || {}).value || '',
                    text: (row.querySelector('.exam-item-text') || {}).value || '',
                    completedBy: []
                })).filter(item => item.text.trim());
                try {
                    await DataStore.addExamPlan({
                        examName: name.trim(),
                        examDate: date || null,
                        studentIds: checked,
                        checklist,
                        assignedBy: this.currentUser ? this.currentUser.name : '',
                        assignedById: this.currentUser ? this.currentUser.id : ''
                    });
                    this.toast('시험 일정이 등록되었습니다.', 'success');
                    this.renderExam();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-exam-plan': {
                if (!confirm('이 시험 일정을 삭제하시겠습니까?')) break;
                try {
                    await DataStore.deleteExamPlan(target.dataset.planId);
                    this.toast('삭제되었습니다.', 'success');
                    this.renderExam();
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'exam-toggle-item': {
                const { planId, itemId, studentId } = target.dataset;
                const checked = target.checked;
                try {
                    await DataStore.toggleExamCheckItem(planId, itemId, studentId, checked);
                    if (this.currentView === 'exam') this.renderExam();
                    else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                    this.updateExamBadge();
                } catch(err) {
                    target.checked = !checked; // 롤백
                    this.toast('저장 실패: ' + err.message, 'error');
                }
                break;
            }

            // 숙제 관리 actions
            case 'add-homework': {
                const title = (document.getElementById('hw-title') || {}).value || '';
                if (!title.trim()) { this.toast('숙제 제목을 입력해주세요.', 'warning'); break; }
                const subject = (document.getElementById('hw-subject') || {}).value || '';
                const description = (document.getElementById('hw-description') || {}).value || '';
                const dueDate = (document.getElementById('hw-due-date') || {}).value || '';
                const checked = [...document.querySelectorAll('.hw-student-chk:checked')].map(el => el.value);
                try {
                    await DataStore.addHomework({
                        title: title.trim(),
                        subject: subject.trim(),
                        description: description.trim(),
                        dueDate: dueDate || null,
                        studentIds: checked,
                        completedBy: [],
                        assignedBy: this.currentUser ? this.currentUser.name : '',
                        assignedById: this.currentUser ? this.currentUser.id : ''
                    });
                    this.toast('숙제가 출제되었습니다.', 'success');
                    this.renderHomework();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'delete-homework': {
                if (!confirm('이 숙제를 삭제하시겠습니까?')) break;
                try {
                    await DataStore.deleteHomework(target.dataset.hwId);
                    this.toast('삭제되었습니다.', 'success');
                    this.renderHomework();
                } catch(err) { this.toast('삭제 실패: ' + err.message, 'error'); }
                break;
            }

            case 'hw-complete': {
                const { hwId, studentId } = target.dataset;
                try {
                    await DataStore.markHomeworkComplete(hwId, studentId);
                    this.toast('완료 처리되었습니다!', 'success');
                    if (this.currentView === 'homework') this.renderHomework();
                    else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                    this.updateHomeworkBadge();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }

            case 'hw-incomplete': {
                const { hwId, studentId } = target.dataset;
                try {
                    await DataStore.markHomeworkIncomplete(hwId, studentId);
                    this.toast('완료가 취소되었습니다.', 'success');
                    if (this.currentView === 'homework') this.renderHomework();
                    else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
                    this.updateHomeworkBadge();
                } catch(err) { this.toast('저장 실패: ' + err.message, 'error'); }
                break;
            }
        }
    },

    // =========================================
    //  NOTIFICATIONS (알림 센터)
    // =========================================
    generateNotifications() {
        const role = this.currentUser ? this.currentUser.role : '';
        const today = this.getLocalDateStr();
        const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().slice(0, 10);
        const in3 = new Date(new Date(today).getTime() + 3 * 86400000).toISOString().slice(0, 10);
        const in7 = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
        const notifs = [];

        if (role === 'student') {
            const sid = this.currentUser.studentId;

            // 미완료 숙제 마감 임박
            (DataStore._cache['homework'] || [])
                .filter(h => {
                    const ids = h.studentIds || [];
                    return (ids.length === 0 || ids.includes(sid)) && h.dueDate && !(h.completedBy || []).includes(sid);
                })
                .forEach(h => {
                    const diff = Math.ceil((new Date(h.dueDate) - new Date(today)) / 86400000);
                    if (diff <= 1) {
                        notifs.push({ urgent: true, icon: 'fa-tasks', color: diff < 0 ? 'var(--danger)' : 'var(--warning)', title: diff < 0 ? '기한 만료 숙제' : diff === 0 ? '오늘 마감 숙제' : '내일 마감 숙제', desc: h.title, date: h.dueDate });
                    }
                });

            // 시험 D-3 이내
            (DataStore._cache['exam_plans'] || [])
                .filter(ep => { const ids = ep.studentIds || []; return (ids.length === 0 || ids.includes(sid)) && ep.examDate && ep.examDate >= today && ep.examDate <= in3; })
                .forEach(ep => {
                    const diff = Math.ceil((new Date(ep.examDate) - new Date(today)) / 86400000);
                    notifs.push({ urgent: diff <= 1, icon: 'fa-clipboard-list', color: diff === 0 ? 'var(--danger)' : 'var(--warning)', title: diff === 0 ? 'D-DAY 시험' : `D-${diff} 시험 임박`, desc: ep.examName, date: ep.examDate });
                });

            // 최근 7일 코멘트
            const week7ago = new Date(new Date(today).getTime() - 7 * 86400000).toISOString().slice(0, 10);
            const recentC = (DataStore._cache['comments'] || []).filter(c => c.studentId === sid && (c.createdAt || '') >= week7ago && Permissions.canViewComment(c));
            if (recentC.length > 0) {
                notifs.push({ urgent: false, icon: 'fa-comment', color: 'var(--primary)', title: `새 코멘트 ${recentC.length}개`, desc: '최근 7일간 새로운 코멘트가 있습니다', date: null });
            }

        } else {
            const students = this.getVisibleStudents();
            const teacherId = role === 'teacher' ? this.currentUser.id : null;

            // 마감 D-1 이하 미완료 숙제
            (DataStore._cache['homework'] || [])
                .filter(h => h.dueDate && h.dueDate >= today && h.dueDate <= tomorrow)
                .forEach(h => {
                    const total = h.studentIds && h.studentIds.length > 0 ? h.studentIds.length : students.length;
                    const done = (h.completedBy || []).length;
                    if (done < total) {
                        const diff = Math.ceil((new Date(h.dueDate) - new Date(today)) / 86400000);
                        notifs.push({ urgent: diff === 0, icon: 'fa-tasks', color: diff === 0 ? 'var(--danger)' : 'var(--warning)', title: diff === 0 ? '오늘 마감 숙제' : '내일 마감 숙제', desc: `${h.title} — ${done}/${total}명 완료`, date: h.dueDate });
                    }
                });

            // 시험 D-3 이내
            (DataStore._cache['exam_plans'] || [])
                .filter(ep => ep.examDate && ep.examDate >= today && ep.examDate <= in3)
                .forEach(ep => {
                    const diff = Math.ceil((new Date(ep.examDate) - new Date(today)) / 86400000);
                    notifs.push({ urgent: diff <= 1, icon: 'fa-clipboard-list', color: diff === 0 ? 'var(--danger)' : 'var(--warning)', title: diff === 0 ? 'D-DAY 시험' : `D-${diff} 시험 임박`, desc: ep.examName, date: ep.examDate });
                });

            // 다음 상담 D-3 이내
            (DataStore._cache['consultations'] || [])
                .filter(c => c.nextDate && c.nextDate >= today && c.nextDate <= in3 && (!teacherId || c.teacherId === teacherId))
                .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
                .forEach(c => {
                    const s = DataStore.getStudent(c.studentId);
                    const diff = Math.ceil((new Date(c.nextDate) - new Date(today)) / 86400000);
                    notifs.push({ urgent: diff === 0, icon: 'fa-comments', color: 'var(--success)', title: diff === 0 ? '오늘 상담 예정' : `D-${diff} 상담 예정`, desc: (s ? s.name : '') + (c.nextMemo ? ` — ${c.nextMemo}` : ''), date: c.nextDate });
                });

            // 출석 미입력 (데이터가 로드된 경우만)
            if (DataStore._loaded.has(DataStore.TABLES.ATTENDANCE)) {
                const attended = new Set((DataStore._cache['attendance'] || []).filter(a => a.date === today).map(a => a.studentId));
                const notEntered = students.filter(s => !attended.has(s.id));
                if (notEntered.length > 0) {
                    notifs.push({ urgent: false, icon: 'fa-calendar-check', color: 'var(--info)', title: `오늘 출석 미입력 ${notEntered.length}명`, desc: notEntered.map(s => s.name).join(', '), date: today });
                }
            }

            // 미완료 숙제 있는 학생 (7일 이내 마감)
            if (DataStore._loaded.has(DataStore.TABLES.HOMEWORK)) {
                const urgentHw = (DataStore._cache['homework'] || []).filter(h => h.dueDate && h.dueDate >= today && h.dueDate <= in7);
                if (urgentHw.length > 0) {
                    const totalPending = urgentHw.reduce((sum, h) => {
                        const total = h.studentIds && h.studentIds.length > 0 ? h.studentIds.length : students.length;
                        return sum + (total - (h.completedBy || []).length);
                    }, 0);
                    if (totalPending > 0) {
                        notifs.push({ urgent: false, icon: 'fa-tasks', color: 'var(--primary)', title: `7일 이내 마감 숙제 미완료`, desc: `${urgentHw.length}개 숙제 중 미완료 ${totalPending}건`, date: null });
                    }
                }
            }
        }

        return notifs.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
    },

    updateNotificationBadge() {
        const count = this.generateNotifications().filter(n => n.urgent).length;
        ['notif-header-badge', 'notif-nav-badge'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = count;
            el.style.display = count > 0 ? '' : 'none';
        });
    },

    renderNotifications() {
        const notifs = this.generateNotifications();
        const urgent = notifs.filter(n => n.urgent);
        const normal = notifs.filter(n => !n.urgent);

        const notifCard = (n) => `
        <div class="notif-item ${n.urgent ? 'notif-urgent' : ''}">
            <div class="notif-icon" style="background:${n.color}1a;color:${n.color}">
                <i class="fas ${n.icon}"></i>
            </div>
            <div class="notif-body">
                <div class="notif-title">${this.escapeHtml(n.title)}</div>
                <div class="notif-desc">${this.escapeHtml(n.desc || '')}</div>
                ${n.date ? `<div class="notif-date"><i class="fas fa-clock"></i> ${n.date}</div>` : ''}
            </div>
            ${n.urgent ? '<span class="notif-dot"></span>' : ''}
        </div>`;

        const html = `
        ${urgent.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--danger)">
            <div class="card-header"><h2><i class="fas fa-exclamation-circle" style="color:var(--danger)"></i> 긴급 알림 (${urgent.length})</h2></div>
            <div class="card-body" style="padding:0">${urgent.map(n => notifCard(n)).join('')}</div>
        </div>` : ''}

        <div class="card">
            <div class="card-header"><h2><i class="fas fa-bell" style="color:var(--primary)"></i> 알림 ${normal.length > 0 ? `(${normal.length})` : ''}</h2></div>
            <div class="card-body" style="padding:${normal.length ? '0' : ''}">
                ${normal.length === 0 && urgent.length === 0
                    ? '<div class="empty-state" style="padding:40px"><i class="fas fa-check-circle" style="color:var(--success)"></i><h3>새로운 알림이 없습니다</h3><p>모든 일정이 정상입니다!</p></div>'
                    : normal.length === 0
                        ? '<div style="color:var(--gray-300);padding:16px;text-align:center;font-size:0.88rem">추가 알림이 없습니다</div>'
                        : normal.map(n => notifCard(n)).join('')}
            </div>
        </div>

        <div style="text-align:center;padding:16px 0;font-size:0.78rem;color:var(--gray-300)">
            <i class="fas fa-info-circle"></i> 알림은 현재 로드된 데이터 기준으로 생성됩니다. 최신 데이터를 보려면 해당 메뉴를 방문하세요.
        </div>`;

        document.getElementById('content-area').innerHTML = html;
        this.updateNotificationBadge();
    },

    // =========================================
    //  VIEW: CONSULTATIONS (상담 일지)
    // =========================================
    renderConsultations(focusStudentId) {
        const today = this.getLocalDateStr();
        const students = this.getVisibleStudents();
        const allConsults = DataStore.getConsultations();
        const upcoming = DataStore.getUpcomingConsultations(
            this.currentUser && this.currentUser.role === 'teacher' ? this.currentUser.id : null
        );

        // 필터: 선택된 학생 or 전체
        const filterStudentId = focusStudentId || this._consultStudentId || '';
        this._consultStudentId = filterStudentId;
        const filtered = filterStudentId
            ? allConsults.filter(c => c.studentId === filterStudentId)
            : allConsults;

        const TYPES = ['학생상담', '학부모상담', '기타'];
        const TYPE_COLOR = { '학생상담': 'var(--primary)', '학부모상담': 'var(--success)', '기타': 'var(--gray-400)' };

        const consultRow = (c) => {
            const student = DataStore.getStudent(c.studentId);
            return `
            <div class="consult-item">
                <div class="consult-left">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
                        <span class="badge" style="background:${TYPE_COLOR[c.type]||'var(--gray-400)'};color:white;font-size:0.72rem">${this.escapeHtml(c.type)}</span>
                        <span style="font-weight:600;font-size:0.9rem;color:var(--gray-800)">${this.escapeHtml(c.date)}</span>
                        ${!filterStudentId && student ? `<span style="font-size:0.82rem;color:var(--primary)"><i class="fas fa-user-graduate"></i> ${this.escapeHtml(student.name)}</span>` : ''}
                        <span style="font-size:0.78rem;color:var(--gray-400);margin-left:auto"><i class="fas fa-user-tie"></i> ${this.escapeHtml(c.teacherName || '')}</span>
                    </div>
                    <div class="consult-content">${this.escapeHtml(c.content)}</div>
                    ${c.nextDate ? `
                    <div class="consult-next">
                        <i class="fas fa-arrow-right" style="color:var(--warning)"></i>
                        <span style="font-weight:600;color:var(--warning)">다음 상담: ${c.nextDate}</span>
                        ${c.nextMemo ? `<span style="color:var(--gray-500);font-size:0.82rem"> — ${this.escapeHtml(c.nextMemo)}</span>` : ''}
                    </div>` : ''}
                </div>
                <button class="btn-icon" data-action="delete-consultation" data-consult-id="${c.id}" title="삭제" style="color:var(--danger);flex-shrink:0"><i class="fas fa-trash"></i></button>
            </div>`;
        };

        // 학생 필터 선택
        const studentFilter = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <label style="font-weight:600">학생 필터</label>
            <select id="consult-student-filter" class="form-control" style="max-width:180px">
                <option value="">전체 학생</option>
                ${students.map(s => `<option value="${s.id}" ${s.id === filterStudentId ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})</option>`).join('')}
            </select>
        </div>`;

        const html = `
        <!-- 다음 상담 예정 배너 -->
        ${upcoming.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border-left:4px solid var(--warning)">
            <div class="card-body" style="padding:14px 18px">
                <div style="font-weight:700;color:var(--warning);margin-bottom:8px"><i class="fas fa-bell"></i> 다음 상담 예정 (${upcoming.length}건)</div>
                ${upcoming.slice(0, 3).map(c => {
                    const s = DataStore.getStudent(c.studentId);
                    const diff = Math.ceil((new Date(c.nextDate) - new Date(today)) / 86400000);
                    return `<div style="font-size:0.85rem;padding:3px 0;display:flex;gap:10px;align-items:center">
                        <span style="font-weight:600;color:var(--warning);min-width:55px">D-${diff}</span>
                        <span>${c.nextDate}</span>
                        ${s ? `<span style="color:var(--primary)"><i class="fas fa-user-graduate"></i> ${this.escapeHtml(s.name)}</span>` : ''}
                        ${c.nextMemo ? `<span style="color:var(--gray-500)">${this.escapeHtml(c.nextMemo)}</span>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- 상담 기록 추가 폼 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2><i class="fas fa-plus"></i> 상담 기록 추가</h2></div>
            <div class="card-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>학생 <span class="required">*</span></label>
                        <select id="consult-student-id" class="form-control">
                            <option value="">학생 선택</option>
                            ${students.map(s => `<option value="${s.id}" ${s.id === filterStudentId ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>상담 유형</label>
                        <select id="consult-type" class="form-control">
                            ${TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>상담 날짜</label>
                        <input type="date" id="consult-date" class="form-control" value="${today}">
                    </div>
                </div>
                <div class="form-group">
                    <label>상담 내용 <span class="required">*</span></label>
                    <textarea id="consult-content" class="form-control" rows="3" placeholder="상담 내용을 입력하세요..."></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>다음 상담 예정일 <span style="color:var(--gray-400);font-size:0.78rem">(선택)</span></label>
                        <input type="date" id="consult-next-date" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>다음 상담 메모 <span style="color:var(--gray-400);font-size:0.78rem">(선택)</span></label>
                        <input type="text" id="consult-next-memo" class="form-control" placeholder="다음 상담 시 확인할 내용">
                    </div>
                </div>
                <button class="btn btn-primary" data-action="add-consultation"><i class="fas fa-save"></i> 기록 저장</button>
            </div>
        </div>

        <!-- 상담 기록 목록 -->
        <div class="card">
            <div class="card-header">
                <h2><i class="fas fa-history"></i> 상담 기록 (${filtered.length}건)</h2>
                ${studentFilter}
            </div>
            <div class="card-body" style="padding:${filtered.length ? '0' : ''}">
                ${filtered.length === 0
                    ? '<div class="empty-state" style="padding:30px"><i class="fas fa-comments"></i><h3>상담 기록이 없습니다</h3></div>'
                    : filtered.map(c => consultRow(c)).join('')}
            </div>
        </div>`;

        document.getElementById('content-area').innerHTML = html;

        // 학생 필터 이벤트
        const sel = document.getElementById('consult-student-filter');
        if (sel) {
            sel.addEventListener('change', () => {
                this._consultStudentId = sel.value;
                this.renderConsultations();
            });
        }
        this.updateConsultBadge();
    },

    // 상담 일지 배지 업데이트 (다음 상담 예정 건수)
    updateConsultBadge() {
        const badge = document.getElementById('consult-badge');
        if (!badge) return;
        const role = this.currentUser ? this.currentUser.role : '';
        if (role === 'director' || role === 'teacher') {
            const teacherId = role === 'teacher' ? this.currentUser.id : null;
            const count = DataStore.getUpcomingConsultations(teacherId).length;
            badge.textContent = count;
            badge.style.display = count > 0 ? '' : 'none';
        } else {
            badge.style.display = 'none';
        }
    },

    // 학생 상세 상담 미니카드
    renderConsultationMiniCard(studentId, canEdit) {
        const records = DataStore.getStudentConsultations(studentId);
        const today = this.getLocalDateStr();
        if (records.length === 0 && !canEdit) return '';

        const latest = records[0];
        const nextUpcoming = records.find(c => c.nextDate && c.nextDate >= today);

        return `
        <div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <h2><i class="fas fa-comments"></i> 상담 일지</h2>
                <div style="display:flex;gap:8px;align-items:center">
                    <span class="badge badge-primary">총 ${records.length}회</span>
                    ${canEdit ? `<button class="btn btn-sm btn-outline" data-action="go-consultations" data-student-id="${studentId}"><i class="fas fa-plus"></i> 상담 기록</button>` : ''}
                </div>
            </div>
            <div class="card-body" style="padding:${records.length ? '12px 20px' : ''}">
                ${records.length === 0
                    ? '<div style="color:var(--gray-300);padding:8px 0;font-size:0.85rem">상담 기록이 없습니다.</div>'
                    : `
                    ${nextUpcoming ? `
                    <div style="background:#FFFBEB;border:1px solid var(--warning);border-radius:8px;padding:10px 14px;margin-bottom:10px">
                        <div style="font-size:0.82rem;font-weight:600;color:var(--warning)"><i class="fas fa-bell"></i> 다음 상담 예정: ${nextUpcoming.nextDate}</div>
                        ${nextUpcoming.nextMemo ? `<div style="font-size:0.78rem;color:var(--gray-600);margin-top:2px">${this.escapeHtml(nextUpcoming.nextMemo)}</div>` : ''}
                    </div>` : ''}
                    ${latest ? `
                    <div style="font-size:0.85rem">
                        <span style="color:var(--gray-400)">최근 상담</span>
                        <span style="font-weight:600;margin-left:8px">${latest.date}</span>
                        <span class="badge" style="background:${latest.type === '학부모상담' ? 'var(--success)' : 'var(--primary)'};color:white;font-size:0.68rem;margin-left:4px">${this.escapeHtml(latest.type)}</span>
                        <div style="margin-top:4px;color:var(--gray-600);font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.escapeHtml((latest.content || '').slice(0, 60))}${latest.content && latest.content.length > 60 ? '...' : ''}</div>
                    </div>` : ''}
                    `}
            </div>
        </div>`;
    },

    // =========================================
    //  VIEW: EXAM PLANNER (시험 플래너)
    // =========================================
    renderExam() {
        const role = this.currentUser ? this.currentUser.role : '';
        const isStudent = role === 'student';
        const today = this.getLocalDateStr();
        const students = this.getVisibleStudents();

        // D-day 계산
        const getDday = (dateStr) => {
            if (!dateStr) return null;
            const diff = Math.ceil((new Date(dateStr) - new Date(today)) / 86400000);
            return diff;
        };
        const ddayLabel = (d) => {
            if (d === null) return '';
            if (d < 0) return `<span class="exam-dday past">D+${Math.abs(d)}</span>`;
            if (d === 0) return `<span class="exam-dday today">D-DAY</span>`;
            if (d <= 7) return `<span class="exam-dday soon">D-${d}</span>`;
            return `<span class="exam-dday normal">D-${d}</span>`;
        };

        if (isStudent) {
            // ── 학생 뷰 ──
            const studentId = this.currentUser.studentId;
            const plans = DataStore.getExamPlansForStudent(studentId);
            const upcoming = plans.filter(ep => !ep.examDate || ep.examDate >= today);
            const past = plans.filter(ep => ep.examDate && ep.examDate < today);

            const planCard = (ep, isPast) => {
                const d = getDday(ep.examDate);
                const checklist = ep.checklist || [];
                const myDone = checklist.filter(item => (item.completedBy || []).includes(studentId)).length;
                const rate = checklist.length > 0 ? Math.round((myDone / checklist.length) * 100) : null;
                return `
                <div class="exam-card ${isPast ? 'exam-past' : ''}">
                    <div class="exam-card-header">
                        <div>
                            <div class="exam-name">${this.escapeHtml(ep.examName)}</div>
                            <div class="exam-date"><i class="fas fa-calendar"></i> ${ep.examDate || '날짜 미정'}</div>
                        </div>
                        <div style="text-align:right">
                            ${ddayLabel(d)}
                            ${rate !== null ? `<div style="font-size:0.78rem;color:var(--gray-400);margin-top:4px">준비 ${myDone}/${checklist.length}</div>` : ''}
                        </div>
                    </div>
                    ${checklist.length > 0 ? `
                    <div class="exam-checklist">
                        ${checklist.map(item => {
                            const done = (item.completedBy || []).includes(studentId);
                            return `<label class="exam-check-item ${done ? 'done' : ''}">
                                <input type="checkbox" ${done ? 'checked' : ''} ${isPast ? 'disabled' : ''}
                                    data-action="exam-toggle-item"
                                    data-plan-id="${ep.id}"
                                    data-item-id="${item.id}"
                                    data-student-id="${studentId}"
                                    data-checked="${done ? '1' : '0'}">
                                <span class="exam-check-subject">${this.escapeHtml(item.subject || '')}</span>
                                <span class="exam-check-text">${this.escapeHtml(item.text)}</span>
                            </label>`;
                        }).join('')}
                        ${rate !== null ? `
                        <div style="margin-top:10px">
                            <div style="background:var(--gray-100);border-radius:6px;height:8px;overflow:hidden">
                                <div style="width:${rate}%;background:${rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--primary)'};height:100%;border-radius:6px;transition:width 0.4s"></div>
                            </div>
                            <div style="text-align:right;font-size:0.75rem;font-weight:600;margin-top:2px;color:var(--gray-500)">${rate}% 완료</div>
                        </div>` : ''}
                    </div>` : '<div style="padding:10px 0;color:var(--gray-300);font-size:0.85rem">준비 항목이 없습니다.</div>'}
                </div>`;
            };

            const html = `
            <div class="card" style="margin-bottom:16px">
                <div class="card-header"><h2><i class="fas fa-hourglass-half"></i> 다가오는 시험 (${upcoming.length})</h2></div>
                <div class="card-body" style="padding:${upcoming.length ? '12px' : ''}">
                    ${upcoming.length === 0
                        ? '<div class="empty-state" style="padding:30px"><i class="fas fa-check-circle" style="color:var(--success)"></i><h3>예정된 시험이 없습니다</h3></div>'
                        : upcoming.map(ep => planCard(ep, false)).join('')}
                </div>
            </div>
            ${past.length > 0 ? `
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-history"></i> 지난 시험 (${past.length})</h2></div>
                <div class="card-body" style="padding:12px">
                    ${past.map(ep => planCard(ep, true)).join('')}
                </div>
            </div>` : ''}`;

            document.getElementById('content-area').innerHTML = html;
            this.updateExamBadge();
            return;
        }

        // ── 선생/원장 뷰 ──
        const allPlans = DataStore.getExamPlans();
        const upcoming = allPlans.filter(ep => !ep.examDate || ep.examDate >= today);
        const past = allPlans.filter(ep => ep.examDate && ep.examDate < today);

        // 학생 체크박스
        const studentCheckboxes = students.map(s =>
            `<label style="display:flex;align-items:center;gap:6px;margin-right:12px;cursor:pointer">
                <input type="checkbox" class="exam-student-chk" value="${s.id}"> ${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})
             </label>`
        ).join('');

        const managerCard = (ep, isPast) => {
            const d = getDday(ep.examDate);
            const checklist = ep.checklist || [];
            const assignedStudents = ep.studentIds && ep.studentIds.length > 0
                ? ep.studentIds.map(id => { const s = DataStore.getStudent(id); return s ? s.name : id; }).join(', ')
                : '전체';
            return `
            <div class="exam-card ${isPast ? 'exam-past' : ''}">
                <div class="exam-card-header">
                    <div>
                        <div class="exam-name">${this.escapeHtml(ep.examName)}</div>
                        <div class="exam-date"><i class="fas fa-calendar"></i> ${ep.examDate || '날짜 미정'} &nbsp;·&nbsp; <i class="fas fa-users"></i> ${this.escapeHtml(assignedStudents)}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        ${ddayLabel(d)}
                        <button class="btn-icon" data-action="delete-exam-plan" data-plan-id="${ep.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                ${checklist.length > 0 ? `
                <div style="padding:8px 0 0">
                    <div style="font-size:0.78rem;font-weight:600;color:var(--gray-500);margin-bottom:6px">준비 항목 (${checklist.length}개)</div>
                    ${checklist.map(item => `
                    <div style="font-size:0.83rem;padding:3px 0;display:flex;align-items:center;gap:6px">
                        <i class="fas fa-check-circle" style="color:var(--gray-200)"></i>
                        ${item.subject ? `<span class="badge badge-primary" style="font-size:0.68rem">${this.escapeHtml(item.subject)}</span>` : ''}
                        <span>${this.escapeHtml(item.text)}</span>
                    </div>`).join('')}
                </div>` : ''}
            </div>`;
        };

        const html = `
        <!-- 시험 일정 추가 폼 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2><i class="fas fa-plus"></i> 시험 일정 추가</h2></div>
            <div class="card-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>시험명 <span class="required">*</span></label>
                        <input type="text" id="exam-name" class="form-control" placeholder="예: 1학기 중간고사, 수능 모의고사">
                    </div>
                    <div class="form-group">
                        <label>시험 날짜</label>
                        <input type="date" id="exam-date" class="form-control" value="${today}">
                    </div>
                </div>
                <div class="form-group">
                    <label>대상 학생 <span style="font-size:0.78rem;color:var(--gray-400)">(미선택 시 전체)</span></label>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;border:1px solid var(--gray-200);border-radius:8px;min-height:38px">
                        ${studentCheckboxes || '<span style="color:var(--gray-300);font-size:0.85rem">담당 학생이 없습니다</span>'}
                    </div>
                </div>
                <!-- 준비 항목 동적 추가 -->
                <div style="margin-bottom:12px">
                    <label style="font-weight:600;margin-bottom:8px;display:block">준비 체크리스트 항목</label>
                    <div id="exam-checklist-rows"></div>
                    <button class="btn btn-outline btn-sm" data-action="exam-add-item" style="margin-top:6px">
                        <i class="fas fa-plus"></i> 항목 추가
                    </button>
                </div>
                <button class="btn btn-primary" data-action="add-exam-plan"><i class="fas fa-paper-plane"></i> 등록하기</button>
            </div>
        </div>

        <!-- 다가오는 시험 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2><i class="fas fa-hourglass-half"></i> 예정된 시험 (${upcoming.length})</h2></div>
            <div class="card-body" style="padding:${upcoming.length ? '12px' : ''}">
                ${upcoming.length === 0
                    ? '<div class="empty-state" style="padding:24px"><i class="fas fa-calendar-plus"></i><h3>예정된 시험이 없습니다</h3></div>'
                    : upcoming.map(ep => managerCard(ep, false)).join('')}
            </div>
        </div>

        <!-- 지난 시험 -->
        ${past.length > 0 ? `
        <div class="card">
            <div class="card-header"><h2><i class="fas fa-history"></i> 지난 시험 (${past.length})</h2></div>
            <div class="card-body" style="padding:12px">
                ${past.map(ep => managerCard(ep, true)).join('')}
            </div>
        </div>` : ''}`;

        document.getElementById('content-area').innerHTML = html;
    },

    // 시험 플래너 배지 업데이트 (학생용 - 임박 시험)
    updateExamBadge() {
        const badge = document.getElementById('exam-badge');
        if (!badge) return;
        const role = this.currentUser ? this.currentUser.role : '';
        if (role === 'student' && this.currentUser.studentId) {
            const today = this.getLocalDateStr();
            const week = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
            const soon = DataStore.getExamPlansForStudent(this.currentUser.studentId)
                .filter(ep => ep.examDate && ep.examDate >= today && ep.examDate <= week).length;
            badge.textContent = soon;
            badge.style.display = soon > 0 ? '' : 'none';
        } else {
            badge.style.display = 'none';
        }
    },

    // 학생 상세 시험 미니카드
    renderExamMiniCard(studentId) {
        const today = this.getLocalDateStr();
        const plans = DataStore.getExamPlansForStudent(studentId)
            .filter(ep => !ep.examDate || ep.examDate >= today)
            .slice(0, 3);
        if (plans.length === 0) return '';

        const rows = plans.map(ep => {
            const diff = ep.examDate ? Math.ceil((new Date(ep.examDate) - new Date(today)) / 86400000) : null;
            const checklist = ep.checklist || [];
            const done = checklist.filter(item => (item.completedBy || []).includes(studentId)).length;
            const color = diff !== null && diff <= 3 ? 'var(--danger)' : diff !== null && diff <= 7 ? 'var(--warning)' : 'var(--primary)';
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100)">
                <span style="flex:1;font-weight:600;font-size:0.85rem">${this.escapeHtml(ep.examName)}</span>
                ${ep.examDate ? `<span style="font-size:0.75rem;font-weight:700;color:${color}">${diff === 0 ? 'D-DAY' : diff !== null ? `D-${diff}` : ''}</span>` : ''}
                ${checklist.length > 0 ? `<span style="font-size:0.72rem;color:var(--gray-400)">${done}/${checklist.length} 완료</span>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <h2><i class="fas fa-clipboard-list"></i> 시험 일정</h2>
                <span class="badge badge-primary">${plans.length}개 예정</span>
            </div>
            <div class="card-body" style="padding:8px 20px">${rows}</div>
        </div>`;
    },

    // =========================================
    //  VIEW: HOMEWORK (숙제 관리)
    // =========================================
    renderHomework() {
        const role = this.currentUser ? this.currentUser.role : '';
        const isStudent = role === 'student';
        const today = this.getLocalDateStr();

        if (isStudent) {
            // 학생 뷰: 내 숙제 목록
            const studentId = this.currentUser.studentId;
            const allHw = DataStore.getHomeworkForStudent(studentId);
            const pending = allHw.filter(h => !DataStore.isHomeworkCompletedBy(h, studentId));
            const done = allHw.filter(h => DataStore.isHomeworkCompletedBy(h, studentId));

            const hwRow = (h, completed) => {
                const isOverdue = h.dueDate && h.dueDate < today && !completed;
                const daysLeft = h.dueDate ? Math.ceil((new Date(h.dueDate) - new Date(today)) / 86400000) : null;
                const dueBadge = h.dueDate
                    ? isOverdue
                        ? `<span style="color:var(--danger);font-size:0.78rem;font-weight:600"><i class="fas fa-exclamation-circle"></i> 기한만료 (${h.dueDate})</span>`
                        : daysLeft === 0
                            ? `<span style="color:var(--warning);font-size:0.78rem;font-weight:600"><i class="fas fa-clock"></i> 오늘 마감</span>`
                            : `<span style="color:var(--gray-500);font-size:0.78rem"><i class="fas fa-calendar"></i> ${h.dueDate} (D-${daysLeft})</span>`
                    : '';
                return `
                <div class="hw-item ${completed ? 'hw-done' : isOverdue ? 'hw-overdue' : ''}">
                    <div class="hw-item-left">
                        ${h.subject ? `<span class="badge badge-primary" style="font-size:0.72rem;margin-bottom:4px">${this.escapeHtml(h.subject)}</span>` : ''}
                        <div class="hw-title">${this.escapeHtml(h.title)}</div>
                        ${h.description ? `<div class="hw-desc">${this.escapeHtml(h.description)}</div>` : ''}
                        <div class="hw-meta">
                            ${dueBadge}
                            <span style="color:var(--gray-400);font-size:0.75rem"><i class="fas fa-user-tie"></i> ${this.escapeHtml(h.assignedBy || '')}</span>
                        </div>
                    </div>
                    <button class="btn btn-sm ${completed ? 'btn-outline' : 'btn-success'}"
                        data-action="${completed ? 'hw-incomplete' : 'hw-complete'}"
                        data-hw-id="${h.id}" data-student-id="${studentId}">
                        <i class="fas ${completed ? 'fa-undo' : 'fa-check'}"></i> ${completed ? '취소' : '완료'}
                    </button>
                </div>`;
            };

            const html = `
            <div class="card" style="margin-bottom:16px">
                <div class="card-header">
                    <h2><i class="fas fa-hourglass-half"></i> 미완료 숙제 (${pending.length})</h2>
                </div>
                <div class="card-body" style="padding:${pending.length ? '0' : ''}">
                    ${pending.length === 0
                        ? '<div class="empty-state" style="padding:30px"><i class="fas fa-check-circle" style="color:var(--success)"></i><h3>완료하지 않은 숙제가 없습니다!</h3></div>'
                        : pending.map(h => hwRow(h, false)).join('')}
                </div>
            </div>
            ${done.length > 0 ? `
            <div class="card">
                <div class="card-header">
                    <h2><i class="fas fa-check-double"></i> 완료된 숙제 (${done.length})</h2>
                </div>
                <div class="card-body" style="padding:0">
                    ${done.map(h => hwRow(h, true)).join('')}
                </div>
            </div>` : ''}`;

            document.getElementById('content-area').innerHTML = html;
            this.updateHomeworkBadge();
            return;
        }

        // 선생/원장 뷰
        const students = this.getVisibleStudents();
        const allHw = DataStore.getHomework();

        const hwCard = (h) => {
            const assignedStudents = h.studentIds && h.studentIds.length > 0
                ? h.studentIds.map(id => { const s = DataStore.getStudent(id); return s ? s.name : id; }).join(', ')
                : '전체';
            const total = h.studentIds && h.studentIds.length > 0 ? h.studentIds.length : students.length;
            const completed = (h.completedBy || []).length;
            const isOverdue = h.dueDate && h.dueDate < today;
            const daysLeft = h.dueDate ? Math.ceil((new Date(h.dueDate) - new Date(today)) / 86400000) : null;
            const dueBadge = h.dueDate
                ? isOverdue
                    ? `<span style="color:var(--danger);font-size:0.78rem"><i class="fas fa-exclamation-circle"></i> 기한만료 (${h.dueDate})</span>`
                    : daysLeft === 0
                        ? `<span style="color:var(--warning);font-size:0.78rem"><i class="fas fa-clock"></i> 오늘 마감</span>`
                        : `<span style="color:var(--gray-500);font-size:0.78rem"><i class="fas fa-calendar"></i> ${h.dueDate} (D-${daysLeft})</span>`
                : '<span style="color:var(--gray-300);font-size:0.78rem">기한 없음</span>';

            return `
            <div class="hw-item">
                <div class="hw-item-left">
                    ${h.subject ? `<span class="badge badge-primary" style="font-size:0.72rem;margin-bottom:4px">${this.escapeHtml(h.subject)}</span>` : ''}
                    <div class="hw-title">${this.escapeHtml(h.title)}</div>
                    ${h.description ? `<div class="hw-desc">${this.escapeHtml(h.description)}</div>` : ''}
                    <div class="hw-meta">
                        ${dueBadge}
                        <span style="color:var(--gray-400);font-size:0.75rem"><i class="fas fa-users"></i> ${this.escapeHtml(assignedStudents)}</span>
                        <span style="font-size:0.78rem;color:${completed >= total ? 'var(--success)' : 'var(--primary)'}">
                            <i class="fas fa-check"></i> ${completed}/${total}명 완료
                        </span>
                    </div>
                </div>
                <button class="btn-icon" data-action="delete-homework" data-hw-id="${h.id}" title="삭제" style="color:var(--danger)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;
        };

        // 학생 체크박스 렌더링
        const studentCheckboxes = students.map(s =>
            `<label style="display:flex;align-items:center;gap:6px;margin-right:12px;cursor:pointer">
                <input type="checkbox" class="hw-student-chk" value="${s.id}"> ${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})
             </label>`
        ).join('');

        const html = `
        <!-- 숙제 추가 폼 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2><i class="fas fa-plus"></i> 숙제 출제</h2></div>
            <div class="card-body">
                <div class="form-row">
                    <div class="form-group">
                        <label>제목 <span class="required">*</span></label>
                        <input type="text" id="hw-title" class="form-control" placeholder="숙제 제목">
                    </div>
                    <div class="form-group">
                        <label>과목</label>
                        <input type="text" id="hw-subject" class="form-control" placeholder="예: 수학, 영어">
                    </div>
                </div>
                <div class="form-group">
                    <label>설명</label>
                    <input type="text" id="hw-description" class="form-control" placeholder="상세 내용 (선택)">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>마감일</label>
                        <input type="date" id="hw-due-date" class="form-control" value="${today}">
                    </div>
                    <div class="form-group" style="flex:2">
                        <label>대상 학생 <span style="font-size:0.78rem;color:var(--gray-400)">(미선택 시 전체)</span></label>
                        <div style="display:flex;flex-wrap:wrap;gap:4px;padding:8px;border:1px solid var(--gray-200);border-radius:8px;min-height:38px">
                            ${studentCheckboxes || '<span style="color:var(--gray-300);font-size:0.85rem">담당 학생이 없습니다</span>'}
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary" data-action="add-homework"><i class="fas fa-paper-plane"></i> 출제하기</button>
            </div>
        </div>

        <!-- 숙제 목록 -->
        <div class="card">
            <div class="card-header"><h2><i class="fas fa-list-ul"></i> 출제된 숙제 (${allHw.length})</h2></div>
            <div class="card-body" style="padding:${allHw.length ? '0' : ''}">
                ${allHw.length === 0
                    ? '<div class="empty-state" style="padding:30px"><i class="fas fa-tasks"></i><h3>출제된 숙제가 없습니다</h3><p>위 폼에서 숙제를 출제해보세요.</p></div>'
                    : allHw.map(h => hwCard(h)).join('')}
            </div>
        </div>`;

        document.getElementById('content-area').innerHTML = html;
    },

    // 학생 상세 숙제 미니카드
    renderHomeworkMiniCard(studentId) {
        const today = this.getLocalDateStr();
        const allHw = DataStore.getHomeworkForStudent(studentId);
        const pending = allHw.filter(h => !DataStore.isHomeworkCompletedBy(h, studentId));
        const overdue = pending.filter(h => h.dueDate && h.dueDate < today);
        if (allHw.length === 0) return '';

        const rows = pending.slice(0, 5).map(h => {
            const isOverdue = h.dueDate && h.dueDate < today;
            return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--gray-100)">
                <span style="flex:1;font-size:0.85rem">${this.escapeHtml(h.title)}${h.subject ? ` <span style="color:var(--primary);font-size:0.75rem">[${this.escapeHtml(h.subject)}]</span>` : ''}</span>
                ${h.dueDate ? `<span style="font-size:0.75rem;color:${isOverdue ? 'var(--danger)' : 'var(--gray-400)'};font-weight:${isOverdue ? '600' : '400'}">${h.dueDate}</span>` : ''}
            </div>`;
        }).join('');

        return `
        <div class="card" style="margin-bottom:16px">
            <div class="card-header">
                <h2><i class="fas fa-tasks"></i> 숙제 현황</h2>
                <div style="display:flex;gap:8px;align-items:center">
                    ${overdue.length > 0 ? `<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> 기한만료 ${overdue.length}</span>` : ''}
                    <span class="badge badge-primary">미완료 ${pending.length}</span>
                    <span class="badge badge-success">완료 ${allHw.length - pending.length}</span>
                </div>
            </div>
            <div class="card-body" style="padding:${pending.length ? '8px 20px' : ''}">
                ${pending.length === 0
                    ? '<div style="text-align:center;padding:12px;color:var(--success)"><i class="fas fa-check-circle"></i> 모든 숙제를 완료했습니다!</div>'
                    : rows + (pending.length > 5 ? `<div style="text-align:center;padding:6px;font-size:0.8rem;color:var(--gray-400)">외 ${pending.length - 5}개 더...</div>` : '')}
            </div>
        </div>`;
    },

    // 숙제 배지 업데이트 (학생용)
    updateHomeworkBadge() {
        const badge = document.getElementById('homework-badge');
        if (!badge) return;
        const role = this.currentUser ? this.currentUser.role : '';
        if (role === 'student' && this.currentUser.studentId) {
            const allHw = DataStore.getHomeworkForStudent(this.currentUser.studentId);
            const pending = allHw.filter(h => !DataStore.isHomeworkCompletedBy(h, this.currentUser.studentId)).length;
            if (pending > 0) {
                badge.textContent = pending;
                badge.style.display = '';
            } else {
                badge.style.display = 'none';
            }
        } else {
            badge.style.display = 'none';
        }
    },

    // =========================================
    //  VIEW: SCHEDULE (시간표 관리)
    // =========================================
    renderSchedule() {
        const role = this.currentUser?.role;
        const canEdit = role === 'director' || role === 'teacher';
        const isStudent = role === 'student';
        const isParent = role === 'parent';

        const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
        const DAY_COLORS = { '월': '#4F46E5', '화': '#10B981', '수': '#F59E0B', '목': '#EF4444', '금': '#8B5CF6', '토': '#06B6D4', '일': '#EC4899' };

        // 역할별 시간표 필터
        let schedules;
        if (isStudent || isParent) {
            const sid = this.currentUser.studentId;
            schedules = DataStore.getStudentSchedules(sid);
        } else if (role === 'teacher') {
            // 담당 학생이 포함된 수업 + 본인이 담당인 수업
            schedules = DataStore.getSchedules().filter(s => {
                const myStudents = this.currentUser.assignedStudentIds || [];
                const sIds = s.studentIds || [];
                return s.teacherId === this.currentUser.id ||
                    (sIds.length === 0 ? false : sIds.some(id => myStudents.includes(id)));
            });
        } else {
            schedules = DataStore.getSchedules();
        }

        // 요일별 그룹핑
        const byDay = {};
        DAYS.forEach(d => byDay[d] = []);
        schedules.forEach(s => {
            if (byDay[s.dayOfWeek]) byDay[s.dayOfWeek].push(s);
        });

        // 수업 블록 HTML
        const blockHtml = (s) => {
            const stuNames = (s.studentIds || []).length > 0
                ? (s.studentIds || []).map(id => {
                    const st = DataStore.getStudent(id);
                    return st ? this.escapeHtml(st.name) : '';
                }).filter(Boolean).join(', ')
                : '전체';
            return `
            <div class="sch-block" style="border-left:4px solid ${s.color || '#4F46E5'}">
                <div class="sch-block-time">${s.startTime} ~ ${s.endTime}</div>
                <div class="sch-block-subject">${this.escapeHtml(s.subject)}</div>
                ${s.room ? `<div class="sch-block-meta"><i class="fas fa-door-open"></i> ${this.escapeHtml(s.room)}</div>` : ''}
                ${s.teacherName ? `<div class="sch-block-meta"><i class="fas fa-chalkboard-teacher"></i> ${this.escapeHtml(s.teacherName)}</div>` : ''}
                ${!isStudent && !isParent ? `<div class="sch-block-meta"><i class="fas fa-users"></i> ${this.escapeHtml(stuNames)}</div>` : ''}
                ${canEdit ? `<div class="sch-block-actions">
                    <button class="btn-icon" data-action="schedule-edit" data-id="${s.id}" title="수정"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" data-action="schedule-delete" data-id="${s.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                </div>` : ''}
            </div>`;
        };

        const gridCols = DAYS.filter(d => canEdit || byDay[d].length > 0);

        document.getElementById('content-area').innerHTML = `
        <div class="view-container">
            ${canEdit ? `
            <div style="display:flex;justify-content:flex-end;margin-bottom:1rem">
                <button class="btn btn-primary" data-action="schedule-add"><i class="fas fa-plus"></i> 수업 추가</button>
            </div>` : ''}

            <div class="sch-grid" style="grid-template-columns:repeat(${gridCols.length},1fr)">
                ${gridCols.map(day => `
                <div class="sch-col">
                    <div class="sch-day-header" style="background:${DAY_COLORS[day]}">
                        <span>${day}요일</span>
                        <span class="sch-count">${byDay[day].length}수업</span>
                    </div>
                    <div class="sch-blocks">
                        ${byDay[day].length === 0
                            ? `<div class="sch-empty">수업 없음</div>`
                            : byDay[day]
                                .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
                                .map(s => blockHtml(s)).join('')}
                    </div>
                </div>`).join('')}
            </div>
            ${gridCols.length === 0 ? `
            <div class="card"><div class="card-body" style="text-align:center;padding:3rem;color:var(--gray-400)">
                <i class="fas fa-calendar-week" style="font-size:2rem;margin-bottom:1rem"></i>
                <p>등록된 시간표가 없습니다.</p>
            </div></div>` : ''}
        </div>`;
    },

    openScheduleModal(scheduleId) {
        const isEdit = !!scheduleId;
        const s = isEdit ? DataStore._getById(DataStore.TABLES.SCHEDULES, scheduleId) : null;
        const DAYS = ['월', '화', '수', '목', '금', '토'];
        const COLORS = [
            { label: '인디고', value: '#4F46E5' }, { label: '초록', value: '#10B981' },
            { label: '주황', value: '#F59E0B' }, { label: '빨강', value: '#EF4444' },
            { label: '보라', value: '#8B5CF6' }, { label: '하늘', value: '#06B6D4' },
            { label: '분홍', value: '#EC4899' }, { label: '라임', value: '#84CC16' },
        ];

        const allStudents = this.getVisibleStudents();
        const currentStudentIds = s?.studentIds || [];

        this.openModal(isEdit ? '수업 수정' : '수업 추가', `
            <div class="form-row">
                <div class="form-group">
                    <label>요일 <span class="required">*</span></label>
                    <select class="form-control" id="sch-day">
                        ${DAYS.map(d => `<option value="${d}" ${s?.dayOfWeek === d ? 'selected' : ''}>${d}요일</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>과목 <span class="required">*</span></label>
                    <input type="text" class="form-control" id="sch-subject" value="${this.escapeHtml(s?.subject || '')}" placeholder="예: 수학">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>시작 시간 <span class="required">*</span></label>
                    <input type="time" class="form-control" id="sch-start" value="${s?.startTime || ''}">
                </div>
                <div class="form-group">
                    <label>종료 시간 <span class="required">*</span></label>
                    <input type="time" class="form-control" id="sch-end" value="${s?.endTime || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>강사</label>
                    <input type="text" class="form-control" id="sch-teacher" value="${this.escapeHtml(s?.teacherName || this.currentUser?.name || '')}" placeholder="담당 선생님">
                </div>
                <div class="form-group">
                    <label>강의실</label>
                    <input type="text" class="form-control" id="sch-room" value="${this.escapeHtml(s?.room || '')}" placeholder="예: 1강의실">
                </div>
            </div>
            <div class="form-group">
                <label>색상</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
                    ${COLORS.map(c => `
                        <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
                            <input type="radio" name="sch-color" value="${c.value}" ${(s?.color || '#4F46E5') === c.value ? 'checked' : ''}>
                            <span style="width:18px;height:18px;border-radius:50%;background:${c.value};display:inline-block;border:2px solid ${(s?.color || '#4F46E5') === c.value ? '#1F2937' : 'transparent'}"></span>
                            <span style="font-size:0.78rem">${c.label}</span>
                        </label>`).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>수강 학생 <span style="font-size:0.78rem;color:var(--gray-400)">(미선택 시 전체)</span></label>
                <div class="sch-student-list">
                    ${allStudents.map(st => `
                        <label class="sch-student-chk-label">
                            <input type="checkbox" class="sch-student-chk" value="${st.id}" ${currentStudentIds.includes(st.id) ? 'checked' : ''}>
                            ${this.escapeHtml(st.name)} <span style="color:var(--gray-400);font-size:0.75rem">${this.escapeHtml(st.grade || '')}</span>
                        </label>`).join('')}
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:1rem">
                <button class="btn btn-primary" data-action="schedule-save" data-id="${scheduleId || ''}" style="flex:1">
                    <i class="fas fa-save"></i> ${isEdit ? '수정' : '추가'}
                </button>
            </div>
        `);
    },

    // =========================================
    //  VIEW: PARENT HOME (학부모 전용 대시보드)
    // =========================================
    renderParentHome() {
        const user = this.currentUser;
        if (!user || user.role !== 'parent') return;

        const studentId = user.studentId;
        const student = DataStore.getStudent(studentId);
        if (!student) {
            document.getElementById('content-area').innerHTML =
                '<div class="card"><div class="card-body"><p style="color:var(--gray-500)">연결된 학생 정보가 없습니다. 원장에게 문의해주세요.</p></div></div>';
            return;
        }

        const today = this.getLocalDateStr();
        const todayDate = new Date(today);
        const ym = today.slice(0, 7);
        const [year, month] = ym.split('-').map(Number);

        // 1. 오늘 출결
        const todayAtt = (DataStore._cache['attendance'] || []).find(a => a.studentId === studentId && a.date === today);
        const attStats = DataStore.getAttendanceStats(studentId, ym);

        // 2. 미완료 숙제
        const allHw = DataStore.getHomeworkForStudent(studentId);
        const pendingHw = allHw.filter(h => !DataStore.isHomeworkCompletedBy(h, studentId))
            .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
        const overdueHw = pendingHw.filter(h => h.dueDate && h.dueDate < today);

        // 3. D-day 시험 (30일 이내)
        const in30 = new Date(todayDate.getTime() + 30 * 86400000).toISOString().slice(0, 10);
        const upcomingExams = DataStore.getExamPlansForStudent(studentId)
            .filter(p => p.examDate && p.examDate >= today && p.examDate <= in30)
            .sort((a, b) => a.examDate.localeCompare(b.examDate));

        // 4. 학부모에게 공개된 최근 코멘트
        const recentComments = Permissions.filterVisibleComments(
            DataStore.getStudentComments(studentId)
        ).slice(0, 4);

        // 5. 이번달 진도율
        const activePlans = DataStore.getStudentPlans(studentId).filter(p => p.status === 'active');
        const progressPct = activePlans.length > 0
            ? Math.round(activePlans.reduce((s, p) => s + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / activePlans.length)
            : 0;

        // 6. 최근 성적
        const grades = DataStore.getStudentGrades(studentId).sort((a, b) =>
            (b.examDate || b.createdAt || '').localeCompare(a.examDate || a.createdAt || ''));
        const latestGrade = grades.length > 0 && grades[0].totalAvg > 0 ? grades[0] : null;

        // === 오늘 출결 상태 렌더링 ===
        const attStatusHtml = (() => {
            if (!todayAtt) return `<div class="parent-today-att parent-att-none"><i class="fas fa-question-circle"></i><span>오늘 출결 기록 없음</span></div>`;
            const colorMap = { '출석': 'var(--success)', '결석': 'var(--danger)', '지각': 'var(--warning)', '조퇴': 'var(--info)' };
            const iconMap = { '출석': 'fa-check-circle', '결석': 'fa-times-circle', '지각': 'fa-clock', '조퇴': 'fa-sign-out-alt' };
            const color = colorMap[todayAtt.status] || 'var(--gray-400)';
            const icon = iconMap[todayAtt.status] || 'fa-circle';
            return `<div class="parent-today-att" style="border-color:${color};background:${color}18">
                <i class="fas ${icon}" style="color:${color};font-size:2rem"></i>
                <div>
                    <div style="font-size:1.3rem;font-weight:800;color:${color}">${todayAtt.status}</div>
                    ${todayAtt.note ? `<div style="font-size:0.82rem;color:var(--gray-500)">${this.escapeHtml(todayAtt.note)}</div>` : ''}
                </div>
            </div>`;
        })();

        // === D-day 배지 ===
        const ddayBadge = date => {
            const diff = Math.ceil((new Date(date) - todayDate) / 86400000);
            if (diff === 0) return `<span class="exam-dday today">D-Day</span>`;
            if (diff <= 3) return `<span class="exam-dday soon">D-${diff}</span>`;
            return `<span class="exam-dday normal">D-${diff}</span>`;
        };

        document.getElementById('content-area').innerHTML = `
        <div class="view-container">
            <!-- 학생 이름 헤더 -->
            <div class="parent-student-banner">
                <div class="parent-avatar">${this.escapeHtml(student.name.charAt(0))}</div>
                <div>
                    <div class="parent-student-name">${this.escapeHtml(student.name)}</div>
                    <div class="parent-student-meta">${this.escapeHtml((student.school||''))} · ${this.escapeHtml((student.grade||''))} ${this.escapeHtml((student.className||''))}</div>
                </div>
                <button class="btn btn-sm btn-outline" data-action="parent-view-detail" style="margin-left:auto">
                    <i class="fas fa-user"></i> 상세 보기
                </button>
            </div>

            <!-- 요약 지표 4개 -->
            <div class="report-summary-grid" style="margin-bottom:1.5rem">
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--primary-bg);color:var(--primary)"><i class="fas fa-chart-line"></i></div>
                    <div><div class="report-stat-label">이번달 진도율</div><div class="report-stat-value">${progressPct}%</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--success-bg);color:var(--success)"><i class="fas fa-calendar-check"></i></div>
                    <div><div class="report-stat-label">${month}월 출석률</div><div class="report-stat-value">${attStats.total > 0 ? attStats.rate + '%' : '-'}</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--warning-bg);color:var(--warning)"><i class="fas fa-tasks"></i></div>
                    <div><div class="report-stat-label">미완료 숙제</div><div class="report-stat-value" style="color:${pendingHw.length > 0 ? 'var(--danger)' : 'var(--success)'}">${pendingHw.length}개</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--info-bg);color:var(--info)"><i class="fas fa-clipboard-check"></i></div>
                    <div><div class="report-stat-label">예정 시험</div><div class="report-stat-value">${upcomingExams.length}개</div></div>
                </div>
            </div>

            <div class="parent-grid">
                <!-- 오늘 출결 -->
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-calendar-day" style="color:var(--primary)"></i> 오늘 출결</h2>
                        <span style="font-size:0.82rem;color:var(--gray-400)">${today}</span>
                    </div>
                    <div class="card-body">
                        ${attStatusHtml}
                        ${attStats.total > 0 ? `
                        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-100);display:flex;gap:16px;flex-wrap:wrap">
                            ${['출석','결석','지각','조퇴'].map(st => `
                                <div style="text-align:center">
                                    <div style="font-size:1.1rem;font-weight:700">${attStats[st]}</div>
                                    <div style="font-size:0.75rem;color:var(--gray-400)">${st}</div>
                                </div>`).join('')}
                            <div style="margin-left:auto;text-align:center">
                                <div style="font-size:1.1rem;font-weight:700;color:${attStats.rate>=90?'var(--success)':attStats.rate>=70?'var(--warning)':'var(--danger)'}">${attStats.rate}%</div>
                                <div style="font-size:0.75rem;color:var(--gray-400)">${month}월 출석률</div>
                            </div>
                        </div>` : ''}
                    </div>
                </div>

                <!-- 미완료 숙제 -->
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-tasks" style="color:var(--warning)"></i> 미완료 숙제</h2>
                        ${overdueHw.length > 0 ? `<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> 기한만료 ${overdueHw.length}</span>` : `<span class="badge badge-success">양호</span>`}
                    </div>
                    <div class="card-body" style="padding:${pendingHw.length ? '8px 20px' : ''}">
                        ${pendingHw.length === 0
                            ? '<div style="text-align:center;padding:16px;color:var(--success)"><i class="fas fa-check-circle" style="font-size:1.5rem"></i><br><span style="font-size:0.9rem;margin-top:6px;display:block">모든 숙제 완료!</span></div>'
                            : pendingHw.slice(0, 5).map(h => {
                                const isOverdue = h.dueDate && h.dueDate < today;
                                return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--gray-100)">
                                    <i class="fas fa-circle" style="font-size:0.4rem;color:${isOverdue ? 'var(--danger)' : 'var(--warning)'}"></i>
                                    <span style="flex:1;font-size:0.88rem;font-weight:500">${this.escapeHtml(h.title)}</span>
                                    ${h.subject ? `<span style="font-size:0.75rem;color:var(--primary);background:var(--primary-bg);padding:2px 6px;border-radius:4px">${this.escapeHtml(h.subject)}</span>` : ''}
                                    ${h.dueDate ? `<span style="font-size:0.75rem;color:${isOverdue ? 'var(--danger)' : 'var(--gray-400)'};font-weight:${isOverdue ? '600' : '400'}">${h.dueDate}</span>` : ''}
                                </div>`;
                              }).join('') + (pendingHw.length > 5 ? `<div style="text-align:center;padding:6px;font-size:0.8rem;color:var(--gray-400)">외 ${pendingHw.length-5}개 더</div>` : '')}
                    </div>
                </div>

                <!-- 예정 시험 -->
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-clipboard-check" style="color:var(--info)"></i> 예정 시험 <span style="font-size:0.8rem;color:var(--gray-400);font-weight:400">30일 이내</span></h2>
                    </div>
                    <div class="card-body" style="padding:${upcomingExams.length ? '8px 20px' : ''}">
                        ${upcomingExams.length === 0
                            ? '<div style="text-align:center;padding:16px;color:var(--gray-300)"><i class="fas fa-calendar" style="font-size:1.5rem"></i><br><span style="font-size:0.9rem;margin-top:6px;display:block">예정된 시험 없음</span></div>'
                            : upcomingExams.map(p => {
                                const checklist = p.checklist || [];
                                const total = checklist.length;
                                const done = checklist.filter(c => (c.completedBy || []).includes(studentId)).length;
                                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gray-100)">
                                    <div style="flex:1">
                                        <div style="font-size:0.9rem;font-weight:600">${this.escapeHtml(p.examName)}</div>
                                        <div style="font-size:0.78rem;color:var(--gray-400)">시험일 ${p.examDate}${total > 0 ? ` · 준비 ${done}/${total}` : ''}</div>
                                    </div>
                                    ${ddayBadge(p.examDate)}
                                </div>`;
                              }).join('')}
                    </div>
                </div>

                <!-- 선생님 코멘트 -->
                <div class="card">
                    <div class="card-header">
                        <h2><i class="fas fa-comment-dots" style="color:var(--purple)"></i> 선생님 코멘트</h2>
                        <span class="badge" style="background:var(--purple-bg);color:var(--purple)">${recentComments.length}건</span>
                    </div>
                    <div class="card-body" style="padding:${recentComments.length ? '8px 20px' : ''}">
                        ${recentComments.length === 0
                            ? '<div style="text-align:center;padding:16px;color:var(--gray-300)"><i class="fas fa-comments" style="font-size:1.5rem"></i><br><span style="font-size:0.9rem;margin-top:6px;display:block">공개된 코멘트 없음</span></div>'
                            : recentComments.map(c => `
                                <div style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
                                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                                        <span style="font-size:0.82rem;font-weight:600;color:var(--gray-700)">${this.escapeHtml(c.author)}</span>
                                        ${this.getRoleBadge(c.authorRole)}
                                        <span style="font-size:0.75rem;color:var(--gray-400);margin-left:auto">${this.formatDate(c.createdAt)}</span>
                                    </div>
                                    <div style="font-size:0.88rem;color:var(--gray-700);line-height:1.5">${this.escapeHtml(c.content).substring(0,120)}${c.content.length > 120 ? '...' : ''}</div>
                                </div>`).join('')}
                    </div>
                </div>
            </div>

            <!-- 이번달 진도 상세 -->
            ${activePlans.length > 0 ? `
            <div class="card" style="margin-top:1.5rem">
                <div class="card-header">
                    <h2><i class="fas fa-book-open" style="color:var(--primary)"></i> 진행 중인 학습 계획</h2>
                    <span class="badge badge-primary">${activePlans.length}개</span>
                </div>
                <div class="card-body">
                    ${activePlans.map(p => {
                        const pct = p.totalUnits > 0 ? Math.round((p.completedUnits / p.totalUnits) * 100) : 0;
                        const color = pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--primary)' : 'var(--warning)';
                        return `<div style="margin-bottom:14px">
                            <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                                <span style="font-size:0.88rem;font-weight:600">${this.escapeHtml(p.subject)} · ${this.escapeHtml(p.textbook)}</span>
                                <span style="font-size:0.88rem;font-weight:700;color:${color}">${pct}%</span>
                            </div>
                            <div style="background:var(--gray-100);border-radius:6px;height:8px">
                                <div style="width:${pct}%;background:${color};border-radius:6px;height:100%;transition:width 0.4s"></div>
                            </div>
                            <div style="font-size:0.75rem;color:var(--gray-400);margin-top:3px">${p.completedUnits} / ${p.totalUnits} ${this.escapeHtml(p.unitLabel||'')}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- 최근 성적 -->
            ${latestGrade ? `
            <div class="card" style="margin-top:1.5rem">
                <div class="card-header">
                    <h2><i class="fas fa-trophy" style="color:var(--warning)"></i> 최근 시험 성적</h2>
                    <span style="font-size:0.82rem;color:var(--gray-400)">${this.escapeHtml(latestGrade.examName||latestGrade.examType||'')} · ${latestGrade.examDate||''}</span>
                </div>
                <div class="card-body">
                    <div style="display:flex;gap:12px;flex-wrap:wrap">
                        ${(latestGrade.subjects||[]).slice(0,6).map(s => `
                            <div style="text-align:center;background:var(--gray-50);border-radius:8px;padding:10px 14px;min-width:64px">
                                <div style="font-size:1.1rem;font-weight:700;color:${s.score>=90?'var(--success)':s.score>=70?'var(--primary)':s.score>=50?'var(--warning)':'var(--danger)'}">${s.score}</div>
                                <div style="font-size:0.72rem;color:var(--gray-500);margin-top:2px">${this.escapeHtml(s.subject||'')}</div>
                            </div>`).join('')}
                        ${latestGrade.totalAvg > 0 ? `
                            <div style="text-align:center;background:var(--primary-bg);border-radius:8px;padding:10px 14px;min-width:64px;margin-left:auto">
                                <div style="font-size:1.1rem;font-weight:700;color:var(--primary)">${Math.round(latestGrade.totalAvg*10)/10}</div>
                                <div style="font-size:0.72rem;color:var(--primary);margin-top:2px">평균</div>
                            </div>` : ''}
                    </div>
                </div>
            </div>` : ''}
        </div>`;
    },

    // =========================================
    //  VIEW: ANALYTICS (학생 비교 분석)
    // =========================================
    renderAnalytics() {
        const students = this.getVisibleStudents().filter(s => s.status !== '퇴원');
        if (students.length === 0) {
            document.getElementById('content-area').innerHTML =
                '<div class="card"><div class="card-body" style="padding:2rem;text-align:center;color:var(--gray-400)">분석할 학생이 없습니다.</div></div>';
            return;
        }

        const selectedGrade = this._analyticsGrade || 'all';
        const grades = [...new Set(students.map(s => s.grade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        const filtered = selectedGrade === 'all' ? students : students.filter(s => s.grade === selectedGrade);

        // 학생별 지표 계산
        const metrics = filtered.map(s => {
            // 진도율: 활성 계획 평균
            const plans = DataStore.getStudentPlans(s.id).filter(p => p.status === 'active');
            const progressPct = plans.length > 0
                ? Math.round(plans.reduce((sum, p) => sum + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / plans.length)
                : 0;

            // 출석률
            const att = (DataStore._cache['attendance'] || []).filter(a => a.studentId === s.id);
            const attendRate = att.length > 0
                ? Math.round((att.filter(a => a.status === '출석').length / att.length) * 100)
                : null;

            // 성적: 최근 시험 평균점수
            const gs = DataStore.getStudentGrades(s.id).sort((a, b) =>
                (b.examDate || b.createdAt || '').localeCompare(a.examDate || a.createdAt || ''));
            const latestGrade = gs.length > 0 && gs[0].totalAvg > 0 ? Math.round(gs[0].totalAvg * 10) / 10 : null;

            // 숙제 완료율
            const hw = (DataStore._cache['homework'] || []).filter(h => {
                const ids = h.studentIds || [];
                return ids.length === 0 || ids.includes(s.id);
            });
            const hwRate = hw.length > 0
                ? Math.round((hw.filter(h => (h.completedBy || []).includes(s.id)).length / hw.length) * 100)
                : null;

            return { student: s, progressPct, attendRate, latestGrade, hwRate };
        }).sort((a, b) => a.student.name.localeCompare(b.student.name, 'ko'));

        const labels = metrics.map(m => m.student.name);
        const chartH = Math.max(180, labels.length * 34) + 'px';

        // 색상: 값에 따라 초록/파랑/노랑/빨강
        const colorByPct = v => v >= 80 ? '#10B981' : v >= 60 ? '#4F46E5' : v >= 40 ? '#F59E0B' : '#EF4444';

        document.getElementById('content-area').innerHTML = `
        <div class="view-container">
            <!-- 필터 -->
            <div class="card" style="margin-bottom:1.5rem">
                <div class="card-body" style="padding:14px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                    <span style="font-weight:600;color:var(--gray-700);font-size:0.9rem">학년 필터</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="btn btn-sm ${selectedGrade==='all'?'btn-primary':'btn-outline'}" data-action="analytics-filter" data-grade="all">전체</button>
                        ${grades.map(g => `<button class="btn btn-sm ${selectedGrade===g?'btn-primary':'btn-outline'}" data-action="analytics-filter" data-grade="${this.escapeHtml(g)}">${this.escapeHtml(g)}</button>`).join('')}
                    </div>
                    <span style="margin-left:auto;color:var(--gray-400);font-size:0.83rem">${filtered.length}명</span>
                </div>
            </div>

            <!-- 차트 2x2 그리드 -->
            <div class="analytics-grid">
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-chart-line" style="color:var(--primary)"></i> 진도율</h2><span class="badge badge-primary">활성 계획 평균</span></div>
                    <div class="card-body"><div style="height:${chartH}"><canvas id="chart-analytics-progress"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-calendar-check" style="color:var(--success)"></i> 출석률</h2><span class="badge badge-success">전체 기간</span></div>
                    <div class="card-body"><div style="height:${chartH}"><canvas id="chart-analytics-attend"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-trophy" style="color:var(--warning)"></i> 최근 성적</h2><span class="badge badge-warning">최근 시험 평균점</span></div>
                    <div class="card-body"><div style="height:${chartH}"><canvas id="chart-analytics-grade"></canvas></div></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2><i class="fas fa-tasks" style="color:var(--info)"></i> 숙제 완료율</h2><span class="badge" style="background:var(--info-bg);color:var(--info)">전체 숙제</span></div>
                    <div class="card-body"><div style="height:${chartH}"><canvas id="chart-analytics-hw"></canvas></div></div>
                </div>
            </div>

            <!-- 종합 비교표 -->
            <div class="card" style="margin-top:1.5rem">
                <div class="card-header"><h2><i class="fas fa-table"></i> 종합 비교표</h2></div>
                <div class="card-body" style="padding:0;overflow-x:auto">
                    <table class="tuition-table">
                        <thead><tr>
                            <th>학생</th>
                            <th style="min-width:160px">진도율</th>
                            <th style="min-width:160px">출석률</th>
                            <th style="min-width:100px;text-align:center">최근 성적</th>
                            <th style="min-width:160px">숙제 완료율</th>
                        </tr></thead>
                        <tbody>${metrics.map(m => `
                            <tr>
                                <td><span class="student-name" data-action="view-student" data-id="${m.student.id}" style="cursor:pointer">
                                    <strong>${this.escapeHtml(m.student.name)}</strong></span>
                                    <br><small class="text-muted">${this.escapeHtml((m.student.grade||'')+' '+(m.student.className||''))}</small>
                                </td>
                                <td>${this.analyticsBar(m.progressPct, '#4F46E5')}</td>
                                <td>${m.attendRate !== null ? this.analyticsBar(m.attendRate, '#10B981') : '<span style="color:var(--gray-300);font-size:0.82rem">기록 없음</span>'}</td>
                                <td style="text-align:center">${m.latestGrade !== null
                                    ? `<span style="font-weight:700;font-size:1rem;color:${m.latestGrade>=80?'var(--success)':m.latestGrade>=60?'var(--primary)':m.latestGrade>=40?'var(--warning)':'var(--danger)'}">${m.latestGrade}</span><span style="font-size:0.75rem;color:var(--gray-400)">점</span>`
                                    : '<span style="color:var(--gray-300);font-size:0.82rem">없음</span>'}
                                </td>
                                <td>${m.hwRate !== null ? this.analyticsBar(m.hwRate, '#06B6D4') : '<span style="color:var(--gray-300);font-size:0.82rem">숙제 없음</span>'}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        // 차트 렌더링
        Charts.createStudentCompareBar('chart-analytics-progress', labels,
            [{ label: '진도율', data: metrics.map(m => m.progressPct), backgroundColor: metrics.map(m => colorByPct(m.progressPct)), borderRadius: 5, barThickness: 18 }], '%');

        Charts.createStudentCompareBar('chart-analytics-attend', labels,
            [{ label: '출석률', data: metrics.map(m => m.attendRate ?? 0), backgroundColor: metrics.map(m => m.attendRate !== null ? colorByPct(m.attendRate) : '#E5E7EB'), borderRadius: 5, barThickness: 18 }], '%');

        Charts.createStudentCompareBar('chart-analytics-grade', labels,
            [{ label: '성적', data: metrics.map(m => m.latestGrade ?? 0), backgroundColor: metrics.map(m => m.latestGrade !== null ? colorByPct(m.latestGrade) : '#E5E7EB'), borderRadius: 5, barThickness: 18 }], '점');

        Charts.createStudentCompareBar('chart-analytics-hw', labels,
            [{ label: '완료율', data: metrics.map(m => m.hwRate ?? 0), backgroundColor: metrics.map(m => m.hwRate !== null ? colorByPct(m.hwRate) : '#E5E7EB'), borderRadius: 5, barThickness: 18 }], '%');
    },

    analyticsBar(value, color) {
        const pct = Math.min(100, Math.max(0, value));
        return `<div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:var(--gray-100);border-radius:4px;height:8px">
                <div style="width:${pct}%;background:${color};border-radius:4px;height:100%;transition:width 0.4s"></div>
            </div>
            <span style="font-size:0.85rem;font-weight:600;color:var(--gray-700);min-width:36px;text-align:right">${value}%</span>
        </div>`;
    },

    // =========================================
    //  VIEW: TUITION (수업료 관리)
    // =========================================
    renderTuition() {
        const role = this.currentUser?.role;
        if (role !== 'director') {
            document.getElementById('content-area').innerHTML =
                '<div class="card"><div class="card-body"><p style="color:var(--gray-500)">원장만 접근할 수 있습니다.</p></div></div>';
            return;
        }

        const today = new Date();
        if (!this._tuitionYM) {
            this._tuitionYM = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
        }
        const ym = this._tuitionYM;
        const [year, month] = ym.split('-').map(Number);
        const ymLabel = `${year}년 ${month}월`;

        const students = DataStore.getStudents().filter(s => s.status !== '퇴원');
        const recMap = {};
        DataStore.getTuitionByMonth(ym).forEach(r => recMap[r.studentId] = r);

        let totalBilled = 0, totalPaid = 0, totalUnpaid = 0, paidCount = 0;
        students.forEach(s => {
            const rec = recMap[s.id];
            const amount = rec?.amount || 0;
            const paidAmount = rec?.paidAmount || 0;
            totalBilled += amount;
            totalPaid += paidAmount;
            totalUnpaid += Math.max(0, amount - paidAmount);
            if (rec?.status === '납부완료') paidCount++;
        });
        const billed = students.filter(s => recMap[s.id]?.amount > 0).length;
        const payRate = billed > 0 ? Math.round((paidCount / billed) * 100) : 0;
        const fmt = n => Number(n).toLocaleString('ko-KR');

        const rows = students.map(s => {
            const rec = recMap[s.id];
            const amount = rec?.amount || 0;
            const paidAmount = rec?.paidAmount || 0;
            const status = rec?.status || (amount > 0 ? '미납' : null);
            const paidDate = rec?.paidDate || '';
            const note = this.escapeHtml(rec?.note || '');

            let badge = '';
            if (status === '납부완료') badge = `<span class="badge badge-success">납부완료</span>`;
            else if (status === '부분납부') badge = `<span class="badge badge-warning">부분납부</span>`;
            else if (amount > 0) badge = `<span class="badge badge-danger">미납</span>`;
            else badge = `<span class="badge" style="background:var(--gray-100);color:var(--gray-400)">미청구</span>`;

            return `<tr>
                <td><strong>${this.escapeHtml(s.name)}</strong><br><small class="text-muted">${this.escapeHtml((s.grade||'') + ' ' + (s.className||''))}</small></td>
                <td class="tuition-num">${amount > 0 ? fmt(amount)+'원' : '-'}</td>
                <td class="tuition-num">${paidAmount > 0 ? fmt(paidAmount)+'원' : '-'}</td>
                <td>${badge}</td>
                <td style="color:var(--gray-600);font-size:0.85rem">${paidDate || '-'}</td>
                <td class="tuition-note">${note}</td>
                <td><button class="btn btn-sm btn-outline" data-action="tuition-edit" data-student-id="${s.id}" data-ym="${ym}"><i class="fas fa-edit"></i></button></td>
            </tr>`;
        }).join('');

        document.getElementById('content-area').innerHTML = `
        <div class="view-container">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;flex-wrap:wrap;gap:12px">
                <div style="display:flex;align-items:center;gap:10px">
                    <button class="btn btn-outline btn-sm" data-action="tuition-prev-month"><i class="fas fa-chevron-left"></i></button>
                    <h2 style="font-size:1.25rem;font-weight:700;color:var(--gray-800)">${ymLabel} 수업료</h2>
                    <button class="btn btn-outline btn-sm" data-action="tuition-next-month"><i class="fas fa-chevron-right"></i></button>
                </div>
                <button class="btn btn-primary btn-sm" data-action="tuition-bulk-set" data-ym="${ym}"><i class="fas fa-layer-group"></i> 일괄 금액 설정</button>
            </div>

            <div class="report-summary-grid" style="margin-bottom:1.5rem">
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--primary-bg);color:var(--primary)"><i class="fas fa-file-invoice-dollar"></i></div>
                    <div><div class="report-stat-label">총 청구액</div><div class="report-stat-value">${fmt(totalBilled)}원</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--success-bg);color:var(--success)"><i class="fas fa-check-circle"></i></div>
                    <div><div class="report-stat-label">납부 완료</div><div class="report-stat-value">${fmt(totalPaid)}원</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--danger-bg);color:var(--danger)"><i class="fas fa-exclamation-circle"></i></div>
                    <div><div class="report-stat-label">미납 금액</div><div class="report-stat-value">${fmt(totalUnpaid)}원</div></div>
                </div>
                <div class="report-stat-card">
                    <div class="report-stat-icon" style="background:var(--info-bg);color:var(--info)"><i class="fas fa-percent"></i></div>
                    <div><div class="report-stat-label">납부율</div><div class="report-stat-value">${payRate}%</div></div>
                </div>
            </div>

            <div class="card">
                <div class="card-body" style="padding:0;overflow-x:auto">
                    <table class="tuition-table">
                        <thead><tr>
                            <th>학생</th><th>청구액</th><th>납부액</th><th>상태</th><th>납부일</th><th>메모</th><th></th>
                        </tr></thead>
                        <tbody>${students.length === 0
                            ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--gray-400)">등록된 학생이 없습니다</td></tr>'
                            : rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    },

    openTuitionEditModal(studentId, ym) {
        const student = DataStore.getStudent(studentId);
        if (!student) return;
        const rec = DataStore.getStudentTuitionRecord(studentId, ym);
        const amount = rec?.amount || 0;
        const paidAmount = rec?.paidAmount || 0;
        const paidDate = rec?.paidDate || '';
        const note = rec?.note || '';
        const [y, m] = ym.split('-').map(Number);

        this.openModal(`${this.escapeHtml(student.name)} — ${y}년 ${m}월 수업료`, `
            <div class="form-group">
                <label>청구 금액 (원)</label>
                <input type="number" class="form-control" id="tuition-amount" value="${amount}" min="0" step="10000" placeholder="0">
            </div>
            <div class="form-group">
                <label>납부 금액 (원)</label>
                <input type="number" class="form-control" id="tuition-paid" value="${paidAmount}" min="0" step="10000" placeholder="0">
            </div>
            <div class="form-group">
                <label>납부일</label>
                <input type="date" class="form-control" id="tuition-paid-date" value="${paidDate}">
            </div>
            <div class="form-group">
                <label>메모</label>
                <input type="text" class="form-control" id="tuition-note" value="${this.escapeHtml(note)}" placeholder="메모 (선택)">
            </div>
            <div style="display:flex;gap:8px;margin-top:1rem">
                <button class="btn btn-primary" data-action="tuition-save" data-student-id="${studentId}" data-ym="${ym}" style="flex:1">
                    <i class="fas fa-save"></i> 저장
                </button>
                ${rec ? `<button class="btn btn-outline" data-action="tuition-delete" data-id="${rec.id}" style="color:var(--danger);border-color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `);
    },

    openTuitionBulkModal(ym) {
        const [y, m] = ym.split('-').map(Number);
        this.openModal(`${y}년 ${m}월 — 일괄 수업료 설정`, `
            <p style="color:var(--gray-500);margin-bottom:1rem;font-size:0.9rem">
                모든 재원 학생에게 동일한 수업료를 청구합니다.<br>이미 설정된 학생의 청구액은 덮어쓰고, 납부 정보는 유지됩니다.
            </p>
            <div class="form-group">
                <label>수업료 (원)</label>
                <input type="number" class="form-control" id="tuition-bulk-amount" min="0" step="10000" placeholder="예: 350000" autofocus>
            </div>
            <button class="btn btn-primary" data-action="tuition-bulk-save" data-ym="${ym}" style="width:100%;margin-top:0.5rem">
                <i class="fas fa-check"></i> 전체 적용
            </button>
        `);
    },

    // =========================================
    //  VIEW: REPORT (월간 학습 리포트)
    // =========================================
    renderReport(studentId, ym) {
        const role = this.currentUser ? this.currentUser.role : '';
        const isStudent = role === 'student';
        const today = this.getLocalDateStr();
        const currentYM = this._reportYM || today.slice(0, 7);
        this._reportYM = ym || currentYM;
        const reportYM = this._reportYM;
        const [year, month] = reportYM.split('-').map(Number);

        // 학생 선택 처리
        const students = this.getVisibleStudents();
        if (!studentId) {
            if (isStudent) {
                studentId = this.currentUser.studentId;
            } else if (this._reportStudentId) {
                studentId = this._reportStudentId;
            } else if (students.length > 0) {
                studentId = students[0].id;
            }
        }
        this._reportStudentId = studentId;

        const student = studentId ? DataStore.getStudent(studentId) : null;

        // 학생 선택 드롭다운 (선생/원장만)
        const studentSelector = (!isStudent && students.length > 0) ? `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <label style="font-weight:600;white-space:nowrap">학생 선택</label>
            <select id="report-student-select" class="form-control" style="max-width:200px">
                ${students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})</option>`).join('')}
            </select>
        </div>` : '';

        // 월 이동 컨트롤
        const monthNav = `
        <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-outline btn-sm" data-action="report-prev-month"><i class="fas fa-chevron-left"></i></button>
            <strong style="font-size:1rem;min-width:90px;text-align:center">${year}년 ${month}월</strong>
            <button class="btn btn-outline btn-sm" data-action="report-next-month"><i class="fas fa-chevron-right"></i></button>
        </div>
        <button class="btn btn-outline btn-sm" data-action="report-print" style="margin-left:auto"><i class="fas fa-print"></i> 인쇄 / PDF</button>`;

        // 컨트롤 바
        const controlBar = `
        <div class="card" style="margin-bottom:16px">
            <div class="card-body" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                ${studentSelector}
                ${monthNav}
            </div>
        </div>`;

        if (!student) {
            document.getElementById('content-area').innerHTML = controlBar +
                '<div class="empty-state" style="padding:60px"><i class="fas fa-user-slash"></i><h3>학생을 선택해주세요</h3></div>';
            this._bindReportEvents();
            return;
        }

        // ── 데이터 집계 ──────────────────────────────

        // 1. 학습 계획 & 진도 (해당 월에 active인 계획)
        const plans = DataStore.getStudentPlans(student.id).filter(p =>
            (!p.endDate || p.endDate >= `${reportYM}-01`) &&
            (!p.startDate || p.startDate <= `${reportYM}-31`)
        );
        const monthProgress = DataStore.getStudentProgress(student.id)
            .filter(pr => (pr.date || '').startsWith(reportYM));
        const progressByPlan = {};
        monthProgress.forEach(pr => {
            progressByPlan[pr.planId] = (progressByPlan[pr.planId] || 0) + (pr.amount || 0);
        });

        // 2. 출석
        const attStats = DataStore.getAttendanceStats(student.id, reportYM);

        // 3. 숙제
        const hwAll = DataStore.getHomeworkForStudent(student.id).filter(h =>
            !h.dueDate || h.dueDate.startsWith(reportYM) ||
            (h.createdAt && h.createdAt.startsWith(reportYM))
        );
        const hwDone = hwAll.filter(h => DataStore.isHomeworkCompletedBy(h, student.id)).length;

        // 4. 성적 (해당 월)
        const monthGrades = DataStore.getStudentGrades(student.id).filter(g =>
            g.examDate && g.examDate.startsWith(reportYM)
        );

        // 5. 코멘트 (해당 월, 본인 열람 가능한 것)
        const monthComments = DataStore.getStudentComments(student.id)
            .filter(c => (c.createdAt || '').startsWith(reportYM) && Permissions.canViewComment(c));

        // 6. 자기 진도 일지 (해당 월)
        const selfJournals = DataStore.getSelfJournals(student.id)
            .filter(j => (j.date || '').startsWith(reportYM));

        // ── 렌더링 ────────────────────────────────────

        // 학습 계획 섹션
        const planSection = plans.length === 0
            ? '<div style="color:var(--gray-300);padding:12px 0">이번 달 진행 중인 학습 계획이 없습니다.</div>'
            : plans.map(p => {
                const total = p.totalUnits || 0;
                const completed = p.completedUnits || 0;
                const rate = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
                const monthAmt = progressByPlan[p.id] || 0;
                const barColor = rate >= 80 ? 'var(--success)' : rate >= 50 ? 'var(--warning)' : 'var(--primary)';
                return `
                <div class="report-plan-row">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px">
                        <span style="font-weight:600">${this.escapeHtml(p.subject)} <span style="font-weight:400;color:var(--gray-500)">— ${this.escapeHtml(p.textbook || '')}</span></span>
                        <span style="font-size:0.82rem;color:var(--gray-500)">이번 달 +${monthAmt}${this.escapeHtml(p.unitLabel || '')} &nbsp; 누적 ${completed}/${total}</span>
                    </div>
                    <div style="background:var(--gray-100);border-radius:6px;height:10px;overflow:hidden">
                        <div style="width:${rate}%;background:${barColor};height:100%;border-radius:6px;transition:width 0.5s"></div>
                    </div>
                    <div style="text-align:right;font-size:0.78rem;margin-top:2px;color:${barColor};font-weight:600">${rate}%</div>
                </div>`;
            }).join('');

        // 성적 섹션
        const gradeSection = monthGrades.length === 0
            ? '<div style="color:var(--gray-300);padding:12px 0">이번 달 시험 기록이 없습니다.</div>'
            : monthGrades.map(g => {
                const subRows = (g.subjects || []).map(s =>
                    `<span class="report-subject-chip">
                        ${this.escapeHtml(s.subject)}&nbsp;
                        <strong class="grade-score ${s.score >= 90 ? 'high' : s.score >= 70 ? 'mid' : 'low'}">${s.score}</strong>
                        ${s.grade ? `<span class="grade-badge grade-${s.grade}" style="font-size:0.68rem">${s.grade}등급</span>` : ''}
                     </span>`
                ).join('');
                return `<div style="margin-bottom:10px">
                    <div style="font-weight:600;margin-bottom:4px">${this.escapeHtml(g.examName || g.examType || '')} <span style="font-size:0.78rem;color:var(--gray-400)">${g.examDate}</span></div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px">${subRows}</div>
                    ${g.totalAvg ? `<div style="margin-top:4px;font-size:0.82rem;color:var(--gray-500)">평균 <strong>${g.totalAvg}</strong>${g.totalRank ? ` / 석차 ${this.escapeHtml(g.totalRank)}` : ''}</div>` : ''}
                </div>`;
            }).join('');

        // 코멘트 섹션
        const commentSection = monthComments.length === 0
            ? '<div style="color:var(--gray-300);padding:12px 0">이번 달 코멘트가 없습니다.</div>'
            : monthComments.map(c => `
            <div style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
                    <span style="font-weight:600;font-size:0.88rem">${this.escapeHtml(c.author)}</span>
                    ${this.getRoleBadge(c.authorRole)}
                    <span style="font-size:0.75rem;color:var(--gray-400)">${this.formatDateTime(c.createdAt)}</span>
                </div>
                <div style="font-size:0.88rem;color:var(--gray-700);white-space:pre-line">${this.escapeHtml(c.content)}</div>
            </div>`).join('');

        // 자기 진도 일지 요약
        const journalSection = selfJournals.length === 0
            ? '<div style="color:var(--gray-300);padding:12px 0">이번 달 자기 진도 기록이 없습니다.</div>'
            : `<div style="font-size:0.85rem;color:var(--gray-600)">총 <strong>${selfJournals.length}회</strong> 기록</div>
               <div style="margin-top:8px;max-height:140px;overflow-y:auto">
               ${selfJournals.map(j => `
               <div style="padding:4px 0;border-bottom:1px solid var(--gray-100);font-size:0.83rem">
                   <span style="color:var(--gray-400);margin-right:8px">${j.date}</span>
                   <span>${this.escapeHtml(j.note || '')}</span>
               </div>`).join('')}
               </div>`;

        // 요약 통계 카드
        const totalMonthProgress = Object.values(progressByPlan).reduce((a, b) => a + b, 0);
        const avgPlanRate = plans.length > 0
            ? Math.round(plans.reduce((sum, p) => sum + (p.totalUnits > 0 ? Math.min(100, Math.round((p.completedUnits / p.totalUnits) * 100)) : 0), 0) / plans.length)
            : null;

        const summaryCards = `
        <div class="report-summary-grid">
            <div class="report-stat-card">
                <div class="report-stat-icon" style="background:#EEF2FF;color:#4F46E5"><i class="fas fa-book-open"></i></div>
                <div class="report-stat-body">
                    <div class="report-stat-label">이번 달 진도량</div>
                    <div class="report-stat-value">${totalMonthProgress}<span style="font-size:0.8rem;font-weight:400"> 회</span></div>
                </div>
            </div>
            <div class="report-stat-card">
                <div class="report-stat-icon" style="background:#F0FDF4;color:#16A34A"><i class="fas fa-chart-line"></i></div>
                <div class="report-stat-body">
                    <div class="report-stat-label">계획 달성률</div>
                    <div class="report-stat-value">${avgPlanRate !== null ? avgPlanRate + '%' : '-'}</div>
                </div>
            </div>
            <div class="report-stat-card">
                <div class="report-stat-icon" style="background:#FFF7ED;color:#EA580C"><i class="fas fa-calendar-check"></i></div>
                <div class="report-stat-body">
                    <div class="report-stat-label">출석률</div>
                    <div class="report-stat-value">${attStats.rate !== null ? attStats.rate + '%' : '-'}</div>
                </div>
            </div>
            <div class="report-stat-card">
                <div class="report-stat-icon" style="background:#FFF1F2;color:#E11D48"><i class="fas fa-tasks"></i></div>
                <div class="report-stat-body">
                    <div class="report-stat-label">숙제 완료율</div>
                    <div class="report-stat-value">${hwAll.length > 0 ? Math.round((hwDone / hwAll.length) * 100) + '%' : '-'}</div>
                </div>
            </div>
        </div>`;

        const html = controlBar + `
        <!-- 학생 헤더 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-body" style="padding:20px 24px">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                    <div>
                        <div style="font-size:1.3rem;font-weight:700;color:var(--gray-800)">${this.escapeHtml(student.name)}</div>
                        <div style="font-size:0.88rem;color:var(--gray-500);margin-top:2px">${this.escapeHtml(student.grade || '')} · ${this.escapeHtml(student.school || '')}</div>
                    </div>
                    <div style="font-size:1.1rem;font-weight:600;color:var(--primary)">${year}년 ${month}월 학습 리포트</div>
                </div>
            </div>
        </div>

        <!-- 요약 통계 -->
        ${summaryCards}

        <div class="report-grid">
            <!-- 학습 계획 진행 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-book-open" style="color:var(--primary)"></i> 학습 계획 진행 현황 (${plans.length}개)</h2></div>
                <div class="card-body">${planSection}</div>
            </div>

            <!-- 출석 현황 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-calendar-check" style="color:var(--success)"></i> 출석 현황</h2></div>
                <div class="card-body">
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;text-align:center;margin-bottom:12px">
                        <div><div style="font-size:1.4rem;font-weight:700;color:var(--success)">${attStats['출석']}</div><div style="font-size:0.78rem;color:var(--gray-400)">출석</div></div>
                        <div><div style="font-size:1.4rem;font-weight:700;color:var(--danger)">${attStats['결석']}</div><div style="font-size:0.78rem;color:var(--gray-400)">결석</div></div>
                        <div><div style="font-size:1.4rem;font-weight:700;color:var(--warning)">${attStats['지각']}</div><div style="font-size:0.78rem;color:var(--gray-400)">지각</div></div>
                        <div><div style="font-size:1.4rem;font-weight:700;color:var(--info)">${attStats['조퇴']}</div><div style="font-size:0.78rem;color:var(--gray-400)">조퇴</div></div>
                    </div>
                    ${attStats.rate !== null ? `
                    <div style="background:var(--gray-100);border-radius:8px;height:12px;overflow:hidden;margin-bottom:4px">
                        <div style="width:${attStats.rate}%;background:${attStats.rate >= 90 ? 'var(--success)' : attStats.rate >= 70 ? 'var(--warning)' : 'var(--danger)'};height:100%;border-radius:8px"></div>
                    </div>
                    <div style="text-align:right;font-size:0.82rem;font-weight:700;color:${attStats.rate >= 90 ? 'var(--success)' : attStats.rate >= 70 ? 'var(--warning)' : 'var(--danger)'}">출석률 ${attStats.rate}%</div>
                    ` : '<div style="color:var(--gray-300);padding:12px 0">출석 데이터가 없습니다.</div>'}
                </div>
            </div>

            <!-- 숙제 완료 현황 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-tasks" style="color:var(--warning)"></i> 숙제 완료 현황 (${hwAll.length}개)</h2></div>
                <div class="card-body">
                    ${hwAll.length === 0
                        ? '<div style="color:var(--gray-300)">이번 달 숙제가 없습니다.</div>'
                        : `<div style="display:flex;align-items:center;gap:16px;margin-bottom:10px">
                            <div style="font-size:2rem;font-weight:700;color:var(--success)">${hwDone}</div>
                            <div style="font-size:1rem;color:var(--gray-400)">/ ${hwAll.length}</div>
                            <div style="flex:1">
                                <div style="background:var(--gray-100);border-radius:6px;height:10px;overflow:hidden">
                                    <div style="width:${Math.round((hwDone/hwAll.length)*100)}%;background:var(--success);height:100%;border-radius:6px"></div>
                                </div>
                                <div style="text-align:right;font-size:0.78rem;color:var(--success);font-weight:700;margin-top:2px">${Math.round((hwDone/hwAll.length)*100)}%</div>
                            </div>
                           </div>
                           <div style="font-size:0.82rem">
                           ${hwAll.map(h => `
                           <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--gray-100)">
                               <i class="fas ${DataStore.isHomeworkCompletedBy(h, student.id) ? 'fa-check-circle' : 'fa-circle'}" style="color:${DataStore.isHomeworkCompletedBy(h, student.id) ? 'var(--success)' : 'var(--gray-200)'}"></i>
                               <span style="${DataStore.isHomeworkCompletedBy(h, student.id) ? 'text-decoration:line-through;color:var(--gray-400)' : ''}">${this.escapeHtml(h.title)}</span>
                               ${h.dueDate ? `<span style="margin-left:auto;font-size:0.75rem;color:var(--gray-400)">${h.dueDate}</span>` : ''}
                           </div>`).join('')}
                           </div>`}
                </div>
            </div>

            <!-- 시험 성적 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-trophy" style="color:var(--warning)"></i> 이번 달 시험 성적</h2></div>
                <div class="card-body">${gradeSection}</div>
            </div>

            <!-- 자기 진도 일지 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-pencil-alt" style="color:var(--info)"></i> 자기 진도 일지 (${selfJournals.length}회)</h2></div>
                <div class="card-body">${journalSection}</div>
            </div>

            <!-- 코멘트 -->
            <div class="card">
                <div class="card-header"><h2><i class="fas fa-comments" style="color:var(--primary)"></i> 코멘트 (${monthComments.length}개)</h2></div>
                <div class="card-body" style="padding:${monthComments.length ? '8px 20px' : ''}">${commentSection}</div>
            </div>
        </div>`;

        document.getElementById('content-area').innerHTML = html;
        this._bindReportEvents();
    },

    _bindReportEvents() {
        const sel = document.getElementById('report-student-select');
        if (sel) {
            sel.addEventListener('change', () => {
                this._reportStudentId = sel.value;
                this.renderReport(sel.value, this._reportYM);
            });
        }
    },

    // =========================================
    //  VIEW: ATTENDANCE (출석 관리 - 선생/원장)
    // =========================================
    renderAttendance() {
        const students = this.getVisibleStudents();
        const today = this.getLocalDateStr();
        const ym = this._attendanceYM || today.slice(0, 7);
        this._attendanceYM = ym;

        const STATUS = ['출석', '결석', '지각', '조퇴'];
        const STATUS_COLOR = { '출석': 'var(--success)', '결석': 'var(--danger)', '지각': 'var(--warning)', '조퇴': 'var(--info)' };

        // 해당 월의 날짜 수
        const [year, month] = ym.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();

        // 학생별 통계
        const statsRows = students.map(s => {
            const stats = DataStore.getAttendanceStats(s.id, ym);
            return { s, stats };
        });

        const html = `
        <!-- 헤더: 월 이동 + 날짜별 빠른 입력 버튼 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" data-action="att-prev-month"><i class="fas fa-chevron-left"></i></button>
                <strong style="font-size:1.05rem;min-width:90px;text-align:center">${year}년 ${month}월</strong>
                <button class="btn btn-outline btn-sm" data-action="att-next-month"><i class="fas fa-chevron-right"></i></button>
                <span style="color:var(--gray-400);font-size:0.85rem;margin-left:8px">날짜를 선택해 출석을 일괄 입력하세요</span>
                <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
                    ${STATUS.map(st => `<span style="font-size:0.8rem;display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:50%;background:${STATUS_COLOR[st]};display:inline-block"></span>${st}</span>`).join('')}
                </div>
            </div>
        </div>

        <!-- 월별 학생 통계 테이블 -->
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2><i class="fas fa-chart-bar"></i> ${year}년 ${month}월 출석 현황</h2></div>
            <div class="card-body no-padding">
                ${students.length === 0
                    ? '<div class="empty-state" style="padding:30px"><p>담당 학생이 없습니다</p></div>'
                    : `<div class="table-wrapper"><table class="pivot-table">
                    <thead><tr>
                        <th style="min-width:80px">학생</th>
                        <th style="color:var(--success)">출석</th>
                        <th style="color:var(--danger)">결석</th>
                        <th style="color:var(--warning)">지각</th>
                        <th style="color:var(--info)">조퇴</th>
                        <th>출석률</th>
                        <th>출석 입력</th>
                    </tr></thead>
                    <tbody>
                        ${statsRows.map(({ s, stats }) => `
                        <tr>
                            <td><strong>${this.escapeHtml(s.name)}</strong><div style="font-size:0.75rem;color:var(--gray-400)">${this.escapeHtml(s.grade)}</div></td>
                            <td style="text-align:center;color:var(--success);font-weight:600">${stats['출석']}</td>
                            <td style="text-align:center;color:var(--danger);font-weight:600">${stats['결석']}</td>
                            <td style="text-align:center;color:var(--warning);font-weight:600">${stats['지각']}</td>
                            <td style="text-align:center;color:var(--info);font-weight:600">${stats['조퇴']}</td>
                            <td style="text-align:center">
                                ${stats.rate !== null
                                    ? `<span style="font-weight:700;color:${stats.rate >= 90 ? 'var(--success)' : stats.rate >= 70 ? 'var(--warning)' : 'var(--danger)'}">${stats.rate}%</span>`
                                    : '<span style="color:var(--gray-300)">-</span>'}
                            </td>
                            <td style="text-align:center">
                                <button class="btn btn-sm btn-outline" data-action="att-input-student" data-student-id="${s.id}" data-student-name="${this.escapeHtml(s.name)}">
                                    <i class="fas fa-edit"></i> 입력
                                </button>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table></div>`}
            </div>
        </div>

        <!-- 날짜별 일괄 입력 -->
        <div class="card">
            <div class="card-header"><h2><i class="fas fa-calendar-day"></i> 날짜별 출석 입력</h2></div>
            <div class="card-body">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
                    <label style="font-weight:600">날짜 선택</label>
                    <input type="date" id="att-bulk-date" class="form-control" value="${today}" style="max-width:170px"
                        min="${ym}-01" max="${ym}-${String(daysInMonth).padStart(2,'0')}">
                    <button class="btn btn-primary btn-sm" data-action="att-load-day"><i class="fas fa-search"></i> 불러오기</button>
                </div>
                <div id="att-bulk-list"></div>
            </div>
        </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    // 날짜별 학생 출석 입력 UI 로드
    loadAttBulkDay() {
        const date = (document.getElementById('att-bulk-date') || {}).value;
        if (!date) return;
        const students = this.getVisibleStudents();
        const STATUS_COLOR = { '출석': 'var(--success)', '결석': 'var(--danger)', '지각': 'var(--warning)', '조퇴': 'var(--info)' };

        const html = students.map(s => {
            const rec = DataStore.getStudentAttendanceOnDate(s.id, date);
            const cur = rec ? rec.status : '';
            return `
            <div class="att-bulk-row">
                <div class="att-bulk-name">
                    <strong>${this.escapeHtml(s.name)}</strong>
                    <span style="font-size:0.78rem;color:var(--gray-400)">${this.escapeHtml(s.grade)}</span>
                </div>
                <div class="att-status-group" data-student-id="${s.id}" data-date="${date}">
                    ${['출석','결석','지각','조퇴'].map(st => `
                    <button class="att-status-btn ${cur === st ? 'active' : ''}"
                        style="${cur === st ? `background:${STATUS_COLOR[st]};color:white;border-color:${STATUS_COLOR[st]}` : ''}"
                        data-action="att-set-status" data-student-id="${s.id}" data-date="${date}" data-status="${st}">
                        ${st}
                    </button>`).join('')}
                    ${cur ? `<span class="badge ${cur === '출석' ? 'badge-success' : cur === '결석' ? 'badge-danger' : cur === '지각' ? 'badge-warning' : 'badge-info'}" style="margin-left:4px">${cur}</span>` : '<span style="font-size:0.78rem;color:var(--gray-300);margin-left:4px">미입력</span>'}
                </div>
            </div>`;
        }).join('');

        document.getElementById('att-bulk-list').innerHTML = html ||
            '<div style="color:var(--gray-400);padding:12px">담당 학생이 없습니다.</div>';
    },

    // 학생별 월 출석 기록 모달
    showStudentAttendanceModal(studentId, studentName) {
        const ym = this._attendanceYM || this.getLocalDateStr().slice(0, 7);
        const [year, month] = ym.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const STATUS_COLOR = { '출석': 'var(--success)', '결석': 'var(--danger)', '지각': 'var(--warning)', '조퇴': 'var(--info)' };

        const rows = Array.from({ length: daysInMonth }, (_, i) => {
            const d = String(i + 1).padStart(2, '0');
            const date = `${ym}-${d}`;
            const rec = DataStore.getStudentAttendanceOnDate(studentId, date);
            const cur = rec ? rec.status : '';
            const dayOfWeek = new Date(date).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            return `
            <div class="att-bulk-row ${isWeekend ? 'att-weekend' : ''}">
                <div class="att-bulk-name">
                    <span style="font-weight:600;color:${isWeekend ? 'var(--gray-300)' : ''}">${month}/${i+1} (${'일월화수목금토'[dayOfWeek]})</span>
                </div>
                <div class="att-status-group" data-student-id="${studentId}" data-date="${date}">
                    ${['출석','결석','지각','조퇴'].map(st => `
                    <button class="att-status-btn ${cur === st ? 'active' : ''}"
                        style="${cur === st ? `background:${STATUS_COLOR[st]};color:white;border-color:${STATUS_COLOR[st]}` : ''}"
                        data-action="att-set-status-modal" data-student-id="${studentId}" data-date="${date}" data-status="${st}">
                        ${st}
                    </button>`).join('')}
                    ${cur ? `<span style="font-size:0.8rem;color:${STATUS_COLOR[cur]};font-weight:600;margin-left:6px">${cur}</span>` : ''}
                </div>
            </div>`;
        }).join('');

        const stats = DataStore.getAttendanceStats(studentId, ym);
        const summary = `출석 ${stats['출석']} · 결석 ${stats['결석']} · 지각 ${stats['지각']} · 조퇴 ${stats['조퇴']} ${stats.rate !== null ? `· 출석률 <strong>${stats.rate}%</strong>` : ''}`;

        this.openModal(`${studentName} — ${year}년 ${month}월 출석`,
            `<div style="font-size:0.85rem;color:var(--gray-500);margin-bottom:12px">${summary}</div>
             <div style="max-height:60vh;overflow-y:auto">${rows}</div>`);
    },

    // =========================================
    //  VIEW: TASKS (업무 노트 - 선생/원장 전용)
    // =========================================
    renderTasks() {
        const tasks = DataStore.getMyTasks();
        const students = this.getVisibleStudents();
        const pending = tasks.filter(t => !t.completed);
        const done = tasks.filter(t => t.completed);

        const taskRow = (t) => {
            const student = t.studentId ? DataStore.getStudent(t.studentId) : null;
            return `
            <div class="task-item ${t.completed ? 'task-done' : ''}" data-task-id="${t.id}">
                <label class="task-checkbox-label">
                    <input type="checkbox" ${t.completed ? 'checked' : ''} data-action="toggle-task" data-task-id="${t.id}">
                </label>
                <div class="task-body">
                    <div class="task-content">${this.escapeHtml(t.content)}</div>
                    <div class="task-meta">
                        ${student ? `<span style="color:var(--primary);font-size:0.8rem"><i class="fas fa-user-graduate"></i> ${this.escapeHtml(student.name)}</span>` : ''}
                        ${t.dueDate ? `<span style="color:${t.dueDate < this.getLocalDateStr() && !t.completed ? 'var(--danger)' : 'var(--gray-400)'};font-size:0.8rem"><i class="fas fa-calendar"></i> ${t.dueDate}</span>` : ''}
                        <span style="color:var(--gray-300);font-size:0.75rem">${this.formatDateTime(t.createdAt)}</span>
                    </div>
                </div>
                <button class="btn-icon" data-action="delete-task" data-task-id="${t.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
            </div>`;
        };

        const html = `
        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h2><i class="fas fa-plus"></i> 새 할 일 추가</h2></div>
            <div class="card-body">
                <div class="form-group">
                    <input type="text" id="task-content-input" class="form-control" placeholder="할 일을 입력하세요 (예: 박준서 - 다음 수업 전 영어 단어 테스트 확인)" style="margin-bottom:8px">
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <select id="task-student-select" class="form-control" style="max-width:180px">
                        <option value="">학생 없음</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)})</option>`).join('')}
                    </select>
                    <input type="date" id="task-due-date" class="form-control" style="max-width:160px">
                    <button class="btn btn-primary btn-sm" data-action="add-task"><i class="fas fa-plus"></i> 추가</button>
                </div>
            </div>
        </div>

        <div class="card" style="margin-bottom:20px">
            <div class="card-header"><h2><i class="fas fa-list-ul"></i> 할 일 <span class="badge badge-primary">${pending.length}</span></h2></div>
            <div class="card-body" style="padding:0">
                ${pending.length === 0
                    ? '<div class="empty-state" style="padding:30px"><i class="fas fa-check-circle" style="color:var(--success)"></i><h3>모두 완료했습니다!</h3></div>'
                    : pending.map(taskRow).join('')}
            </div>
        </div>

        ${done.length > 0 ? `
        <div class="card">
            <div class="card-header" style="cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                <h2><i class="fas fa-check-circle" style="color:var(--success)"></i> 완료됨 <span class="badge badge-success">${done.length}</span></h2>
            </div>
            <div class="card-body" style="padding:0;display:none">
                ${done.map(taskRow).join('')}
            </div>
        </div>` : ''}
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    // =========================================
    //  VIEW: TEACHERS (선생님 관리 - 원장 전용)
    // =========================================
    showTeacherDetail(teacherId) {
        const t = DataStore.getTeacher(teacherId);
        if (!t) return;

        const assigned = (t.assignedStudentIds || []).map(sid => DataStore.getStudent(sid)).filter(Boolean);
        const consultations = DataStore.getConsultations().filter(c => c.teacherId === teacherId);
        const schedules = DataStore.getSchedules().filter(s => s.teacherId === teacherId);

        const roleLabel = { director: '원장', teacher: '선생님', student: '학생', parent: '학부모' }[t.role] || t.role;

        const html = `
            <div style="display:flex;flex-direction:column;gap:20px">
                <!-- 기본 정보 -->
                <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--gray-50);border-radius:var(--radius)">
                    <div style="width:64px;height:64px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:1.8rem;color:#fff;flex-shrink:0">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div>
                        <div style="font-size:1.2rem;font-weight:700">${this.escapeHtml(t.name)}</div>
                        <div style="color:var(--gray-500);font-size:0.9rem;margin-top:2px">
                            <span class="badge badge-primary">${roleLabel}</span>
                            <code style="margin-left:8px;font-size:0.82rem">${this.escapeHtml(t.loginId)}</code>
                        </div>
                        <div style="color:var(--gray-400);font-size:0.82rem;margin-top:4px">
                            가입일: ${this.escapeHtml(t.regDate || '-')}
                        </div>
                    </div>
                </div>

                <!-- 담당 학생 -->
                <div>
                    <div style="font-weight:600;margin-bottom:8px;font-size:0.95rem"><i class="fas fa-users" style="color:var(--primary)"></i> 담당 학생 (${assigned.length}명)</div>
                    ${assigned.length === 0
                        ? '<div style="color:var(--gray-400);font-size:0.88rem">담당 학생 없음</div>'
                        : `<div style="display:flex;flex-wrap:wrap;gap:8px">
                            ${assigned.map(s => `
                                <div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:var(--radius-sm);padding:6px 12px;font-size:0.88rem">
                                    <strong>${this.escapeHtml(s.name)}</strong>
                                    <span style="color:var(--gray-400);margin-left:4px">${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)}</span>
                                </div>`).join('')}
                           </div>`}
                </div>

                <!-- 담당 시간표 -->
                <div>
                    <div style="font-weight:600;margin-bottom:8px;font-size:0.95rem"><i class="fas fa-calendar-alt" style="color:var(--primary)"></i> 담당 수업 (${schedules.length}개)</div>
                    ${schedules.length === 0
                        ? '<div style="color:var(--gray-400);font-size:0.88rem">등록된 수업 없음</div>'
                        : `<div style="display:flex;flex-direction:column;gap:6px">
                            ${schedules.map(sc => `
                                <div style="display:flex;align-items:center;gap:8px;font-size:0.88rem;background:var(--gray-50);border-radius:var(--radius-sm);padding:6px 10px">
                                    <span style="background:${sc.color||'#4F46E5'};color:#fff;border-radius:4px;padding:2px 7px;font-size:0.78rem">${this.escapeHtml(sc.dayOfWeek)}</span>
                                    <span>${this.escapeHtml(sc.startTime)}~${this.escapeHtml(sc.endTime)}</span>
                                    <strong>${this.escapeHtml(sc.subject)}</strong>
                                    ${sc.room ? `<span style="color:var(--gray-400)">${this.escapeHtml(sc.room)}</span>` : ''}
                                </div>`).join('')}
                           </div>`}
                </div>

                <!-- 최근 상담 -->
                <div>
                    <div style="font-weight:600;margin-bottom:8px;font-size:0.95rem"><i class="fas fa-comments" style="color:var(--primary)"></i> 최근 상담 (총 ${consultations.length}건)</div>
                    ${consultations.length === 0
                        ? '<div style="color:var(--gray-400);font-size:0.88rem">상담 기록 없음</div>'
                        : `<div style="display:flex;flex-direction:column;gap:6px">
                            ${consultations.slice(0,5).map(c => {
                                const student = DataStore.getStudent(c.studentId);
                                return `<div style="font-size:0.88rem;border-left:3px solid var(--primary);padding:6px 10px;background:var(--gray-50);border-radius:0 var(--radius-sm) var(--radius-sm) 0">
                                    <span style="color:var(--gray-400)">${this.escapeHtml(c.date)}</span>
                                    <strong style="margin-left:8px">${student ? this.escapeHtml(student.name) : '-'}</strong>
                                    <span class="badge badge-ghost" style="margin-left:6px;font-size:0.75rem">${this.escapeHtml(c.type)}</span>
                                </div>`;
                            }).join('')}
                            ${consultations.length > 5 ? `<div style="color:var(--gray-400);font-size:0.82rem;text-align:center">외 ${consultations.length - 5}건 더 있음</div>` : ''}
                           </div>`}
                </div>
            </div>
        `;

        const fullHtml = html + `
            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--gray-200)">
                <button class="btn btn-outline" data-action="edit-teacher-assignment" data-teacher-id="${t.id}">
                    <i class="fas fa-user-plus"></i> 학생 지정 변경
                </button>
                <button class="btn btn-ghost" id="teacher-detail-close" style="color:var(--gray-500)">닫기</button>
            </div>`;

        this.openModal(`${t.name} 선생님 정보`, fullHtml);
        document.getElementById('teacher-detail-close')?.addEventListener('click', () => this.closeModal());
    },

    // =========================================
    renderTeachers() {
        if (!this.currentUser || this.currentUser.role !== 'director') {
            this.navigate('dashboard');
            return;
        }

        const teachers = DataStore.getTeachers().filter(t => t.role === 'teacher' && t.approved !== false);
        const allStudents = DataStore.getStudents().filter(s => s.status !== '대기');
        const pendingUsers = DataStore.getPendingUsers();

        const pendingHtml = pendingUsers.length > 0 ? `
            <div class="card pending-card" style="margin-bottom:24px;border-left:4px solid var(--warning)">
                <div class="card-header">
                    <h2><i class="fas fa-user-clock" style="color:var(--warning)"></i> 가입 승인 대기 <span class="badge badge-warning" style="font-size:0.8rem">${pendingUsers.length}</span></h2>
                </div>
                <div class="card-body no-padding">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>이름</th><th>아이디</th><th>유형</th><th>신청일</th><th>관리</th></tr></thead>
                            <tbody>
                                ${pendingUsers.map(u => {
                                    const roleLabels = { student: '학생', teacher: '선생님', director: '원장' };
                                    const roleLabel = roleLabels[u.role] || u.role;
                                    const roleBadgeClass = u.role === 'director' ? 'badge-danger' : u.role === 'student' ? 'badge-success' : 'badge-primary';
                                    return `<tr>
                                        <td><strong>${this.escapeHtml(u.name)}</strong></td>
                                        <td><code style="font-size:0.82rem">${this.escapeHtml(u.loginId)}</code></td>
                                        <td><span class="badge ${roleBadgeClass}">${roleLabel}</span></td>
                                        <td>${this.escapeHtml(u.regDate || '-')}</td>
                                        <td>
                                            <button class="btn btn-sm btn-primary" data-action="approve-user" data-user-id="${u.id}"><i class="fas fa-check"></i> 승인</button>
                                            <button class="btn btn-sm btn-ghost" data-action="reject-user" data-user-id="${u.id}" style="color:var(--danger)"><i class="fas fa-times"></i> 거절</button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        ` : '';

        const html = `
            ${pendingHtml}
            <div class="toolbar">
                <div class="toolbar-filters">
                    <h3 style="margin:0;font-size:1rem"><i class="fas fa-chalkboard-teacher"></i> 선생님별 담당 학생 관리</h3>
                </div>
                <button class="btn btn-primary" data-action="add-teacher"><i class="fas fa-plus"></i> 선생님 추가</button>
            </div>

            <div class="teachers-grid">
                ${teachers.map(t => {
                    const assigned = (t.assignedStudentIds || []).map(sid => DataStore.getStudent(sid)).filter(Boolean);
                    return `<div class="card teacher-card" style="margin-bottom:16px">
                        <div class="card-header">
                            <h2>
                                <span class="teacher-name-link" data-action="view-teacher" data-teacher-id="${t.id}" style="cursor:pointer;color:var(--primary)" title="선생님 정보 보기">
                                    <i class="fas fa-user-tie"></i> ${this.escapeHtml(t.name)}
                                </span>
                                <span class="badge badge-primary" style="font-size:0.75rem;margin-left:6px">${this.escapeHtml(t.loginId)}</span>
                            </h2>
                            <div>
                                <button class="btn btn-sm btn-outline" data-action="edit-teacher-assignment" data-teacher-id="${t.id}"><i class="fas fa-user-plus"></i> 학생 지정</button>
                                <button class="btn btn-sm btn-ghost" data-action="delete-teacher" data-teacher-id="${t.id}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                            </div>
                        </div>
                        <div class="card-body">
                            ${assigned.length === 0
                                ? '<span style="color:var(--gray-400);font-size:0.85rem">담당 학생 없음</span>'
                                : `<div class="assigned-students-list">${assigned.map(s =>
                                    `<span class="assigned-student-tag">
                                        <span class="student-name" data-action="view-student" data-id="${s.id}">${this.escapeHtml(s.name)}</span>
                                        <span style="font-size:0.72rem;color:var(--gray-400)">${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)}</span>
                                        <button class="btn-icon" data-action="unassign-student" data-teacher-id="${t.id}" data-student-id="${s.id}" title="해제" style="font-size:0.7rem;color:var(--gray-400)"><i class="fas fa-times"></i></button>
                                    </span>`).join('')}</div>`}
                        </div>
                    </div>`;
                }).join('')}
            </div>

            ${teachers.length === 0 ? '<div class="card"><div class="empty-state"><i class="fas fa-chalkboard-teacher"></i><h3>등록된 선생님이 없습니다</h3></div></div>' : ''}

            <div class="card" style="margin-top:24px">
                <div class="card-header"><h2><i class="fas fa-users"></i> 전체 학생 담당 현황</h2></div>
                <div class="card-body no-padding">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>학생</th><th>학교</th><th>학년/반</th><th>담당 선생님</th><th>관리</th></tr></thead>
                            <tbody>
                                ${allStudents.map(s => {
                                    const st = DataStore.getStudentTeachers(s.id);
                                    return `<tr>
                                        <td><span class="student-name" data-action="view-student" data-id="${s.id}">${this.escapeHtml(s.name)}</span></td>
                                        <td>${this.escapeHtml(s.school)}</td>
                                        <td>${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)}</td>
                                        <td>${st.length > 0
                                            ? st.map(t => `<span class="badge badge-primary" style="margin-right:4px">${this.escapeHtml(t.name)}</span>`).join('')
                                            : '<span style="color:var(--gray-400)">미지정</span>'}</td>
                                        <td><button class="btn btn-sm btn-outline" data-action="assign-teachers" data-student-id="${s.id}"><i class="fas fa-chalkboard-teacher"></i> 지정</button></td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    showTeacherAssignmentModal(studentId) {
        const student = DataStore.getStudent(studentId);
        if (!student) return;
        const teachers = DataStore.getTeachers().filter(t => t.role === 'teacher');
        const currentTeachers = DataStore.getStudentTeachers(studentId);
        const currentIds = currentTeachers.map(t => t.id);

        const html = `
            <form id="assignment-form">
                <p style="margin-bottom:16px;color:var(--gray-600)"><strong>${this.escapeHtml(student.name)}</strong> (${this.escapeHtml(student.grade)} ${this.escapeHtml(student.className)})의 담당 선생님을 선택하세요.</p>
                <div class="teacher-checkbox-list">
                    ${teachers.map(t => `
                        <label class="teacher-checkbox-item">
                            <input type="checkbox" name="teacherIds" value="${t.id}" ${currentIds.includes(t.id) ? 'checked' : ''}>
                            <span class="teacher-checkbox-label">
                                <i class="fas fa-user-tie"></i> ${this.escapeHtml(t.name)}
                                <span style="font-size:0.78rem;color:var(--gray-400);margin-left:4px">(${this.escapeHtml(t.loginId)})</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
                ${teachers.length === 0 ? '<p style="color:var(--gray-400)">등록된 선생님이 없습니다.</p>' : ''}
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> 저장</button>
                </div>
            </form>
        `;

        this.openModal('담당 선생님 지정', html);

        document.getElementById('assignment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const selectedIds = [...form.querySelectorAll('input[name="teacherIds"]:checked')].map(cb => cb.value);

            try {
                // Update all teachers: add/remove this student
                for (const t of teachers) {
                    const hasStudent = (t.assignedStudentIds || []).includes(studentId);
                    const shouldHave = selectedIds.includes(t.id);
                    if (shouldHave && !hasStudent) {
                        await DataStore.assignStudentToTeacher(t.id, studentId);
                    } else if (!shouldHave && hasStudent) {
                        await DataStore.unassignStudentFromTeacher(t.id, studentId);
                    }
                }

                // Also update director's list
                const director = DataStore.getTeachers().find(t => t.role === 'director');
                if (director && !(director.assignedStudentIds || []).includes(studentId)) {
                    await DataStore.assignStudentToTeacher(director.id, studentId);
                }

                this.toast('담당 선생님이 변경되었습니다.', 'success');
                this.closeModal();
                if (this.currentView === 'teachers') this.renderTeachers();
                else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
            } catch(err) {
                this.toast('저장 실패: ' + err.message, 'error');
            }
        });
    },

    showTeacherForm(teacher = null, defaultRole = 'teacher') {
        const isEdit = !!teacher;
        const allStudents = DataStore.getStudents();
        const currentRole = isEdit ? (teacher.role || 'teacher') : defaultRole;

        const html = `
            <form id="teacher-form">
                ${!isEdit ? `
                <div class="form-group">
                    <label>계정 유형</label>
                    <div style="display:flex;gap:8px;margin-bottom:4px">
                        <button type="button" class="role-tab-btn ${currentRole === 'teacher' ? 'active' : ''}" data-role="teacher" onclick="document.querySelector('[name=accountRole]').value='teacher';document.getElementById('parent-student-group').style.display='none';this.parentElement.querySelectorAll('.role-tab-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">
                            <i class="fas fa-chalkboard-teacher"></i> 선생님
                        </button>
                        <button type="button" class="role-tab-btn ${currentRole === 'parent' ? 'active' : ''}" data-role="parent" onclick="document.querySelector('[name=accountRole]').value='parent';document.getElementById('parent-student-group').style.display='';this.parentElement.querySelectorAll('.role-tab-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">
                            <i class="fas fa-user-friends"></i> 학부모
                        </button>
                    </div>
                    <input type="hidden" name="accountRole" value="${currentRole}">
                </div>` : ''}
                <div class="form-row">
                    <div class="form-group">
                        <label>이름 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" required value="${isEdit ? this.escapeHtml(teacher.name) : ''}" placeholder="이름">
                    </div>
                    <div class="form-group">
                        <label>로그인 ID <span class="required">*</span></label>
                        <input type="text" class="form-control" name="loginId" required value="${isEdit ? this.escapeHtml(teacher.loginId) : ''}" placeholder="로그인 아이디" ${isEdit ? 'disabled' : ''}>
                    </div>
                </div>
                <div class="form-group">
                    <label>비밀번호 ${isEdit ? '' : '<span class="required">*</span>'}</label>
                    <input type="password" class="form-control" name="password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? '변경시에만 입력' : '비밀번호 (기본값: 1234)'}">
                </div>
                <div class="form-group" id="parent-student-group" style="display:${currentRole === 'parent' ? '' : 'none'}">
                    <label>연결할 자녀 <span class="required">*</span></label>
                    <select class="form-control" name="parentStudentId">
                        <option value="">학생 선택</option>
                        ${allStudents.map(s => `<option value="${s.id}" ${isEdit && teacher.studentId === s.id ? 'selected' : ''}>${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '등록'}</button>
                </div>
                ${isEdit ? `<input type="hidden" name="teacherId" value="${teacher.id}">` : ''}
            </form>
        `;

        this.openModal(isEdit ? '계정 정보 수정' : '새 계정 등록', html);

        // role-tab-btn 스타일 (인라인)
        document.querySelectorAll('.role-tab-btn').forEach(btn => {
            btn.style.cssText = 'padding:6px 14px;border-radius:6px;border:1px solid var(--gray-200);background:white;cursor:pointer;font-size:0.88rem;';
            if (btn.classList.contains('active')) btn.style.background = 'var(--primary)'; btn.style.color = btn.classList.contains('active') ? 'white' : '';
        });

        document.getElementById('teacher-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.name.value.trim();
            const loginId = isEdit ? teacher.loginId : form.loginId.value.trim();
            const password = form.password.value;
            const accountRole = isEdit ? (teacher.role || 'teacher') : (form.querySelector('[name=accountRole]').value || 'teacher');

            if (!isEdit && DataStore.getTeacherByLoginId(loginId)) {
                this.toast('이미 존재하는 로그인 ID입니다.', 'error');
                return;
            }

            try {
                if (isEdit) {
                    const updates = { name };
                    if (password) updates.password = bcrypt.hashSync(password, 10);
                    await DataStore.updateTeacher(teacher.id, updates);
                    this.toast('정보가 수정되었습니다.', 'success');
                } else {
                    const rawPw = password || '1234';
                    if (accountRole === 'parent') {
                        const parentStudentId = form.querySelector('[name=parentStudentId]').value;
                        if (!parentStudentId) { this.toast('연결할 학생을 선택해주세요.', 'error'); return; }
                        await DataStore.addTeacher({ name, loginId, password: bcrypt.hashSync(rawPw, 10), role: 'parent', studentId: parentStudentId, assignedStudentIds: [parentStudentId], approved: true });
                        this.toast(`학부모 계정이 등록되었습니다. (초기 비밀번호: ${rawPw})`, 'success');
                    } else {
                        await DataStore.addTeacher({ name, loginId, password: bcrypt.hashSync(rawPw, 10), role: 'teacher', assignedStudentIds: [], approved: true });
                        this.toast(`새 선생님이 등록되었습니다. (초기 비밀번호: ${rawPw})`, 'success');
                    }
                }

                this.closeModal();
                this.renderTeachers();
            } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        });
    },

    showTeacherEditAssignment(teacherId) {
        const teacher = DataStore.getTeacher(teacherId);
        if (!teacher) return;
        const allStudents = DataStore.getStudents();
        const currentIds = teacher.assignedStudentIds || [];

        const html = `
            <form id="teacher-assign-form">
                <p style="margin-bottom:16px;color:var(--gray-600)"><strong>${this.escapeHtml(teacher.name)}</strong>의 담당 학생을 선택하세요.</p>
                <div class="teacher-checkbox-list">
                    ${allStudents.map(s => `
                        <label class="teacher-checkbox-item">
                            <input type="checkbox" name="studentIds" value="${s.id}" ${currentIds.includes(s.id) ? 'checked' : ''}>
                            <span class="teacher-checkbox-label">
                                <i class="fas fa-user-graduate"></i> ${this.escapeHtml(s.name)}
                                <span style="font-size:0.78rem;color:var(--gray-400);margin-left:4px">(${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)})</span>
                            </span>
                        </label>
                    `).join('')}
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> 저장</button>
                </div>
            </form>
        `;

        this.openModal('담당 학생 지정 - ' + teacher.name, html);

        document.getElementById('teacher-assign-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const selectedIds = [...form.querySelectorAll('input[name="studentIds"]:checked')].map(cb => cb.value);
            try {
                await DataStore.updateTeacher(teacherId, { assignedStudentIds: selectedIds });
                this.toast('담당 학생이 변경되었습니다.', 'success');
                this.closeModal();
                this.renderTeachers();
            } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        });
    },

    // =========================================
    //  VIEW: BOARD (학원 게시판)
    // =========================================
    _boardTab: 'posts',
    _boardCalYear: new Date().getFullYear(),
    _boardCalMonth: new Date().getMonth(),

    renderBoard() {
        const tab = this._boardTab || 'posts';
        const role = this.currentUser ? this.currentUser.role : '';

        const tabsHtml = `
            <div class="board-tabs">
                <button class="board-tab ${tab === 'posts' ? 'active' : ''}" data-action="board-switch-tab" data-tab="posts">
                    <i class="fas fa-clipboard-list"></i> 게시판
                </button>
                <button class="board-tab ${tab === 'calendar' ? 'active' : ''}" data-action="board-switch-tab" data-tab="calendar">
                    <i class="fas fa-calendar-alt"></i> 학원 일정
                </button>
            </div>
        `;

        if (tab === 'posts') {
            this.renderBoardPosts(tabsHtml);
        } else {
            this.renderBoardCalendar(tabsHtml);
        }
    },

    // 공유 범위 필터링
    filterByScope(items) {
        const user = this.currentUser;
        if (!user) return [];
        return items.filter(item => {
            if (item.scope === 'all') return true;
            if (item.scope === 'staff') return user.role === 'director' || user.role === 'teacher';
            if (item.scope === 'private') return item.authorId === user.id;
            return true;
        });
    },

    getScopeBadge(scope) {
        const map = {
            all: ['badge-success', '전체'],
            staff: ['badge-primary', '강사진'],
            private: ['badge-warning', '개인']
        };
        const [cls, label] = map[scope] || ['badge-gray', scope];
        return `<span class="badge ${cls}">${this.escapeHtml(label)}</span>`;
    },

    getScopeColor(scope) {
        return { all: 'var(--success)', staff: 'var(--primary)', private: 'var(--warning)' }[scope] || 'var(--gray-400)';
    },

    // ---- 게시판 탭 ----
    renderBoardPosts(tabsHtml) {
        const role = this.currentUser ? this.currentUser.role : '';
        const canWrite = role === 'director' || role === 'teacher';
        let posts = this.filterByScope(DataStore.getBoardPosts());

        const html = `
            ${tabsHtml}
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-board-scope" onchange="App.filterBoardPosts()">
                        <option value="">전체 범위</option>
                        <option value="all">🟢 학원 전체</option>
                        ${role !== 'student' ? '<option value="staff">🔵 강사진</option>' : ''}
                        <option value="private">🟡 개인</option>
                    </select>
                    <span style="color:var(--gray-500);font-size:0.85rem">${posts.length}건</span>
                </div>
                ${canWrite ? '<button class="btn btn-primary" data-action="add-board-post"><i class="fas fa-pen"></i> 새 글 작성</button>' : ''}
            </div>

            <div id="board-posts-container">
                ${this.renderBoardPostCards(posts)}
            </div>
        `;
        document.getElementById('content-area').innerHTML = html;
    },

    renderBoardPostCards(posts) {
        if (posts.length === 0) return '<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>게시글이 없습니다</h3></div>';
        const role = this.currentUser ? this.currentUser.role : '';

        return posts.map(post => {
            const canDelete = role === 'director' || post.authorId === (this.currentUser && this.currentUser.id);
            const roleBadge = post.authorRole === 'director'
                ? '<span class="badge badge-danger">원장</span>'
                : '<span class="badge badge-primary">선생님</span>';

            return `<div class="board-post-card">
                <div class="board-post-header">
                    <div class="board-post-meta">
                        ${this.getScopeBadge(post.scope)}
                        ${roleBadge}
                        <span class="board-post-author">${this.escapeHtml(post.author)}</span>
                        <span class="board-post-date">${this.formatDateTime(post.createdAt)}</span>
                    </div>
                    ${canDelete ? `<button class="btn-icon" data-action="delete-board-post" data-post-id="${post.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="board-post-body" data-action="view-board-post" data-post-id="${post.id}" style="cursor:pointer">
                    <h3 class="board-post-title">${this.escapeHtml(post.title)}</h3>
                    <p class="board-post-preview">${this.escapeHtml(post.content).substring(0, 150)}${post.content.length > 150 ? '...' : ''}</p>
                </div>
            </div>`;
        }).join('');
    },

    filterBoardPosts() {
        const scope = document.getElementById('filter-board-scope').value;
        let posts = this.filterByScope(DataStore.getBoardPosts());
        if (scope) posts = posts.filter(p => p.scope === scope);
        const container = document.getElementById('board-posts-container');
        if (container) container.innerHTML = this.renderBoardPostCards(posts);
    },

    showBoardPostDetail(postId) {
        const post = DataStore.getBoardPost(postId);
        if (!post) return;
        const roleBadge = post.authorRole === 'director'
            ? '<span class="badge badge-danger">원장</span>'
            : '<span class="badge badge-primary">선생님</span>';

        const html = `
            <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
                ${this.getScopeBadge(post.scope)} ${roleBadge}
                <span style="font-weight:600">${this.escapeHtml(post.author)}</span>
                <span style="font-size:0.82rem;color:var(--gray-400)">${this.formatDateTime(post.createdAt)}</span>
            </div>
            <div style="background:var(--gray-50);padding:16px;border-radius:8px;font-size:0.93rem;line-height:1.8;color:var(--gray-700);white-space:pre-line">${this.escapeHtml(post.content)}</div>
        `;
        this.openModal(post.title, html);
    },

    showBoardPostForm() {
        const user = this.currentUser;
        const authorName = user ? user.name : '';
        const role = user ? user.role : 'teacher';

        const html = `
            <form id="board-post-form">
                <div class="form-group">
                    <label>작성자</label>
                    <input type="text" class="form-control" name="author" value="${this.escapeHtml(authorName)}" readonly style="background:var(--gray-50)">
                </div>
                <div class="form-group">
                    <label>공유 범위 <span class="required">*</span></label>
                    <div class="scope-select-group">
                        <label class="scope-option scope-all">
                            <input type="radio" name="scope" value="all" checked>
                            <span><i class="fas fa-globe"></i> 학원 전체</span>
                            <small>원장, 선생, 학생, 학부모</small>
                        </label>
                        <label class="scope-option scope-staff">
                            <input type="radio" name="scope" value="staff">
                            <span><i class="fas fa-user-tie"></i> 강사진</span>
                            <small>원장, 선생님만</small>
                        </label>
                        <label class="scope-option scope-private">
                            <input type="radio" name="scope" value="private">
                            <span><i class="fas fa-lock"></i> 개인</span>
                            <small>나만 확인</small>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>제목 <span class="required">*</span></label>
                    <input type="text" class="form-control" name="title" required placeholder="게시글 제목">
                </div>
                <div class="form-group">
                    <label>내용 <span class="required">*</span></label>
                    <textarea class="form-control" name="content" rows="6" required placeholder="내용을 입력하세요"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> 등록</button>
                </div>
            </form>
        `;
        this.openModal('새 글 작성', html);

        document.getElementById('board-post-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
                await DataStore.addBoardPost({
                    author: form.author.value.trim(),
                    authorRole: role,
                    authorId: user.id,
                    scope: form.scope.value,
                    title: form.title.value.trim(),
                    content: form.content.value.trim()
                });
                this.toast('게시글이 등록되었습니다.', 'success');
                this.closeModal();
                this.renderBoard();
            } catch(err) { this.toast('등록 실패: ' + err.message, 'error'); }
        });
    },

    // ---- 학원 일정 탭 (월간 캘린더) ----
    renderBoardCalendar(tabsHtml) {
        const year = this._boardCalYear;
        const month = this._boardCalMonth;
        const role = this.currentUser ? this.currentUser.role : '';
        const canWrite = role === 'director' || role === 'teacher';
        const events = this.filterByScope(DataStore.getEventsForMonth(year, month));

        const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
        const calendarHtml = this.buildCalendarGrid(year, month, events);

        // 이번 달 일정 목록
        const eventListHtml = events.length === 0
            ? '<div class="empty-state" style="padding:20px"><i class="fas fa-calendar-check"></i><p>이번 달 일정이 없습니다</p></div>'
            : events.map(ev => {
                const canDelete = role === 'director' || ev.authorId === (this.currentUser && this.currentUser.id);
                return `<div class="event-list-item" style="border-left:3px solid ${this.getScopeColor(ev.scope)}">
                    <div class="event-list-info">
                        <span class="event-list-date">${ev.date ? ev.date.slice(5) : ''}</span>
                        ${this.getScopeBadge(ev.scope)}
                        <span class="event-list-title">${this.escapeHtml(ev.title)}</span>
                        ${ev.description ? `<span class="event-list-desc">${this.escapeHtml(ev.description).substring(0, 50)}</span>` : ''}
                    </div>
                    ${canDelete ? `<button class="btn-icon" data-action="delete-board-event" data-event-id="${ev.id}" title="삭제" style="color:var(--danger);font-size:0.75rem"><i class="fas fa-trash"></i></button>` : ''}
                </div>`;
            }).join('');

        const html = `
            ${tabsHtml}
            <div class="toolbar">
                <div class="toolbar-filters">
                    <button class="btn btn-sm btn-outline" data-action="board-cal-prev"><i class="fas fa-chevron-left"></i></button>
                    <h3 style="margin:0;min-width:120px;text-align:center">${year}년 ${monthNames[month]}</h3>
                    <button class="btn btn-sm btn-outline" data-action="board-cal-next"><i class="fas fa-chevron-right"></i></button>
                    <button class="btn btn-sm btn-ghost" data-action="board-cal-today" style="margin-left:8px">오늘</button>
                </div>
                ${canWrite ? '<button class="btn btn-primary" data-action="add-board-event"><i class="fas fa-plus"></i> 일정 추가</button>' : ''}
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-body no-padding">
                    ${calendarHtml}
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h2><i class="fas fa-list-ul"></i> ${monthNames[month]} 일정 목록</h2></div>
                <div class="card-body no-padding">
                    ${eventListHtml}
                </div>
            </div>
        `;
        document.getElementById('content-area').innerHTML = html;
    },

    buildCalendarGrid(year, month, events) {
        const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        let html = '<table class="cal-table"><thead><tr>';
        const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
        dayNames.forEach((d, i) => {
            const cls = i === 0 ? 'cal-sun' : i === 6 ? 'cal-sat' : '';
            html += `<th class="${cls}">${d}</th>`;
        });
        html += '</tr></thead><tbody><tr>';

        // 빈 칸
        for (let i = 0; i < firstDay; i++) {
            html += '<td class="cal-cell cal-empty"></td>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayOfWeek = new Date(year, month, day).getDay();
            const isToday = dateStr === todayStr;
            const dayEvents = events.filter(e => e.date === dateStr);

            const cls = [
                'cal-cell',
                isToday ? 'cal-today' : '',
                dayOfWeek === 0 ? 'cal-sun' : '',
                dayOfWeek === 6 ? 'cal-sat' : ''
            ].filter(Boolean).join(' ');

            html += `<td class="${cls}" data-action="board-cal-click" data-date="${dateStr}">
                <div class="cal-day-num">${day}</div>
                <div class="cal-events">
                    ${dayEvents.slice(0, 3).map(ev =>
                        `<div class="cal-event-dot" style="background:${this.getScopeColor(ev.scope)}" title="${this.escapeHtml(ev.title)}">${this.escapeHtml(ev.title).substring(0, 6)}</div>`
                    ).join('')}
                    ${dayEvents.length > 3 ? `<div class="cal-event-more">+${dayEvents.length - 3}</div>` : ''}
                </div>
            </td>`;

            if ((firstDay + day) % 7 === 0 && day < daysInMonth) {
                html += '</tr><tr>';
            }
        }

        // 나머지 빈 칸
        const remaining = (7 - (firstDay + daysInMonth) % 7) % 7;
        for (let i = 0; i < remaining; i++) {
            html += '<td class="cal-cell cal-empty"></td>';
        }

        html += '</tr></tbody></table>';
        return html;
    },

    showBoardEventForm(defaultDate) {
        const user = this.currentUser;
        const role = user ? user.role : 'teacher';
        const dateVal = defaultDate || `${this._boardCalYear}-${String(this._boardCalMonth + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

        const html = `
            <form id="board-event-form">
                <div class="form-group">
                    <label>날짜 <span class="required">*</span></label>
                    <input type="date" class="form-control" name="date" required value="${dateVal}">
                </div>
                <div class="form-group">
                    <label>공유 범위 <span class="required">*</span></label>
                    <div class="scope-select-group">
                        <label class="scope-option scope-all">
                            <input type="radio" name="scope" value="all" checked>
                            <span><i class="fas fa-globe"></i> 학원 전체</span>
                            <small>원장, 선생, 학생, 학부모</small>
                        </label>
                        <label class="scope-option scope-staff">
                            <input type="radio" name="scope" value="staff">
                            <span><i class="fas fa-user-tie"></i> 강사진</span>
                            <small>원장, 선생님만</small>
                        </label>
                        <label class="scope-option scope-private">
                            <input type="radio" name="scope" value="private">
                            <span><i class="fas fa-lock"></i> 개인</span>
                            <small>나만 확인</small>
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label>일정 제목 <span class="required">*</span></label>
                    <input type="text" class="form-control" name="title" required placeholder="예: 중간고사 시작, 학원 휴무 등">
                </div>
                <div class="form-group">
                    <label>설명</label>
                    <textarea class="form-control" name="description" rows="3" placeholder="상세 설명 (선택사항)"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-calendar-plus"></i> 등록</button>
                </div>
            </form>
        `;
        this.openModal('일정 추가', html);

        document.getElementById('board-event-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
                await DataStore.addBoardEvent({
                    date: form.date.value,
                    scope: form.scope.value,
                    title: form.title.value.trim(),
                    description: form.description.value.trim(),
                    author: user.name,
                    authorRole: role,
                    authorId: user.id
                });
                this.toast('일정이 등록되었습니다.', 'success');
                this.closeModal();
                // 해당 월로 이동
                const d = new Date(form.date.value);
                this._boardCalYear = d.getFullYear();
                this._boardCalMonth = d.getMonth();
                this.renderBoard();
            } catch(err) { this.toast('등록 실패: ' + err.message, 'error'); }
        });
    },

    showDateEvents(dateStr) {
        const events = this.filterByScope(DataStore.getBoardEvents().filter(e => e.date === dateStr));
        const role = this.currentUser ? this.currentUser.role : '';
        const canWrite = role === 'director' || role === 'teacher';

        const html = `
            <div class="date-events-list">
                ${events.length === 0
                    ? '<div class="empty-state" style="padding:20px"><p>이 날짜에 등록된 일정이 없습니다.</p></div>'
                    : events.map(ev => {
                        const canDelete = role === 'director' || ev.authorId === (this.currentUser && this.currentUser.id);
                        return `<div class="event-list-item" style="border-left:3px solid ${this.getScopeColor(ev.scope)};margin-bottom:8px">
                            <div class="event-list-info" style="flex:1">
                                ${this.getScopeBadge(ev.scope)}
                                <strong>${this.escapeHtml(ev.title)}</strong>
                                ${ev.description ? `<div style="font-size:0.85rem;color:var(--gray-500);margin-top:4px">${this.escapeHtml(ev.description)}</div>` : ''}
                                <div style="font-size:0.75rem;color:var(--gray-400);margin-top:4px">${this.escapeHtml(ev.author)} · ${this.formatDateTime(ev.createdAt)}</div>
                            </div>
                            ${canDelete ? `<button class="btn-icon" onclick="(async()=>{if(confirm('삭제하시겠습니까?')){try{await DataStore.deleteBoardEvent('${ev.id}');App.closeModal();App.renderBoard();App.toast('일정이 삭제되었습니다.','success');}catch(err){App.toast('삭제 실패: '+err.message,'error');}}})();" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>` : ''}
                        </div>`;
                    }).join('')}
            </div>
            ${canWrite ? `<div style="margin-top:16px;text-align:center">
                <button class="btn btn-primary btn-sm" onclick="App.closeModal();App.showBoardEventForm('${dateStr}')"><i class="fas fa-plus"></i> 이 날짜에 일정 추가</button>
            </div>` : ''}
        `;
        this.openModal(`${dateStr} 일정`, html);
    },

    // =========================================
    //  VIEW: MESSAGES (내부 소통)
    // =========================================
    renderMessages() {
        const isStudent = this.currentUser && this.currentUser.role === 'student';
        const isTeacher = this.currentUser && this.currentUser.role === 'teacher';
        const isDirector = this.currentUser && this.currentUser.role === 'director';
        const channel = this.msgChannel || 'internal';

        // 학생은 업무공유 채널 접근 불가
        if (isStudent && channel === 'team') {
            this.msgChannel = 'internal';
            return this.renderMessages();
        }

        const showTeamTab = isTeacher || isDirector;

        const channelTabsHtml = showTeamTab ? `
            <div class="msg-channel-tabs">
                <button class="msg-channel-tab ${channel === 'internal' ? 'active' : ''}" onclick="App.switchMsgChannel('internal')">
                    <i class="fas fa-envelope"></i> 내부 소통
                </button>
                <button class="msg-channel-tab ${channel === 'team' ? 'active' : ''}" onclick="App.switchMsgChannel('team')">
                    <i class="fas fa-users-cog"></i> 업무 공유
                    <span id="team-unread-badge" class="team-unread-badge" style="display:none"></span>
                </button>
            </div>
        ` : '';

        if (channel === 'team' && showTeamTab) {
            this.renderTeamMessages(channelTabsHtml);
            return;
        }

        const students = DataStore.getStudents();
        let messages = DataStore.getMessages().filter(m => m.channel !== 'team');
        // 선생님은 자신이 쓴 메시지 + 원장이 쓴 메시지만 볼 수 있음
        if (isTeacher) {
            messages = messages.filter(m => m.authorRole === 'director' || m.author === this.currentUser.name);
        }
        const pinned = messages.filter(m => m.pinned);
        const regular = messages.filter(m => !m.pinned);

        const html = `
            ${channelTabsHtml}
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-msg-role" onchange="App.filterMessages()">
                        <option value="">전체 작성자</option>
                        <option value="director">원장</option>
                        ${!isTeacher ? '<option value="teacher">선생님</option>' : ''}
                    </select>
                    <select class="filter-select" id="filter-msg-student" onchange="App.filterMessages()">
                        <option value="">전체 학생</option>
                        <option value="__none__">학생 무관 (전체 공지)</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <span style="color:var(--gray-500);font-size:0.85rem">${messages.length}건</span>
                </div>
                <button class="btn btn-primary" data-action="add-message"><i class="fas fa-pen"></i> 새 메시지 작성</button>
            </div>

            ${pinned.length > 0 ? `
            <div class="section-title" style="margin-top:4px"><i class="fas fa-thumbtack"></i> 고정 메시지</div>
            <div id="pinned-messages">${this.renderMessageCards(pinned)}</div>
            <div class="section-title" style="margin-top:24px"><i class="fas fa-inbox"></i> 전체 메시지</div>
            ` : ''}

            <div id="messages-container">
                ${this.renderMessageCards(regular.length > 0 ? regular : (pinned.length > 0 ? [] : messages))}
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
        this.updateTeamUnreadBadge();
    },

    switchMsgChannel(channel) {
        this.msgChannel = channel;
        this.renderMessages();
    },

    // 업무 공유 채널 렌더링
    renderTeamMessages(channelTabsHtml) {
        let messages = DataStore.getMessages().filter(m => m.channel === 'team');
        const pinned = messages.filter(m => m.pinned);
        const regular = messages.filter(m => !m.pinned);

        const html = `
            ${channelTabsHtml}
            <div class="toolbar">
                <div class="toolbar-filters">
                    <span style="color:var(--gray-500);font-size:0.85rem"><i class="fas fa-info-circle"></i> 선생님 간 업무 공유 공간입니다. 담당 학생·개인정보는 공개되지 않습니다.</span>
                    <span style="color:var(--gray-500);font-size:0.85rem">${messages.length}건</span>
                </div>
                <button class="btn btn-primary" data-action="add-team-message"><i class="fas fa-pen"></i> 업무 공유 글 작성</button>
            </div>

            ${pinned.length > 0 ? `
            <div class="section-title" style="margin-top:4px"><i class="fas fa-thumbtack"></i> 고정 메시지</div>
            <div id="pinned-messages">${this.renderTeamMessageCards(pinned)}</div>
            <div class="section-title" style="margin-top:24px"><i class="fas fa-inbox"></i> 전체 메시지</div>
            ` : ''}

            <div id="messages-container">
                ${this.renderTeamMessageCards(regular.length > 0 ? regular : (pinned.length > 0 ? [] : messages))}
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
        this.updateTeamUnreadBadge();
    },

    // 업무 공유 카드 렌더링 (이름 O, 담당학생/개인정보 X)
    renderTeamMessageCards(messages) {
        if (messages.length === 0) return '<div class="empty-state"><i class="fas fa-users-cog"></i><h3>업무 공유 메시지가 없습니다</h3><p>선생님들과 업무를 공유해보세요.</p></div>';
        const isDirector = this.currentUser && this.currentUser.role === 'director';

        return messages.map(msg => {
            const readBy = msg.readBy || {};
            const roleBadge = msg.authorRole === 'director'
                ? '<span class="badge badge-danger">원장</span>'
                : '<span class="badge badge-primary">선생님</span>';

            // 확인 대상: 원장 + 승인된 선생님 전원
            let readers = DataStore.getTeachers().filter(t => (t.role === 'teacher' || t.role === 'director') && t.approved !== false && t.name !== msg.author).map(t => t.name);
            // 선생님은 본인의 확인 상태만 표시
            if (!isDirector) {
                readers = readers.filter(r => r === this.currentUser.name);
            }

            const canDelete = isDirector || msg.author === (this.currentUser && this.currentUser.name);
            const canPin = isDirector;

            return `<div class="msg-card team-msg-card ${msg.pinned ? 'msg-pinned' : ''}">
                <div class="msg-card-header">
                    <div class="msg-card-title-row">
                        ${msg.pinned ? '<i class="fas fa-thumbtack" style="color:var(--warning);margin-right:6px;font-size:0.8rem"></i>' : ''}
                        <span class="msg-author">${this.escapeHtml(msg.author)}</span>
                        ${roleBadge}
                        <span class="badge badge-info" style="font-size:0.7rem"><i class="fas fa-users-cog"></i> 업무공유</span>
                        <span class="msg-date">${this.formatDateTime(msg.createdAt)}</span>
                    </div>
                    <div class="msg-card-actions">
                        ${canPin ? `<button class="btn-icon" data-action="pin-message" data-message-id="${msg.id}" title="${msg.pinned ? '고정 해제' : '고정'}">
                            <i class="fas fa-thumbtack" style="${msg.pinned ? 'color:var(--warning)' : ''}"></i>
                        </button>` : ''}
                        ${canDelete ? `<button class="btn-icon" data-action="delete-message" data-message-id="${msg.id}" title="삭제" style="color:var(--danger)">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </div>
                </div>
                <div class="msg-card-body" data-action="view-team-message-detail" data-message-id="${msg.id}" style="cursor:pointer">
                    <h3 class="msg-title">${this.escapeHtml(msg.title)}</h3>
                    <p class="msg-preview">${this.escapeHtml(msg.content).substring(0, 120)}${msg.content.length > 120 ? '...' : ''}</p>
                </div>
                ${readers.length > 0 ? `<div class="msg-card-footer">
                    <div class="msg-read-section">
                        <span class="msg-read-label"><i class="fas fa-check-double"></i> 확인:</span>
                        ${readers.map(reader => {
                            const isRead = !!readBy[reader];
                            const readTime = isRead ? this.formatDateTime(readBy[reader]) : '';
                            return `<label class="msg-read-check ${isRead ? 'checked' : ''}" title="${isRead ? readTime + ' 확인' : '미확인'}">
                                <input type="checkbox" ${isRead ? 'checked' : ''}
                                    data-action="toggle-read" data-message-id="${msg.id}" data-reader="${this.escapeHtml(reader)}"
                                    onchange="App.handleContentClick(event)">
                                <span class="msg-reader-name">${this.escapeHtml(reader)}</span>
                                ${isRead ? '<i class="fas fa-check-circle msg-read-icon"></i>' : '<i class="far fa-circle msg-unread-icon"></i>'}
                                ${isRead ? `<span class="msg-read-time">${readTime}</span>` : ''}
                            </label>`;
                        }).join('')}
                    </div>
                </div>` : ''}
            </div>`;
        }).join('');
    },

    // 업무 공유 상세 보기
    showTeamMessageDetail(messageId) {
        const msg = DataStore.getMessage(messageId);
        if (!msg) return;
        const readBy = msg.readBy || {};
        const isDirector = this.currentUser && this.currentUser.role === 'director';

        let readers = DataStore.getTeachers().filter(t => (t.role === 'teacher' || t.role === 'director') && t.approved !== false && t.name !== msg.author).map(t => t.name);
        if (!isDirector) {
            readers = readers.filter(r => r === this.currentUser.name);
        }

        const html = `
            <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <span class="msg-author" style="font-size:1rem">${this.escapeHtml(msg.author)}</span>
                    ${msg.authorRole === 'director' ? '<span class="badge badge-danger">원장</span>' : '<span class="badge badge-primary">선생님</span>'}
                    <span class="badge badge-info"><i class="fas fa-users-cog"></i> 업무공유</span>
                </div>
                <div style="font-size:0.82rem;color:var(--gray-400);margin-bottom:16px">${this.formatDateTime(msg.createdAt)}</div>
                <div style="background:var(--gray-50);padding:16px;border-radius:8px;font-size:0.93rem;line-height:1.8;color:var(--gray-700);white-space:pre-line">${this.escapeHtml(msg.content)}</div>
            </div>
            ${readers.length > 0 ? `<div style="border-top:1px solid var(--gray-200);padding-top:16px">
                <h3 style="font-size:0.9rem;font-weight:600;color:var(--gray-700);margin-bottom:12px"><i class="fas fa-check-double" style="color:var(--primary)"></i> 확인 현황</h3>
                <div class="msg-detail-readers">
                    ${readers.map(reader => {
                        const isRead = !!readBy[reader];
                        return `<div class="msg-detail-reader ${isRead ? 'read' : 'unread'}">
                            <label class="msg-read-check-detail">
                                <input type="checkbox" ${isRead ? 'checked' : ''}
                                    data-action="toggle-read" data-message-id="${msg.id}" data-reader="${this.escapeHtml(reader)}"
                                    onchange="App.handleReadToggleInModal(this)">
                                <span>${this.escapeHtml(reader)}</span>
                            </label>
                            <span class="msg-detail-status">
                                ${isRead
                                    ? `<i class="fas fa-check-circle" style="color:var(--success)"></i> ${this.formatDateTime(readBy[reader])} 확인`
                                    : '<i class="far fa-circle" style="color:var(--gray-400)"></i> 미확인'}
                            </span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
        `;

        this.openModal(msg.title, html);
    },

    // 업무 공유 글 작성 폼
    showTeamMessageForm() {
        const user = this.currentUser;
        const authorName = user ? user.name : '';
        const authorRole = user ? user.role : 'teacher';

        const html = `
            <form id="team-message-form">
                <div class="form-group">
                    <label>작성자</label>
                    <input type="text" class="form-control" name="author" required value="${this.escapeHtml(authorName)}" readonly style="background:var(--gray-50)">
                </div>
                <div class="form-group">
                    <label>제목 <span class="required">*</span></label>
                    <input type="text" class="form-control" name="title" required placeholder="업무 공유 제목">
                </div>
                <div class="form-group">
                    <label>내용 <span class="required">*</span></label>
                    <textarea class="form-control" name="content" rows="6" required placeholder="선생님들과 공유할 업무 내용을 작성하세요.\n(담당 학생 정보는 노출되지 않으니 안심하세요)"></textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> 공유하기</button>
                </div>
            </form>
        `;

        this.openModal('업무 공유 글 작성', html);

        document.getElementById('team-message-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
                await DataStore.addMessage({
                    author: form.author.value.trim(),
                    authorRole: authorRole,
                    studentId: null,
                    title: form.title.value.trim(),
                    content: form.content.value.trim(),
                    pinned: false,
                    channel: 'team'
                });
                this.toast('업무 공유 글이 등록되었습니다.', 'success');
                this.closeModal();
                this.renderMessages();
                this.updateUnreadBadge();
            } catch(err) { this.toast('전송 실패: ' + err.message, 'error'); }
        });
    },

    // 업무 공유 채널 안읽은 메시지 배지 업데이트
    updateTeamUnreadBadge() {
        const badge = document.getElementById('team-unread-badge');
        if (!badge || !this.currentUser) return;
        const teamMsgs = DataStore.getMessages().filter(m => m.channel === 'team');
        const userName = this.currentUser.name;
        const unread = teamMsgs.filter(m => m.author !== userName && !(m.readBy && m.readBy[userName])).length;
        if (unread > 0) {
            badge.textContent = unread;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    },

    renderMessageCards(messages) {
        if (messages.length === 0) return '<div class="empty-state"><i class="fas fa-envelope-open"></i><h3>메시지가 없습니다</h3></div>';

        return messages.map(msg => {
            const student = msg.studentId ? DataStore.getStudent(msg.studentId) : null;
            const readBy = msg.readBy || {};
            const readEntries = Object.entries(readBy);
            const roleBadge = msg.authorRole === 'director'
                ? '<span class="badge badge-danger">원장</span>'
                : '<span class="badge badge-primary">선생님</span>';

            let readers = msg.authorRole === 'director'
                ? DataStore.getTeachers().filter(t => t.role === 'teacher' && t.approved).map(t => t.name)
                : DataStore.getTeachers().filter(t => t.role === 'director').map(t => t.name);
            if (readers.length === 0) readers.push(msg.authorRole === 'director' ? '선생님' : '원장');
            // 선생님은 다른 선생님의 확인 현황을 볼 수 없음 (본인만 표시)
            if (App.currentUser && App.currentUser.role === 'teacher') {
                readers = readers.filter(r => r === App.currentUser.name);
            }

            return `<div class="msg-card ${msg.pinned ? 'msg-pinned' : ''}">
                <div class="msg-card-header">
                    <div class="msg-card-title-row">
                        ${msg.pinned ? '<i class="fas fa-thumbtack" style="color:var(--warning);margin-right:6px;font-size:0.8rem"></i>' : ''}
                        <span class="msg-author">${this.escapeHtml(msg.author)}</span>
                        ${roleBadge}
                        ${student ? `<span class="msg-student-ref"><i class="fas fa-user"></i> ${this.escapeHtml(student.name)}</span>` : '<span class="msg-student-ref"><i class="fas fa-bullhorn"></i> 전체</span>'}
                        <span class="msg-date">${this.formatDateTime(msg.createdAt)}</span>
                    </div>
                    <div class="msg-card-actions">
                        <button class="btn-icon" data-action="pin-message" data-message-id="${msg.id}" title="${msg.pinned ? '고정 해제' : '고정'}">
                            <i class="fas fa-thumbtack" style="${msg.pinned ? 'color:var(--warning)' : ''}"></i>
                        </button>
                        <button class="btn-icon" data-action="delete-message" data-message-id="${msg.id}" title="삭제" style="color:var(--danger)">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="msg-card-body" data-action="view-message-detail" data-message-id="${msg.id}" style="cursor:pointer">
                    <h3 class="msg-title">${this.escapeHtml(msg.title)}</h3>
                    <p class="msg-preview">${this.escapeHtml(msg.content).substring(0, 120)}${msg.content.length > 120 ? '...' : ''}</p>
                </div>
                <div class="msg-card-footer">
                    <div class="msg-read-section">
                        <span class="msg-read-label"><i class="fas fa-check-double"></i> 확인:</span>
                        ${readers.map(reader => {
                            const isRead = !!readBy[reader];
                            const readTime = isRead ? this.formatDateTime(readBy[reader]) : '';
                            return `<label class="msg-read-check ${isRead ? 'checked' : ''}" title="${isRead ? readTime + ' 확인' : '미확인'}">
                                <input type="checkbox" ${isRead ? 'checked' : ''}
                                    data-action="toggle-read" data-message-id="${msg.id}" data-reader="${this.escapeHtml(reader)}"
                                    onchange="App.handleContentClick(event)">
                                <span class="msg-reader-name">${this.escapeHtml(reader)}</span>
                                ${isRead ? '<i class="fas fa-check-circle msg-read-icon"></i>' : '<i class="far fa-circle msg-unread-icon"></i>'}
                                ${isRead ? `<span class="msg-read-time">${readTime}</span>` : ''}
                            </label>`;
                        }).join('')}
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    filterMessages() {
        const role = document.getElementById('filter-msg-role').value;
        const studentVal = document.getElementById('filter-msg-student').value;

        let messages = DataStore.getMessages().filter(m => m.channel !== 'team');
        // 선생님은 자신이 쓴 메시지 + 원장이 쓴 메시지만 볼 수 있음
        if (this.currentUser && this.currentUser.role === 'teacher') {
            messages = messages.filter(m => m.authorRole === 'director' || m.author === this.currentUser.name);
        }
        if (role) messages = messages.filter(m => m.authorRole === role);
        if (studentVal === '__none__') messages = messages.filter(m => !m.studentId);
        else if (studentVal) messages = messages.filter(m => m.studentId === studentVal);

        const pinned = messages.filter(m => m.pinned);
        const regular = messages.filter(m => !m.pinned);

        const pinnedEl = document.getElementById('pinned-messages');
        const containerEl = document.getElementById('messages-container');
        if (pinnedEl) pinnedEl.innerHTML = this.renderMessageCards(pinned);
        if (containerEl) containerEl.innerHTML = this.renderMessageCards(regular.length > 0 ? regular : (pinned.length > 0 ? [] : messages));
    },

    showMessageDetail(messageId) {
        const msg = DataStore.getMessage(messageId);
        if (!msg) return;
        const student = msg.studentId ? DataStore.getStudent(msg.studentId) : null;
        const readBy = msg.readBy || {};

        let readers = msg.authorRole === 'director'
            ? DataStore.getTeachers().filter(t => t.role === 'teacher' && t.approved).map(t => t.name)
            : DataStore.getTeachers().filter(t => t.role === 'director').map(t => t.name);
        if (readers.length === 0) readers.push(msg.authorRole === 'director' ? '선생님' : '원장');
        // 선생님은 다른 선생님의 확인 현황을 볼 수 없음 (본인만 표시)
        if (this.currentUser && this.currentUser.role === 'teacher') {
            readers = readers.filter(r => r === this.currentUser.name);
        }

        const html = `
            <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                    <span class="msg-author" style="font-size:1rem">${this.escapeHtml(msg.author)}</span>
                    ${msg.authorRole === 'director' ? '<span class="badge badge-danger">원장</span>' : '<span class="badge badge-primary">선생님</span>'}
                    ${student ? `<span class="badge badge-info">${this.escapeHtml(student.name)}</span>` : '<span class="badge badge-gray">전체</span>'}
                </div>
                <div style="font-size:0.82rem;color:var(--gray-400);margin-bottom:16px">${this.formatDateTime(msg.createdAt)}</div>
                <div style="background:var(--gray-50);padding:16px;border-radius:8px;font-size:0.93rem;line-height:1.8;color:var(--gray-700);white-space:pre-line">${this.escapeHtml(msg.content)}</div>
            </div>
            <div style="border-top:1px solid var(--gray-200);padding-top:16px">
                <h3 style="font-size:0.9rem;font-weight:600;color:var(--gray-700);margin-bottom:12px"><i class="fas fa-check-double" style="color:var(--primary)"></i> 확인 현황</h3>
                <div class="msg-detail-readers">
                    ${readers.map(reader => {
                        const isRead = !!readBy[reader];
                        return `<div class="msg-detail-reader ${isRead ? 'read' : 'unread'}">
                            <label class="msg-read-check-detail">
                                <input type="checkbox" ${isRead ? 'checked' : ''}
                                    data-action="toggle-read" data-message-id="${msg.id}" data-reader="${this.escapeHtml(reader)}"
                                    onchange="App.handleReadToggleInModal(this)">
                                <span>${this.escapeHtml(reader)}</span>
                            </label>
                            <span class="msg-detail-status">
                                ${isRead
                                    ? `<i class="fas fa-check-circle" style="color:var(--success)"></i> ${this.formatDateTime(readBy[reader])} 확인`
                                    : '<i class="far fa-circle" style="color:var(--gray-400)"></i> 미확인'}
                            </span>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;

        this.openModal(msg.title, html);
    },

    async handleReadToggleInModal(checkbox) {
        const messageId = checkbox.dataset.messageId;
        const reader = checkbox.dataset.reader;
        try { await DataStore.toggleReadBy(messageId, reader); } catch(err) { this.toast('서버 저장 실패: ' + err.message, 'error'); }
        this.updateUnreadBadge();
        const msg = DataStore.getMessage(messageId);
        if (msg && msg.channel === 'team') {
            this.showTeamMessageDetail(messageId);
        } else {
            this.showMessageDetail(messageId);
        }
        if (this.currentView === 'messages') this.renderMessages();
    },

    showMessageForm() {
        const students = this.getVisibleStudents();
        const user = this.currentUser;
        const authorName = user ? user.name : '';
        const authorRole = user ? user.role : 'teacher';

        const html = `
            <form id="message-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>작성자</label>
                        <input type="text" class="form-control" name="author" required value="${this.escapeHtml(authorName)}" readonly style="background:var(--gray-50)">
                    </div>
                    <div class="form-group">
                        <label>역할</label>
                        <select class="form-control" name="authorRole" required ${authorRole === 'teacher' ? 'disabled' : ''}>
                            <option value="director" ${authorRole === 'director' ? 'selected' : ''}>원장</option>
                            <option value="teacher" ${authorRole === 'teacher' ? 'selected' : ''}>선생님</option>
                        </select>
                        ${authorRole === 'teacher' ? '<input type="hidden" name="authorRole" value="teacher">' : ''}
                    </div>
                </div>
                <div class="form-group">
                    <label>관련 학생</label>
                    <select class="form-control" name="studentId">
                        <option value="">전체 (특정 학생 없음)</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)} (${this.escapeHtml(s.grade)} ${this.escapeHtml(s.className)})</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>제목 <span class="required">*</span></label>
                    <input type="text" class="form-control" name="title" required placeholder="메시지 제목">
                </div>
                <div class="form-group">
                    <label>내용 <span class="required">*</span></label>
                    <textarea class="form-control" name="content" rows="5" required placeholder="소통 내용을 입력하세요"></textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="pinned" style="margin-right:6px"> 고정 메시지로 설정
                    </label>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> 전송</button>
                </div>
            </form>
        `;

        this.openModal('새 메시지 작성', html);

        document.getElementById('message-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
                await DataStore.addMessage({
                    author: form.author.value.trim(),
                    authorRole: form.authorRole.value,
                    studentId: form.studentId.value || null,
                    title: form.title.value.trim(),
                    content: form.content.value.trim(),
                    pinned: form.pinned.checked,
                    channel: 'internal'
                });
                this.toast('메시지가 전송되었습니다.', 'success');
                this.closeModal();
                this.renderMessages();
                this.updateUnreadBadge();
            } catch(err) { this.toast('메시지 전송 실패: ' + err.message, 'error'); }
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
