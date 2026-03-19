// app.js - Student Progress Status 메인 애플리케이션 로직

const App = {
    currentView: 'dashboard',
    currentStudentId: null,
    currentUser: null,

    async init() {
        let supabaseOk = false;
        try {
            await DataStore.initFromSupabase();
            supabaseOk = true;
        } catch (e) {
            console.error('Supabase 연결 실패:', e);
            alert('서버 연결에 실패했습니다. 인터넷 연결을 확인해주세요.');
        }
        if (supabaseOk) {
            await DataStore.initSampleData();
            await DataStore.initSampleMessages();
            await DataStore.initSampleTeachers();
            await DataStore.initSampleGrades();
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
        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const loginId = document.getElementById('login-id').value.trim();
            const password = document.getElementById('login-pw').value;
            const errorEl = document.getElementById('login-error');

            const user = DataStore.login(loginId, password);
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
        newRegForm.addEventListener('submit', (e) => {
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

            if (role === 'student') {
                // Register as student + teacher account (pending approval)
                const school = newRegForm.querySelector('#reg-school').value.trim() || '-';
                const grade = newRegForm.querySelector('#reg-grade').value;
                const className = newRegForm.querySelector('#reg-class').value.trim() || '-';
                const phone = newRegForm.querySelector('#reg-phone').value.trim() || '';
                const student = DataStore.addStudent({ name, school, grade, className, phone, status: '대기', enrollDate: new Date().toISOString().slice(0, 10) });
                DataStore.addTeacher({ name, loginId, password: pw, role: 'student', assignedStudentIds: [student.id], studentId: student.id, approved: false, regDate: new Date().toISOString().slice(0, 10) });
            } else {
                DataStore.addTeacher({ name, loginId, password: pw, role, assignedStudentIds: [], approved: false, regDate: new Date().toISOString().slice(0, 10) });
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
            const roleLabels = { director: '원장', teacher: '선생님', student: '학생' };
            const roleLabel = roleLabels[role] || '사용자';
            const badgeClass = role === 'director' ? 'badge-danger' : role === 'student' ? 'badge-success' : 'badge-primary';
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

        // Student role: hide management-heavy nav items
        const studentHiddenViews = ['plans', 'progress', 'comments', 'teachers'];
        document.querySelectorAll('.nav-item').forEach(item => {
            const view = item.dataset.view;
            if (role === 'student' && studentHiddenViews.includes(view)) {
                item.style.display = 'none';
            } else if (view !== 'teachers') {
                item.style.display = '';
            }
        });

        this.bindEvents();

        // Students go directly to their detail page
        if (role === 'student' && this.currentUser.studentId) {
            this.navigate('student-detail', { studentId: this.currentUser.studentId });
        } else {
            this.navigate('dashboard');
        }
        this.updateUnreadBadge();
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
        const messages = DataStore.getMessages();
        const userName = this.currentUser ? this.currentUser.name : '';
        const unread = messages.filter(m => {
            const rb = m.readBy || {};
            // For director, count messages not read by 원장
            // For teacher, count messages not read by their name
            return !rb[userName];
        }).length;
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

        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            const sb = document.getElementById('sidebar');
            sb.classList.toggle('show');
            document.getElementById('sidebar-overlay').classList.toggle('active', sb.classList.contains('show'));
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

        document.getElementById('global-search').addEventListener('input', (e) => {
            if (this.currentView === 'students') this.renderStudents(e.target.value);
        });

        document.getElementById('btn-sample-data').addEventListener('click', async () => {
            if (confirm('모든 데이터를 초기화하고 샘플 데이터를 새로 로드하시겠습니까?')) {
                await DataStore.clearAll();
                await DataStore.initSampleData();
                await DataStore.initSampleMessages();
                await DataStore.initSampleTeachers();
                await DataStore.initSampleGrades();
                // Re-login as current user
                if (this.currentUser) {
                    const refreshed = DataStore.refreshCurrentUser();
                    if (!refreshed) {
                        this.handleLogout();
                        return;
                    }
                    this.currentUser = refreshed;
                }
                this.navigate(this.currentView);
                this.toast('샘플 데이터가 로드되었습니다.', 'success');
            }
        });

        document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        document.getElementById('content-area').addEventListener('click', (e) => this.handleContentClick(e));
    },

    // === Navigation ===
    navigate(view, data = {}) {
        this.currentView = view;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });

        const titles = { dashboard: '대시보드', students: '학생 관리', 'student-detail': '학생 상세', plans: '학습 계획', progress: '진도 현황', comments: '코멘트', grades: '성적 관리', messages: '내부 소통', teachers: '선생님 관리' };
        document.getElementById('page-title').textContent = titles[view] || '';

        Charts.destroyAll();

        switch (view) {
            case 'dashboard': this.renderDashboard(); break;
            case 'students': this.renderStudents(); break;
            case 'student-detail': this.renderStudentDetail(data.studentId); break;
            case 'plans': this.renderPlans(); break;
            case 'progress': this.renderProgress(); break;
            case 'comments': this.renderComments(); break;
            case 'grades': this.renderGrades(); break;
            case 'messages': this.renderMessages(); break;
            case 'teachers': this.renderTeachers(); break;
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
        const allComments = DataStore.getComments().filter(c => visibleIds.includes(c.studentId));

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
            ? (this.currentUser.role === 'director' ? '전체' : `${this.currentUser.name} 담당`)
            : '전체';

        const html = `
            ${this.currentUser && this.currentUser.role === 'teacher' ? `<div class="teacher-context-banner"><i class="fas fa-chalkboard-teacher"></i> <strong>${this.escapeHtml(this.currentUser.name)}</strong> 담당 학생 현황 (${students.length}명)</div>` : ''}
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon blue"><i class="fas fa-user-graduate"></i></div>
                    <div class="stat-info"><h3>${stats.totalStudents}</h3><p>${userLabel} 학생</p></div>
                </div>
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
                                return `<div class="activity-item">
                                    <div class="activity-dot ${c.authorRole === 'teacher' ? 'blue' : c.authorRole === 'parent' ? 'green' : 'yellow'}"></div>
                                    <div class="activity-text">
                                        <strong>${this.escapeHtml(c.author)}</strong> ${this.getRoleBadge(c.authorRole)}
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
                    <button class="btn btn-sm btn-outline" data-action="go-students">전체 보기</button>
                </div>
                <div class="card-body no-padding">
                    <div class="table-wrapper">
                        <table>
                            <thead><tr><th>학생명</th><th>학교/학년</th><th>반</th><th>진행 계획</th><th>평균 진행률</th><th></th></tr></thead>
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
                                        <td><button class="btn btn-sm btn-ghost" data-action="view-student" data-id="${s.id}"><i class="fas fa-arrow-right"></i></button></td>
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
        const visibleStudents = this.getVisibleStudents();
        const visibleIds = visibleStudents.map(s => s.id);
        const allStudents = visibleStudents;
        const grades = [...new Set(visibleStudents.map(s => s.grade))].sort();
        let students = searchQuery
            ? visibleStudents.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.school.toLowerCase().includes(searchQuery.toLowerCase()))
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
                <button class="btn btn-primary" data-action="add-student"><i class="fas fa-plus"></i> 학생 등록</button>
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
            students = students.filter(s => s.name.toLowerCase().includes(q) || s.school.toLowerCase().includes(q));
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
        const comments = DataStore.getStudentComments(studentId);
        const studentGrades = DataStore.getStudentGrades(studentId);
        const assignedTeachers = DataStore.getStudentTeachers(studentId);

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
                        ${assignedTeachers.length > 0 ? `<span><i class="fas fa-chalkboard-teacher"></i> ${assignedTeachers.map(t => this.escapeHtml(t.name)).join(', ')}</span>` : ''}
                    </div>
                </div>
                <div class="student-header-actions">
                    <button class="btn btn-outline btn-sm" data-action="edit-student" data-id="${studentId}"><i class="fas fa-edit"></i> 수정</button>
                    ${this.currentUser && this.currentUser.role === 'director' ? `<button class="btn btn-outline btn-sm" data-action="assign-teachers" data-student-id="${studentId}"><i class="fas fa-chalkboard-teacher"></i> 담당 지정</button>` : ''}
                    <button class="btn btn-primary btn-sm" data-action="add-plan" data-student-id="${studentId}"><i class="fas fa-plus"></i> 학습 계획 추가</button>
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
                    <button class="btn btn-sm btn-primary" data-action="add-plan" data-student-id="${studentId}"><i class="fas fa-plus"></i> 추가</button>
                </div>
                <div class="card-body">
                    ${plans.length === 0 ? '<div class="empty-state"><i class="fas fa-book"></i><h3>등록된 학습 계획이 없습니다</h3><p>학습 계획을 추가해주세요.</p></div>' :
                        plans.map(plan => {
                            const pct = plan.totalUnits > 0 ? Math.round((plan.completedUnits / plan.totalUnits) * 100) : 0;
                            return `<div class="plan-card">
                                <div class="plan-card-header">
                                    <div class="plan-card-title">
                                        <h3>${this.escapeHtml(plan.subject)}</h3>
                                        ${this.getStatusBadge(plan.status)}
                                        ${this.getDifficultyBadge(plan.difficulty)}
                                    </div>
                                    <div class="plan-card-actions">
                                        <button class="btn btn-sm btn-success" data-action="add-progress" data-plan-id="${plan.id}" data-student-id="${studentId}"><i class="fas fa-plus"></i> 진도 입력</button>
                                        <button class="btn btn-sm btn-outline" data-action="edit-plan" data-plan-id="${plan.id}" data-student-id="${studentId}"><i class="fas fa-edit"></i></button>
                                        <button class="btn btn-sm btn-ghost" data-action="delete-plan" data-plan-id="${plan.id}" data-student-id="${studentId}" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                                    </div>
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
                                ${this.renderPlanTimeline(plan)}
                            </div>`;
                        }).join('')}
                </div>
            </div>

            <div class="card" style="margin-bottom:20px">
                <div class="card-header">
                    <h2><i class="fas fa-trophy"></i> 성적 (${studentGrades.length}건)</h2>
                    <button class="btn btn-sm btn-primary" data-action="add-grade" data-student-id="${studentId}"><i class="fas fa-plus"></i> 성적 입력</button>
                </div>
                <div class="card-body ${studentGrades.length > 0 ? 'no-padding' : ''}">
                    ${studentGrades.length === 0 ? '<div class="empty-state"><i class="fas fa-trophy"></i><h3>등록된 성적이 없습니다</h3><p>시험 성적을 입력해주세요.</p></div>' :
                        `<div class="table-wrapper"><table class="pivot-table">
                            <thead><tr><th>시험</th>${(() => {
                                const allSubs = new Set();
                                studentGrades.forEach(g => (g.subjects || []).forEach(s => allSubs.add(s.subject)));
                                return [...allSubs].sort().map(s => `<th>${this.escapeHtml(s)}</th>`).join('');
                            })()}<th>평균</th><th>석차</th><th></th></tr></thead>
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
                                        return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span> <span class="grade-badge grade-${(d.grade || '')[0]}">${this.escapeHtml(d.grade || '')}</span></td>`;
                                    }).join('')}
                                    <td><strong>${g.totalAvg || '-'}</strong></td>
                                    <td style="font-size:0.82rem;color:var(--gray-500)">${this.escapeHtml(g.totalRank || '-')}</td>
                                    <td>
                                        <button class="btn-icon" data-action="edit-grade" data-grade-id="${g.id}" title="수정"><i class="fas fa-edit"></i></button>
                                        <button class="btn-icon" data-action="delete-grade" data-grade-id="${g.id}" title="삭제" style="color:var(--danger)"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>`;
                            }).join('')}</tbody>
                        </table></div>`}
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2><i class="fas fa-comments"></i> 코멘트 (${comments.length}개)</h2>
                    <button class="btn btn-sm btn-primary" data-action="add-comment" data-student-id="${studentId}"><i class="fas fa-plus"></i> 코멘트 작성</button>
                </div>
                <div class="card-body" style="padding:0">
                    ${comments.length === 0 ? '<div class="empty-state" style="padding:40px"><i class="fas fa-comment-slash"></i><h3>코멘트가 없습니다</h3></div>' :
                        comments.map(c => {
                            const plan = c.planId ? DataStore.getPlan(c.planId) : null;
                            const recipientTags = (c.recipients && c.recipients.length > 0)
                                ? `<div class="comment-recipients"><i class="fas fa-share"></i> ${c.recipients.map(r => r === 'student' ? '<span class="badge badge-warning">학생</span>' : r === 'parent' ? '<span class="badge badge-success">학부모</span>' : '<span class="badge badge-danger">원장</span>').join(' ')}</div>`
                                : '';
                            return `<div class="comment-item">
                                <div class="comment-avatar ${c.authorRole}">${this.escapeHtml(c.author.charAt(0))}</div>
                                <div class="comment-content">
                                    <div class="comment-header">
                                        <span class="comment-author">${this.escapeHtml(c.author)}</span>
                                        ${this.getRoleBadge(c.authorRole)}
                                        <span class="comment-date">${this.formatDateTime(c.createdAt)}</span>
                                        <button class="btn-icon" data-action="delete-comment" data-comment-id="${c.id}" data-student-id="${studentId}" style="margin-left:auto;font-size:0.75rem;color:var(--gray-400)"><i class="fas fa-trash"></i></button>
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
            return `<div class="plan-card">
                <div class="plan-card-header">
                    <div class="plan-card-title">
                        <h3>${this.escapeHtml(plan.subject)}</h3>
                        ${this.getStatusBadge(plan.status)}
                        ${this.getDifficultyBadge(plan.difficulty)}
                    </div>
                    <div class="plan-card-actions">
                        <button class="btn btn-sm btn-success" data-action="add-progress" data-plan-id="${plan.id}" data-student-id="${plan.studentId}"><i class="fas fa-plus"></i> 진도</button>
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
            .filter(p => visibleIds.includes(p.studentId))
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
        const comments = DataStore.getComments()
            .filter(c => visibleIds.includes(c.studentId))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const students = this.getVisibleStudents();

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-comment-student" onchange="App.filterComments()">
                        <option value="">전체 학생</option>
                        ${students.map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('')}
                    </select>
                    <select class="filter-select" id="filter-comment-role" onchange="App.filterComments()">
                        <option value="">전체 역할</option>
                        <option value="teacher">선생님</option>
                        <option value="parent">학부모</option>
                        <option value="student">학생</option>
                        <option value="admin">관리자</option>
                    </select>
                    <span style="color:var(--gray-500);font-size:0.85rem">${comments.length}개</span>
                </div>
            </div>

            <div class="card">
                <div class="card-body" style="padding:0" id="comments-container">
                    ${this.renderCommentList(comments)}
                </div>
            </div>
        `;

        document.getElementById('content-area').innerHTML = html;
    },

    renderCommentList(comments) {
        if (comments.length === 0) return '<div class="empty-state"><i class="fas fa-comment-slash"></i><h3>코멘트가 없습니다</h3></div>';
        return comments.map(c => {
            const student = DataStore.getStudent(c.studentId);
            const plan = c.planId ? DataStore.getPlan(c.planId) : null;
            const recipientTags = (c.recipients && c.recipients.length > 0)
                ? `<div class="comment-recipients"><i class="fas fa-share"></i> ${c.recipients.map(r => r === 'student' ? '<span class="badge badge-warning">학생</span>' : r === 'parent' ? '<span class="badge badge-success">학부모</span>' : '<span class="badge badge-danger">원장</span>').join(' ')}</div>`
                : '';
            return `<div class="comment-item">
                <div class="comment-avatar ${c.authorRole}">${this.escapeHtml(c.author.charAt(0))}</div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${this.escapeHtml(c.author)}</span>
                        ${this.getRoleBadge(c.authorRole)}
                        ${student ? `<span style="color:var(--gray-400)">→</span> <span class="student-name" data-action="view-student" data-id="${student.id}" style="font-size:0.85rem">${this.escapeHtml(student.name)}</span>` : ''}
                        <span class="comment-date">${this.formatDateTime(c.createdAt)}</span>
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
        const role = document.getElementById('filter-comment-role').value;
        const visibleIds = this.getVisibleStudentIds();
        let comments = DataStore.getComments()
            .filter(c => visibleIds.includes(c.studentId))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
                    rank: s.rank || '-',
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
                        : `<span class="grade-badge grade-${(r.grade || '')[0]}">${this.escapeHtml(r.grade || '-')}</span>`;
                    return `<tr>
                    <td><span class="student-name" data-action="view-student" data-id="${r.studentId}">${this.escapeHtml(r.studentName)}</span></td>
                    <td>${this.escapeHtml(examLabel)}</td>
                    <td><strong>${this.escapeHtml(r.subject)}</strong></td>
                    <td><span class="grade-score ${r.score >= 90 ? 'high' : r.score >= 70 ? 'mid' : 'low'}">${r.score}</span></td>
                    <td>${gradeDisplay}</td>
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
                                    return `<td><span class="grade-score ${d.score >= 90 ? 'high' : d.score >= 70 ? 'mid' : 'low'}">${d.score}</span> <span class="grade-badge grade-${(d.grade || '')[0]}">${this.escapeHtml(d.grade || '')}</span></td>`;
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
            { subject: '수학', score: '', grade: '', rank: '', standardScore: '', percentile: '' },
            { subject: '영어', score: '', grade: '', rank: '', standardScore: '', percentile: '' },
            { subject: '국어', score: '', grade: '', rank: '', standardScore: '', percentile: '' }
        ];

        const internalGradeOptions = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'];
        const mockGradeOptions = ['1','2','3','4','5','6','7','8','9'];

        const buildMatrixRow = (s, i, mock) => {
            const gradeOpts = mock ? mockGradeOptions : internalGradeOptions;
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
                    ${gradeOpts.map(g => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
                </select>
                <input type="text" class="form-control" name="sub_rank_${i}" value="${this.escapeHtml(s.rank || '')}" placeholder="석차">
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
                    <button type="button" class="btn btn-sm btn-outline" id="btn-add-subject-row"><i class="fas fa-plus"></i> 과목 추가</button>
                </div>
                <div class="grade-matrix" id="grade-matrix">
                    <div class="grade-matrix-labels ${isMock ? 'mock' : ''}" id="grade-matrix-labels">
                        ${isMock
                            ? '<span>과목</span><span>원점수</span><span>등급</span><span>표준점수</span><span>백분위</span><span></span>'
                            : '<span>과목</span><span>원점수</span><span>등급</span><span>석차</span><span></span>'}
                    </div>
                    ${existingSubjects.map((s, i) => buildMatrixRow(s, i, isMock)).join('')}
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
        const rebuildMatrix = () => {
            const mock = examTypeSelect.value === '모의고사';
            document.getElementById('grade-semester-group').style.display = mock ? 'none' : '';
            document.getElementById('grade-examname-group').style.display = mock ? '' : 'none';
            document.getElementById('grade-rank-group').style.display = mock ? 'none' : '';

            // Rebuild matrix labels
            const labels = document.getElementById('grade-matrix-labels');
            labels.className = 'grade-matrix-labels' + (mock ? ' mock' : '');
            labels.innerHTML = mock
                ? '<span>과목</span><span>원점수</span><span>등급</span><span>표준점수</span><span>백분위</span><span></span>'
                : '<span>과목</span><span>원점수</span><span>등급</span><span>석차</span><span></span>';

            // Rebuild existing rows preserving values
            const matrix = document.getElementById('grade-matrix');
            const rows = matrix.querySelectorAll('.grade-matrix-row');
            rows.forEach(row => {
                const idx = row.dataset.idx;
                const form = document.getElementById('grade-form');
                const name = form[`sub_name_${idx}`]?.value || '';
                const score = form[`sub_score_${idx}`]?.value || '';
                const grade = form[`sub_grade_${idx}`]?.value || '';
                const rank = form[`sub_rank_${idx}`]?.value || '';
                const std = form[`sub_std_${idx}`]?.value || '';
                const pct = form[`sub_pct_${idx}`]?.value || '';
                const s = { subject: name, score, grade, rank, standardScore: std, percentile: pct };
                const newRow = document.createElement('div');
                newRow.innerHTML = self.buildGradeMatrixRowHtml(s, idx, mock);
                row.replaceWith(newRow.firstElementChild);
            });
        };
        examTypeSelect.addEventListener('change', rebuildMatrix);

        // Add subject row
        document.getElementById('btn-add-subject-row').addEventListener('click', () => {
            const matrix = document.getElementById('grade-matrix');
            const mock = examTypeSelect.value === '모의고사';
            const s = { subject: '', score: '', grade: '', rank: '', standardScore: '', percentile: '' };
            const div = document.createElement('div');
            div.innerHTML = self.buildGradeMatrixRowHtml(s, rowIdx, mock);
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
                        sub.rank = form[`sub_rank_${idx}`]?.value?.trim() || '';
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

    buildGradeMatrixRowHtml(s, idx, mock) {
        const internalGradeOptions = ['A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'];
        const mockGradeOptions = ['1','2','3','4','5','6','7','8','9'];
        const gradeOpts = mock ? mockGradeOptions : internalGradeOptions;
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
                ${gradeOpts.map(g => `<option value="${g}" ${s.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
            </select>
            <input type="text" class="form-control" name="sub_rank_${idx}" value="${this.escapeHtml(s.rank || '')}" placeholder="석차">
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
                <div class="form-row-3">
                    <div class="form-group">
                        <label>주간 학습량 <span class="required">*</span></label>
                        <input type="number" class="form-control" name="totalUnits" required min="1" value="${isEdit ? plan.totalUnits : ''}" placeholder="이번 주 목표 분량">
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
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '추가'}</button>
                </div>
            </form>
        `;

        this.openModal(isEdit ? '학습 계획 수정' : '학습 계획 추가', html);

        document.getElementById('plan-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
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
                totalUnits: parseInt(form.totalUnits.value),
                unitLabel: form.unitLabel.value.trim() || '단위',
                completedUnits: parseInt(form.completedUnits.value) || 0
            };

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
        }
    },

    // =========================================
    //  VIEW: TEACHERS (선생님 관리 - 원장 전용)
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
                            <h2><i class="fas fa-user-tie"></i> ${this.escapeHtml(t.name)}
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

        document.getElementById('assignment-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            const selectedIds = [...form.querySelectorAll('input[name="teacherIds"]:checked')].map(cb => cb.value);

            // Update all teachers: add/remove this student
            teachers.forEach(t => {
                const hasStudent = (t.assignedStudentIds || []).includes(studentId);
                const shouldHave = selectedIds.includes(t.id);
                if (shouldHave && !hasStudent) {
                    DataStore.assignStudentToTeacher(t.id, studentId);
                } else if (!shouldHave && hasStudent) {
                    DataStore.unassignStudentFromTeacher(t.id, studentId);
                }
            });

            // Also update director's list
            const director = DataStore.getTeachers().find(t => t.role === 'director');
            if (director && !(director.assignedStudentIds || []).includes(studentId)) {
                DataStore.assignStudentToTeacher(director.id, studentId);
            }

            this.toast('담당 선생님이 변경되었습니다.', 'success');
            this.closeModal();
            if (this.currentView === 'teachers') this.renderTeachers();
            else if (this.currentView === 'student-detail') this.renderStudentDetail(this.currentStudentId);
        });
    },

    showTeacherForm(teacher = null) {
        const isEdit = !!teacher;
        const html = `
            <form id="teacher-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>이름 <span class="required">*</span></label>
                        <input type="text" class="form-control" name="name" required value="${isEdit ? this.escapeHtml(teacher.name) : ''}" placeholder="선생님 이름">
                    </div>
                    <div class="form-group">
                        <label>로그인 ID <span class="required">*</span></label>
                        <input type="text" class="form-control" name="loginId" required value="${isEdit ? this.escapeHtml(teacher.loginId) : ''}" placeholder="로그인 아이디" ${isEdit ? 'disabled' : ''}>
                    </div>
                </div>
                <div class="form-group">
                    <label>비밀번호 ${isEdit ? '' : '<span class="required">*</span>'}</label>
                    <input type="password" class="form-control" name="password" ${isEdit ? '' : 'required'} placeholder="${isEdit ? '변경시에만 입력' : '비밀번호'}">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-ghost" onclick="App.closeModal()">취소</button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${isEdit ? '수정' : '등록'}</button>
                </div>
                ${isEdit ? `<input type="hidden" name="teacherId" value="${teacher.id}">` : ''}
            </form>
        `;

        this.openModal(isEdit ? '선생님 정보 수정' : '새 선생님 등록', html);

        document.getElementById('teacher-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.name.value.trim();
            const loginId = isEdit ? teacher.loginId : form.loginId.value.trim();
            const password = form.password.value;

            if (!isEdit && DataStore.getTeacherByLoginId(loginId)) {
                this.toast('이미 존재하는 로그인 ID입니다.', 'error');
                return;
            }

            try {
                if (isEdit) {
                    const updates = { name };
                    if (password) updates.password = password;
                    await DataStore.updateTeacher(teacher.id, updates);
                    this.toast('선생님 정보가 수정되었습니다.', 'success');
                } else {
                    await DataStore.addTeacher({ name, loginId, password: password || '1234', role: 'teacher', assignedStudentIds: [] });
                    this.toast('새 선생님이 등록되었습니다.', 'success');
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
    //  VIEW: MESSAGES (내부 소통)
    // =========================================
    renderMessages() {
        const students = DataStore.getStudents();
        const messages = DataStore.getMessages();
        const pinned = messages.filter(m => m.pinned);
        const regular = messages.filter(m => !m.pinned);

        const html = `
            <div class="toolbar">
                <div class="toolbar-filters">
                    <select class="filter-select" id="filter-msg-role" onchange="App.filterMessages()">
                        <option value="">전체 작성자</option>
                        <option value="director">원장</option>
                        <option value="teacher">선생님</option>
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

            const readers = msg.authorRole === 'director'
                ? ['김선생', '박선생', '이선생']
                : ['원장'];

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

        let messages = DataStore.getMessages();
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

        const readers = msg.authorRole === 'director'
            ? ['김선생', '박선생', '이선생']
            : ['원장'];

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
        this.showMessageDetail(messageId);
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
                        <select class="form-control" name="authorRole" required>
                            <option value="director" ${authorRole === 'director' ? 'selected' : ''}>원장</option>
                            <option value="teacher" ${authorRole === 'teacher' ? 'selected' : ''}>선생님</option>
                        </select>
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
                    pinned: form.pinned.checked
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
