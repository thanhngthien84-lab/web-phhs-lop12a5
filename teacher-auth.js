// Credentials stay on the teacher's device and are never part of the public source.
const teacherSavedAccessKey = 'lop12a5_teacher_access_v1';
const teacherAccessLifetime = 30 * 24 * 60 * 60 * 1000;
let teacherAuthPending = null;

function readTeacherSavedAccess() {
    try {
        const entry = JSON.parse(localStorage.getItem(teacherSavedAccessKey) || 'null');
        if (entry && typeof entry.key === 'string' && entry.expiresAt > Date.now()) return entry.key;
        localStorage.removeItem(teacherSavedAccessKey);
    } catch (_) { /* Device storage can be unavailable in private browsing. */ }
    return '';
}

function clearTeacherSavedAccess() {
    try { localStorage.removeItem(teacherSavedAccessKey); } catch (_) {}
}

window.forgetTeacherDevice = function() {
    clearTeacherSavedAccess();
    window.googleAdminVerifiedKey = '';
    rememberGoogleAdminKey('');
    showToast('Đã quên kết nối trên thiết bị này. Lần đồng bộ tiếp theo cần nhập mã.', 'success');
};

window.configureTeacherDevice = async function() {
    if (!teacherAuthPending) teacherAuthPending = openTeacherAccessDialog().finally(() => { teacherAuthPending = null; });
    const key = await teacherAuthPending;
    if (key) await syncClassFromGoogle();
};

function openTeacherAccessDialog() {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'border:0;border-radius:22px;padding:24px;width:min(430px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;color:#1e293b;box-shadow:0 20px 80px #0004';
        dialog.innerHTML = '<form><h2 style="font-size:22px;font-weight:800;margin:0 0 8px">Kết nối Google Sheet</h2><p style="font-size:14px;color:#64748b;margin:0 0 18px">Nhập mã quản trị để kết nối dữ liệu lớp.</p><label for="teacher-access-input" style="display:block;font-weight:700;margin-bottom:8px">Mã quản trị</label><input id="teacher-access-input" name="teacher-access" type="password" autocomplete="current-password" required style="width:100%;font-size:16px;padding:12px;border:1px solid #cbd5e1;border-radius:12px"><label style="display:flex;align-items:flex-start;gap:10px;margin:18px 0;line-height:1.5;font-size:14px"><input name="remember" type="checkbox" style="margin-top:4px;width:20px;height:20px;flex-shrink:0"><span>Ghi nhớ trên thiết bị cá nhân trong 30 ngày<br><small style="color:#64748b">Tự đồng bộ khi mở web. Không chọn trên máy dùng chung.</small></span></label><p role="status" style="font-size:14px;color:#b91c1c;line-height:1.5;margin-bottom:12px"></p><div style="display:flex;gap:10px"><button type="button" data-cancel style="flex:1;min-height:46px;border-radius:12px;background:#f1f5f9;font-weight:700">Để sau</button><button type="submit" style="flex:1;min-height:46px;border-radius:12px;background:#4338ca;color:white;font-weight:700">Kết nối</button></div></form>';
        document.body.appendChild(dialog);
        const form = dialog.querySelector('form');
        const input = dialog.querySelector('input[type=password]');
        const status = dialog.querySelector('[role=status]');
        const submit = dialog.querySelector('[type=submit]');
        let settled = false;
        let attempt = 0;
        const finish = key => {
            if (settled) return;
            settled = true;
            dialog.close(); dialog.remove();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
            resolve(key);
        };
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(''); });
        dialog.querySelector('[data-cancel]').onclick = () => finish('');
        form.onsubmit = async event => {
            event.preventDefault();
            const key = input.value.trim();
            if (!key || submit.disabled) return;
            const currentAttempt = ++attempt;
            submit.disabled = true; submit.textContent = 'Đang kết nối…'; status.textContent = '';
            try {
                let response = await requestAdminKeyCheck(key);
                if (!response.ok && /Mã tra cứu phải gồm đúng 5 chữ số/i.test(response.message || '')) response = await requestAdminKeyCheck(key, 'connection-check');
                if (settled || currentAttempt !== attempt) return;
                if (!response.ok) throw new Error(response.message || 'Không xác minh được mã quản trị.');
                rememberGoogleAdminKey(key);
                window.googleAdminVerifiedKey = key;
                if (form.elements.remember.checked) {
                    try { localStorage.setItem(teacherSavedAccessKey, JSON.stringify({key,expiresAt:Date.now()+teacherAccessLifetime})); }
                    catch (_) { showToast('Thiết bị không cho lưu lâu dài; kết nối được ghi nhớ trong phiên này.', 'info'); }
                } else clearTeacherSavedAccess();
                finish(key);
            } catch (error) {
                if (!settled) status.textContent = error.message || 'Không thể kết nối Google.';
            } finally {
                if (!settled) { submit.disabled = false; submit.textContent = 'Kết nối'; }
            }
        };
        dialog.showModal(); input.focus();
    });
}

window.teacherRequestAdminKey = async function(options = {}) {
    const automatic = Boolean(options.automatic);
    let key = window.googleAdminKey || '';
    if (!key) {
        try { key = sessionStorage.getItem('chuyen_tau_google_admin_key') || ''; } catch (_) {}
    }
    key = key || readTeacherSavedAccess();
    if (key) {
        // The requested data endpoint validates the supplied key server-side.
        rememberGoogleAdminKey(key);
        return key;
    }
    if (automatic) return '';
    if (!teacherAuthPending) {
        teacherAuthPending = openTeacherAccessDialog().finally(() => { teacherAuthPending = null; });
    }
    return teacherAuthPending;
};
