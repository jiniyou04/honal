// 사장/알바생 모드 전환과 하단 탭 이동
let currentRole = 'staff';

window.switchRole = function(role) {
    currentRole = role;
    localStorage.setItem('honal_role', role);
    const viewStaff = document.getElementById('view-staff');
    const viewBoss = document.getElementById('view-boss');
    const navStaff = document.getElementById('nav-staff');
    const navBoss = document.getElementById('nav-boss');
    const btnStaff = document.getElementById('btn-role-staff');
    const btnBoss = document.getElementById('btn-role-boss');

    if (role === 'staff') {
        viewStaff.classList.remove('hidden');
        viewBoss.classList.add('hidden');
        navStaff.classList.remove('hidden');
        navBoss.classList.add('hidden');
        btnStaff.className = "px-3 py-1.5 rounded-lg transition-all bg-white text-indigo-600 shadow-sm";
        btnBoss.className = "px-3 py-1.5 rounded-lg transition-all text-slate-500";
        switchTab('staff', 'question');
        loadManualsForStaff();
        loadNoticesForStaff();
    } else {
        viewStaff.classList.add('hidden');
        viewBoss.classList.remove('hidden');
        navStaff.classList.add('hidden');
        navBoss.classList.remove('hidden');
        btnBoss.className = "px-3 py-1.5 rounded-lg transition-all bg-white text-indigo-600 shadow-sm";
        btnStaff.className = "px-3 py-1.5 rounded-lg transition-all text-slate-500";
        switchTab('boss', 'dashboard');
        loadManualsForBoss();
        loadNoticesForBoss();
        loadBossDashboardData();
        if (typeof window.loadManualImprovementRecommendations === 'function') {
            window.loadManualImprovementRecommendations();
        }
    }
}

window.switchTab = function(role, tabName) {
    const tabs = role === 'staff' ? ['question', 'manual', 'notice'] : ['dashboard', 'manual', 'notice', 'staff'];

    tabs.forEach(t => {
        const viewEl = document.getElementById(`${role}-tab-${t}`);
        const navEl = document.getElementById(`nav-${role}-${t}`);
        if (viewEl) viewEl.classList.add('hidden');
        if (navEl) {
            navEl.className = "flex flex-col items-center justify-center text-slate-400 font-medium gap-1 relative";
        }
    });

    const activeView = document.getElementById(`${role}-tab-${tabName}`);
    const activeNav = document.getElementById(`nav-${role}-${tabName}`);
    if (activeView) activeView.classList.remove('hidden');
    if (activeNav) {
        activeNav.className = "flex flex-col items-center justify-center text-indigo-600 font-bold gap-1 relative";
    }
}
