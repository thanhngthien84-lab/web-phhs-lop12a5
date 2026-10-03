function teacherAllowedMenus() {
    const role = state.auth && state.auth.role;
    if (role === 'bancansu') return menuItems.filter(item => ['tong-quan','hoc-sinh','thoi-khoa-bieu','diem-danh'].includes(item.id));
    if (role === 'bgh') return menuItems.filter(item => ['tong-quan','hoc-sinh','thoi-khoa-bieu','so-do-lop','diem-danh','bao-cao','tram-dong-hanh'].includes(item.id));
    return menuItems;
}
window.teacherMobileNavigate = function(id) {
    closeTeacherMobileMenu(false);
    if (id === 'dong-ho') openTimerDrawer();
    else if (id === 'tich-diem') { switchTab('cai-dat'); switchSettingsTab('tich-diem'); }
    else switchTab(id);
};
let teacherMenuReturnFocus;
window.closeTeacherMobileMenu = function(restoreFocus = true) {
    const layer = document.getElementById('teacher-menu-layer');
    if (layer) layer.remove();
    document.querySelectorAll('[data-teacher-menu]').forEach(button => button.setAttribute('aria-expanded','false'));
    if (restoreFocus && teacherMenuReturnFocus && teacherMenuReturnFocus.isConnected) teacherMenuReturnFocus.focus();
};
window.openTeacherMobileMenu = function() {
    if (document.getElementById('teacher-menu-layer')) return;
    teacherMenuReturnFocus = document.activeElement;
    const layer = document.createElement('div');
    layer.id = 'teacher-menu-layer'; layer.className = 'teacher-menu-layer';
    layer.innerHTML = '<section class="teacher-menu-panel" role="dialog" aria-modal="true" aria-labelledby="teacher-menu-title"><div class="teacher-menu-heading"><h2 id="teacher-menu-title">Chức năng quản lý</h2><button type="button" aria-label="Đóng menu" onclick="closeTeacherMobileMenu()"><i class="ph-bold ph-x"></i></button></div><div class="teacher-menu-grid">' + teacherAllowedMenus().map(item => '<button type="button" '+(item.id===state.currentTab?'aria-current="page" ':'')+'onclick="teacherMobileNavigate(\''+item.id+'\')"><i class="ph-bold '+item.icon+'"></i><span>'+item.label+'</span></button>').join('') + '</div></section>';
    layer.addEventListener('click',event => { if (event.target === layer) closeTeacherMobileMenu(); });
    layer.addEventListener('keydown',event => {
        if (event.key === 'Escape') closeTeacherMobileMenu();
        if (event.key === 'Tab') {
            const buttons = [...layer.querySelectorAll('button')],first = buttons[0],last = buttons[buttons.length-1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    document.getElementById('main-container').appendChild(layer);
    document.querySelectorAll('[data-teacher-menu]').forEach(button => button.setAttribute('aria-expanded','true'));
    layer.querySelector('button').focus();
};
function teacherViewportChanged() {
    document.documentElement.style.setProperty('--teacher-viewport',(window.visualViewport ? window.visualViewport.height : window.innerHeight)+'px');
    if (window.innerWidth >= 768) closeTeacherMobileMenu(false);
}
window.addEventListener('resize',teacherViewportChanged);
if (window.visualViewport) window.visualViewport.addEventListener('resize',teacherViewportChanged);
teacherViewportChanged();
