// permissions.js - 역할 기반 권한 관리 모듈
// 하이브리드 방식: 프론트엔드 필터링 + 서버 측 검증 가능 구조

const Permissions = {
    // 역할 상수
    ROLES: {
        DIRECTOR: 'director',   // 원장: 모든 권한
        TEACHER: 'teacher',     // 선생: 담당 학생 편집, 코멘트 작성
        STUDENT: 'student',     // 학생: 본인 진도 조회만
        PARENT: 'parent'        // 학부모: 자녀 진도/성적/코멘트(학부모 공개) 조회만
    },

    // 코멘트 가시성 수신자 상수
    RECIPIENTS: {
        STUDENT: 'student',     // 학생에게 공개
        PARENT: 'parent',       // 학부모에게 공개
        DIRECTOR: 'director'    // 원장에게 공개 (내부 소통)
    },

    // ==========================================
    //  현재 사용자 권한 체크
    // ==========================================

    /**
     * 현재 로그인한 사용자 정보 가져오기
     */
    getCurrentUser() {
        return DataStore.getCurrentUser();
    },

    /**
     * 현재 사용자의 역할 반환
     */
    getCurrentRole() {
        const user = this.getCurrentUser();
        return user ? user.role : null;
    },

    /**
     * 원장인지 확인
     */
    isDirector() {
        return this.getCurrentRole() === this.ROLES.DIRECTOR;
    },

    /**
     * 선생인지 확인
     */
    isTeacher() {
        return this.getCurrentRole() === this.ROLES.TEACHER;
    },

    /**
     * 학생인지 확인
     */
    isStudent() {
        return this.getCurrentRole() === this.ROLES.STUDENT;
    },

    /**
     * 학부모인지 확인
     */
    isParent() {
        return this.getCurrentRole() === this.ROLES.PARENT;
    },

    // ==========================================
    //  학생 접근 권한
    // ==========================================

    /**
     * 특정 학생 정보 조회 가능 여부
     */
    canViewStudent(studentId) {
        const user = this.getCurrentUser();
        if (!user) return false;

        // 원장: 모든 학생 조회 가능
        if (user.role === this.ROLES.DIRECTOR) return true;

        // 선생: 담당 학생만 조회 가능
        if (user.role === this.ROLES.TEACHER) {
            return (user.assignedStudentIds || []).includes(studentId);
        }

        // 학생: 본인만 조회 가능
        if (user.role === this.ROLES.STUDENT) {
            return user.studentId === studentId;
        }

        // 학부모: 자녀만 조회 가능
        if (user.role === this.ROLES.PARENT) {
            return user.studentId === studentId;
        }

        return false;
    },

    /**
     * 특정 학생 정보 편집 가능 여부
     */
    canEditStudent(studentId) {
        const user = this.getCurrentUser();
        if (!user) return false;

        // 원장: 모든 학생 편집 가능
        if (user.role === this.ROLES.DIRECTOR) return true;

        // 선생: 담당 학생만 편집 가능
        if (user.role === this.ROLES.TEACHER) {
            return (user.assignedStudentIds || []).includes(studentId);
        }

        // 학생: 편집 불가
        return false;
    },

    /**
     * 진도 입력 가능 여부 (학생은 본인 진도만 입력 가능)
     */
    canAddProgress(studentId) {
        const user = this.getCurrentUser();
        if (!user) return false;
        if (user.role === this.ROLES.DIRECTOR) return true;
        if (user.role === this.ROLES.TEACHER) {
            return (user.assignedStudentIds || []).includes(studentId);
        }
        // 학생: 본인 진도만 입력 가능
        if (user.role === this.ROLES.STUDENT) {
            return user.studentId === studentId;
        }
        return false;
    },

    // ==========================================
    //  학습 계획 권한
    // ==========================================

    /**
     * 학습 계획 조회 가능 여부
     */
    canViewPlan(plan) {
        if (!plan) return false;
        return this.canViewStudent(plan.studentId);
    },

    /**
     * 학습 계획 편집 가능 여부
     */
    canEditPlan(plan) {
        if (!plan) return false;
        return this.canEditStudent(plan.studentId);
    },

    /**
     * 학습 계획 추가 가능 여부
     */
    canAddPlan(studentId) {
        return this.canEditStudent(studentId);
    },

    // ==========================================
    //  진도 권한
    // ==========================================

    /**
     * 진도 편집 가능 여부
     */
    canEditProgress(studentId) {
        return this.canEditStudent(studentId);
    },

    // ==========================================
    //  코멘트 권한 (핵심 로직)
    // ==========================================

    /**
     * 특정 코멘트 조회 가능 여부
     * 
     * 규칙:
     * - 원장: 모든 코멘트 조회 가능
     * - 선생: 모든 코멘트 조회 가능 (담당 학생 관련)
     * - 학생: recipients에 'student'가 포함된 코멘트만 조회 가능
     */
    canViewComment(comment) {
        const user = this.getCurrentUser();
        if (!user) return false;

        // 먼저 학생 접근 권한 확인
        if (!this.canViewStudent(comment.studentId)) return false;

        // 원장/선생: 모든 코멘트 조회 가능
        if (user.role === this.ROLES.DIRECTOR || user.role === this.ROLES.TEACHER) {
            return true;
        }

        // 학생: recipients에 'student'가 포함된 경우만 조회 가능
        if (user.role === this.ROLES.STUDENT) {
            const recipients = comment.recipients || [];
            return recipients.includes(this.RECIPIENTS.STUDENT);
        }

        // 학부모: recipients에 'parent'가 포함된 경우만 조회 가능
        if (user.role === this.ROLES.PARENT) {
            const recipients = comment.recipients || [];
            return recipients.includes(this.RECIPIENTS.PARENT);
        }

        return false;
    },

    /**
     * 코멘트 작성 가능 여부
     */
    canAddComment(studentId) {
        const user = this.getCurrentUser();
        if (!user) return false;

        // 학생: 코멘트 작성 불가
        if (user.role === this.ROLES.STUDENT) return false;

        // 원장: 모든 학생에 작성 가능
        if (user.role === this.ROLES.DIRECTOR) return true;

        // 선생: 담당 학생에만 작성 가능
        if (user.role === this.ROLES.TEACHER) {
            return (user.assignedStudentIds || []).includes(studentId);
        }

        return false;
    },

    /**
     * 코멘트 삭제 가능 여부
     */
    canDeleteComment(comment) {
        const user = this.getCurrentUser();
        if (!user) return false;

        // 원장: 모든 코멘트 삭제 가능
        if (user.role === this.ROLES.DIRECTOR) return true;

        // 선생: 본인이 작성한 코멘트만 삭제 가능
        if (user.role === this.ROLES.TEACHER) {
            return comment.author === user.name;
        }

        // 학생: 삭제 불가
        return false;
    },

    // ==========================================
    //  성적 권한
    // ==========================================

    /**
     * 성적 조회 가능 여부
     */
    canViewGrade(grade) {
        if (!grade) return false;
        return this.canViewStudent(grade.studentId);
    },

    /**
     * 성적 편집 가능 여부
     */
    canEditGrade(grade) {
        if (!grade) return false;
        return this.canEditStudent(grade.studentId);
    },

    // ==========================================
    //  메시지 권한 (내부 소통)
    // ==========================================

    /**
     * 내부 메시지 조회 가능 여부
     * - 원장과 선생만 내부 소통 메시지 접근 가능
     */
    canViewMessages() {
        const role = this.getCurrentRole();
        return role === this.ROLES.DIRECTOR || role === this.ROLES.TEACHER;
    },

    /**
     * 메시지 작성 가능 여부
     */
    canAddMessage() {
        return this.canViewMessages();
    },

    // ==========================================
    //  관리 권한
    // ==========================================

    /**
     * 선생님 관리 가능 여부 (원장만)
     */
    canManageTeachers() {
        return this.isDirector();
    },

    /**
     * 회원 승인 가능 여부 (원장만)
     */
    canApproveUsers() {
        return this.isDirector();
    },

    /**
     * 담당 학생 지정 가능 여부 (원장만)
     */
    canAssignStudents() {
        return this.isDirector();
    },

    // ==========================================
    //  필터링 헬퍼 메서드
    // ==========================================

    /**
     * 조회 가능한 학생 목록 필터링
     */
    filterVisibleStudents(students) {
        return students.filter(s => this.canViewStudent(s.id));
    },

    /**
     * 조회 가능한 코멘트 목록 필터링
     */
    filterVisibleComments(comments) {
        return comments.filter(c => this.canViewComment(c));
    },

    /**
     * 조회 가능한 학습 계획 목록 필터링
     */
    filterVisiblePlans(plans) {
        return plans.filter(p => this.canViewPlan(p));
    },

    /**
     * 조회 가능한 성적 목록 필터링
     */
    filterVisibleGrades(grades) {
        return grades.filter(g => this.canViewGrade(g));
    },

    // ==========================================
    //  UI 표시 헬퍼
    // ==========================================

    /**
     * 역할 표시용 라벨 반환
     */
    getRoleLabel(role) {
        const labels = {
            [this.ROLES.DIRECTOR]: '원장',
            [this.ROLES.TEACHER]: '선생님',
            [this.ROLES.STUDENT]: '학생',
            [this.ROLES.PARENT]: '학부모'
        };
        return labels[role] || '사용자';
    },

    /**
     * 현재 사용자가 볼 수 있는 네비게이션 아이템 목록
     */
    getVisibleNavItems() {
        const role = this.getCurrentRole();
        
        // 기본 메뉴
        const items = ['dashboard'];
        
        if (role === this.ROLES.DIRECTOR) {
            items.push('students', 'plans', 'progress', 'comments', 'grades', 'messages', 'teachers');
        } else if (role === this.ROLES.TEACHER) {
            items.push('students', 'plans', 'progress', 'comments', 'grades', 'messages');
        } else if (role === this.ROLES.STUDENT) {
            // 학생은 대시보드(본인 진도)와 성적만 확인
            items.push('grades');
        }

        return items;
    },

    /**
     * 학생이 볼 수 없는 코멘트인지 표시용 태그 반환
     */
    getCommentVisibilityTag(comment) {
        const recipients = comment.recipients || [];
        if (!recipients.includes(this.RECIPIENTS.STUDENT)) {
            return '<span class="badge badge-gray" style="font-size:0.65rem"><i class="fas fa-lock"></i> 내부</span>';
        }
        return '';
    }
};

// Window에 노출
window.Permissions = Permissions;
