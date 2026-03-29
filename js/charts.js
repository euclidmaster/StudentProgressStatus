// charts.js - Chart.js 래퍼 및 시각화 유틸리티

const Charts = {
    instances: {},
    colors: ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'],

    destroy(id) {
        if (this.instances[id]) {
            this.instances[id].destroy();
            delete this.instances[id];
        }
    },

    destroyAll() {
        Object.keys(this.instances).forEach(id => this.destroy(id));
    },

    // 전체 현황 도넛 차트
    createOverviewDoughnut(canvasId, stats) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const remaining = Math.max(0, stats.totalPlans - stats.activePlans - stats.completedPlans);
        this.instances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['완료', '진행 중', '대기'],
                datasets: [{
                    data: [stats.completedPlans, stats.activePlans, remaining],
                    backgroundColor: ['#10B981', '#4F46E5', '#E5E7EB'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 16, usePointStyle: true, font: { family: "'Noto Sans KR', sans-serif", size: 12 } }
                    }
                }
            }
        });
    },

    // 학생 진도 분포 바 차트
    createProgressDistribution(canvasId, students) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const ranges = { '0-25%': 0, '26-50%': 0, '51-75%': 0, '76-100%': 0 };
        students.forEach(student => {
            const plans = DataStore.getStudentPlans(student.id).filter(p => p.status === 'active');
            if (plans.length === 0) return;
            const avg = plans.reduce((s, p) => s + (p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0), 0) / plans.length;
            if (avg <= 25) ranges['0-25%']++;
            else if (avg <= 50) ranges['26-50%']++;
            else if (avg <= 75) ranges['51-75%']++;
            else ranges['76-100%']++;
        });

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(ranges),
                datasets: [{
                    label: '학생 수',
                    data: Object.values(ranges),
                    backgroundColor: ['#EF4444', '#F59E0B', '#4F46E5', '#10B981'],
                    borderRadius: 8,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#F3F4F6' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: '학생 진도 분포', font: { family: "'Noto Sans KR', sans-serif", size: 14, weight: '600' }, color: '#1F2937' }
                }
            }
        });
    },

    // 과목별 진행률 바 차트
    createSubjectBar(canvasId, subjectData) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const subjects = Object.keys(subjectData);
        const values = subjects.map(s => {
            const plans = subjectData[s];
            return Math.round(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length);
        });

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: subjects,
                datasets: [{
                    label: '진행률 (%)',
                    data: values,
                    backgroundColor: subjects.map((_, i) => this.colors[i % this.colors.length]),
                    borderRadius: 8,
                    barThickness: 36
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#F3F4F6' } },
                    y: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    // 레이더 차트 (과목별 균형)
    createRadar(canvasId, subjectData) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const subjects = Object.keys(subjectData);
        if (subjects.length < 3) return this.createSubjectBar(canvasId, subjectData);

        const values = subjects.map(s => {
            const plans = subjectData[s];
            return Math.round(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length);
        });

        this.instances[canvasId] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: subjects,
                datasets: [{
                    label: '과목별 진행률',
                    data: values,
                    borderColor: '#4F46E5',
                    backgroundColor: 'rgba(79, 70, 229, 0.15)',
                    pointBackgroundColor: '#4F46E5',
                    pointBorderColor: '#fff',
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 20, display: false }, grid: { color: '#E5E7EB' } } },
                plugins: { legend: { display: false } }
            }
        });
    },

    // 진도 타임라인 라인 차트
    createTimeline(canvasId, progressEntries, plan) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        let cumulative = 0;
        const actualData = progressEntries.map(e => {
            cumulative += e.amount;
            return { x: e.date, y: cumulative };
        });

        const datasets = [{
            label: '실제 진행량',
            data: actualData,
            borderColor: '#4F46E5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: '#4F46E5'
        }];

        if (plan) {
            datasets.push({
                label: '목표선',
                data: [
                    { x: plan.startDate, y: 0 },
                    { x: plan.endDate, y: plan.totalUnits }
                ],
                borderColor: '#EF4444',
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false,
                tension: 0
            });
        }

        this.instances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'category', title: { display: true, text: '날짜' }, grid: { color: '#F3F4F6' } },
                    y: { beginAtZero: true, title: { display: true, text: plan ? plan.unitLabel : '진행량' }, grid: { color: '#F3F4F6' } }
                },
                plugins: {
                    legend: { position: 'bottom', labels: { usePointStyle: true, font: { family: "'Noto Sans KR', sans-serif" } } }
                }
            }
        });
    },

    // 학생 비교 수평 바 차트 (범용)
    createStudentCompareBar(canvasId, labels, datasets, xSuffix = '%', xMax = 100) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const xScale = {
            beginAtZero: true,
            ticks: { callback: v => v + xSuffix, font: { family: "'Noto Sans KR', sans-serif", size: 11 } },
            grid: { color: '#F3F4F6' }
        };
        if (xMax !== null) xScale.max = xMax;
        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: xScale,
                    y: { grid: { display: false }, ticks: { font: { family: "'Noto Sans KR', sans-serif", size: 11 } } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ` ${ctx.formattedValue}${xSuffix}` } }
                }
            }
        });
    },

    // 전체 학생 과목별 평균 진행률
    createAllStudentsSubject(canvasId) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        const subjectMap = {};
        const activePlans = DataStore.getActivePlans();
        activePlans.forEach(p => {
            if (!subjectMap[p.subject]) subjectMap[p.subject] = [];
            subjectMap[p.subject].push(p.totalUnits > 0 ? (p.completedUnits / p.totalUnits) * 100 : 0);
        });

        const subjects = Object.keys(subjectMap);
        const averages = subjects.map(s => Math.round(subjectMap[s].reduce((a, b) => a + b, 0) / subjectMap[s].length));

        this.instances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: subjects,
                datasets: [{
                    label: '평균 진행률 (%)',
                    data: averages,
                    backgroundColor: subjects.map((_, i) => this.colors[i % this.colors.length] + 'CC'),
                    borderColor: subjects.map((_, i) => this.colors[i % this.colors.length]),
                    borderWidth: 2,
                    borderRadius: 8,
                    barThickness: 40
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' }, grid: { color: '#F3F4F6' } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: '과목별 평균 진행률', font: { family: "'Noto Sans KR', sans-serif", size: 14, weight: '600' }, color: '#1F2937' }
                }
            }
        });
    }
};
