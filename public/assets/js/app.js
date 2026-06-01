/* ============================================================
   LINE Notify — App JavaScript (v2.1)
   Toast / Loader / AJAX helpers / Sidebar / Theme toggle
   ============================================================ */

(function () {
    'use strict';

    const App = {
        csrf: '',

        init() {
            // csrf may already be read at script load — refresh in case meta was added later
            this.csrf = document.querySelector('meta[name="csrf-token"]')?.content || this.csrf;
            this.bootSidebar();
            this.bootThemeToggle();
            this.bootDayChips();
            this.bootSubmitGuards();
            this.bootFlashMessages();
        },

        // ---- Toasts ------------------------------------------------
        toast(type, title, text, timeout = 4000) {
            let host = document.getElementById('toastContainer');
            if (!host) {
                host = document.createElement('div');
                host.id = 'toastContainer';
                host.className = 'toast-container-modern';
                document.body.appendChild(host);
            }

            const icons = {
                success: 'bi-check-circle-fill',
                error:   'bi-x-circle-fill',
                warning: 'bi-exclamation-triangle-fill',
                info:    'bi-info-circle-fill',
            };
            const cls = {
                success: 'toast-success',
                error:   'toast-error',
                warning: 'toast-warning',
                info:    'toast-info',
            };

            const el = document.createElement('div');
            el.className = 'toast-modern ' + (cls[type] || 'toast-info');
            el.innerHTML = `
                <i class="bi ${icons[type] || icons.info} toast-icon"></i>
                <div class="toast-body">
                    ${title ? `<p class="toast-title"></p>` : ''}
                    ${text  ? `<p class="toast-text"></p>`  : ''}
                </div>
                <button type="button" class="toast-close" aria-label="Close">&times;</button>
            `;
            if (title) el.querySelector('.toast-title').textContent = title;
            if (text)  el.querySelector('.toast-text').textContent  = text;

            const dismiss = () => {
                el.classList.add('is-leaving');
                setTimeout(() => el.remove(), 220);
            };
            el.querySelector('.toast-close').addEventListener('click', dismiss);

            host.appendChild(el);
            if (timeout > 0) setTimeout(dismiss, timeout);
        },
        success(title, text) { this.toast('success', title, text); },
        error(title, text)   { this.toast('error',   title, text); },
        warning(title, text) { this.toast('warning', title, text); },
        info(title, text)    { this.toast('info',    title, text); },

        // ---- Loading overlay --------------------------------------
        showLoader() {
            let el = document.getElementById('appLoader');
            if (!el) {
                el = document.createElement('div');
                el.id = 'appLoader';
                el.className = 'loading-overlay-modern';
                el.innerHTML = '<div class="spinner-ring"></div>';
                document.body.appendChild(el);
            }
            el.classList.add('is-active');
        },
        hideLoader() {
            document.getElementById('appLoader')?.classList.remove('is-active');
        },

        // ---- Confirm dialog (uses SweetAlert2 if loaded, else native) ----
        async confirm(opts = {}) {
            const o = Object.assign({
                title: 'ยืนยัน?', text: '', confirmText: 'ตกลง', cancelText: 'ยกเลิก',
                icon: 'question', danger: false,
            }, opts);

            if (typeof Swal !== 'undefined') {
                const r = await Swal.fire({
                    title: o.title, text: o.text, icon: o.icon,
                    showCancelButton: true,
                    confirmButtonText: o.confirmText, cancelButtonText: o.cancelText,
                    confirmButtonColor: o.danger ? '#dc2626' : '#06c755',
                    cancelButtonColor: '#94a3b8',
                    customClass: { popup: 'swal-modern' },
                });
                return r.isConfirmed;
            }
            return window.confirm(o.title + (o.text ? '\n\n' + o.text : ''));
        },

        // ---- AJAX -------------------------------------------------
        async ajax(url, formData, opts = {}) {
            const o = Object.assign({ method: 'POST', loader: true, autoToast: true }, opts);
            if (o.loader) this.showLoader();

            try {
                const body = formData instanceof FormData ? formData : this.toFormData(formData || {});
                // Lazily resolve csrf token — handles call sites that fire before App.init()
                const csrf = this.csrf || document.querySelector('meta[name="csrf-token"]')?.content || '';
                if (csrf) {
                    this.csrf = csrf; // cache for next call
                    // AdonisJS Shield expects "_csrf" form field. We also keep
                    // "csrf_token" for any legacy inline handlers that still read it.
                    if (!body.has('_csrf')) body.append('_csrf', csrf);
                    if (!body.has('csrf_token')) body.append('csrf_token', csrf);
                }

                const res = await fetch(url, {
                    method: o.method,
                    body: body,
                    credentials: 'same-origin',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                });

                let data;
                const text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    let msg;
                    if (text === '') {
                        msg = `เซิร์ฟเวอร์ตอบกลับว่าง (HTTP ${res.status}) — อาจเกิด PHP fatal error`;
                    } else {
                        msg = `Response ไม่ใช่ JSON: ${text.slice(0, 180)}`;
                    }
                    data = { success: false, message: msg };
                }

                if (o.autoToast && !data.success && data.message) {
                    this.error('ไม่สำเร็จ', data.message);
                }
                return data;
            } catch (err) {
                if (o.autoToast) this.error('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
                return { success: false, message: err.message };
            } finally {
                if (o.loader) this.hideLoader();
            }
        },

        toFormData(obj) {
            const fd = new FormData();
            for (const [k, v] of Object.entries(obj)) {
                if (Array.isArray(v)) v.forEach(x => fd.append(k + '[]', x));
                else if (v !== undefined && v !== null) fd.append(k, v);
            }
            return fd;
        },

        // ---- Sidebar (mobile) -------------------------------------
        bootSidebar() {
            const toggle  = document.querySelector('[data-sidebar-toggle]');
            const sidebar = document.querySelector('.app-sidebar');
            if (!toggle || !sidebar) return;

            let backdrop = document.querySelector('.sidebar-backdrop');
            if (!backdrop) {
                backdrop = document.createElement('div');
                backdrop.className = 'sidebar-backdrop';
                document.body.appendChild(backdrop);
            }

            const open  = () => { sidebar.classList.add('is-open');    backdrop.classList.add('is-open'); };
            const close = () => { sidebar.classList.remove('is-open'); backdrop.classList.remove('is-open'); };

            toggle.addEventListener('click', () => sidebar.classList.contains('is-open') ? close() : open());
            backdrop.addEventListener('click', close);
        },

        // ---- Theme toggle (light / dark) --------------------------
        bootThemeToggle() {
            const root = document.documentElement;
            const stored = localStorage.getItem('app-theme');
            if (stored) root.setAttribute('data-bs-theme', stored);

            const btn = document.querySelector('[data-theme-toggle]');
            if (!btn) return;

            const sync = () => {
                const t = root.getAttribute('data-bs-theme') || 'light';
                btn.querySelector('i')?.classList.remove('bi-moon', 'bi-sun');
                btn.querySelector('i')?.classList.add(t === 'dark' ? 'bi-sun' : 'bi-moon');
            };
            sync();

            btn.addEventListener('click', () => {
                const t = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
                root.setAttribute('data-bs-theme', t);
                localStorage.setItem('app-theme', t);
                sync();
            });
        },

        // ---- Day-of-week chips ------------------------------------
        bootDayChips() {
            // Day labels: 1=Sun ... 7=Sat (matches DB convention)
            const FULL_NAMES = {
                1: 'อาทิตย์', 2: 'จันทร์', 3: 'อังคาร', 4: 'พุธ',
                5: 'พฤหัสบดี', 6: 'ศุกร์', 7: 'เสาร์',
            };
            const ORDER = [2, 3, 4, 5, 6, 7, 1]; // display order: Mon → Sun

            const updateChip = (input) => {
                const chip = input.closest('.day-chip');
                if (chip) chip.classList.toggle('is-selected', input.checked);
            };

            const updateSummary = (picker) => {
                const summary = picker.querySelector('[data-day-summary]');
                if (!summary) return;
                const checked = [...picker.querySelectorAll('.day-chip input:checked')]
                    .map(i => parseInt(i.value, 10))
                    .filter(Boolean);

                if (checked.length === 0) {
                    summary.classList.add('is-empty');
                    summary.innerHTML = '<i class="bi bi-info-circle"></i><span>ยังไม่ได้เลือกวัน</span>';
                    return;
                }

                summary.classList.remove('is-empty');
                const ordered = ORDER.filter(d => checked.includes(d));
                const names = ordered.map(d => FULL_NAMES[d]).join(', ');

                let label;
                if (checked.length === 7)        label = 'ทุกวันในสัปดาห์';
                else if (checked.length === 5 && [2,3,4,5,6].every(d => checked.includes(d))) label = 'จันทร์ – ศุกร์';
                else if (checked.length === 2 && checked.includes(7) && checked.includes(1)) label = 'เสาร์ – อาทิตย์';
                else label = names;

                summary.innerHTML = `<i class="bi bi-check2-circle"></i><span>เลือก <strong>${checked.length}</strong> วัน: ${label}</span>`;
            };

            document.querySelectorAll('[data-day-picker]').forEach(picker => {
                // Initial state
                picker.querySelectorAll('.day-chip input').forEach(input => {
                    updateChip(input);
                    // Listen on each input directly (synthetic change events may not bubble)
                    input.addEventListener('change', () => {
                        updateChip(input);
                        updateSummary(picker);
                    });
                });
                updateSummary(picker);

                // Preset buttons
                picker.querySelectorAll('[data-day-preset]').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.preventDefault();
                        const preset = btn.dataset.dayPreset;
                        const inputs = picker.querySelectorAll('.day-chip input');
                        const apply = (vals) => {
                            inputs.forEach(i => {
                                i.checked = vals.includes(parseInt(i.value, 10));
                                updateChip(i);
                            });
                        };
                        if (preset === 'weekday')      apply([2, 3, 4, 5, 6]);
                        else if (preset === 'weekend') apply([7, 1]);
                        else if (preset === 'all')     apply([1, 2, 3, 4, 5, 6, 7]);
                        else if (preset === 'clear')   apply([]);
                        updateSummary(picker);
                    });
                });
            });

            // Fallback: legacy .day-chip without [data-day-picker] wrapper
            document.querySelectorAll('.day-chip input').forEach(input => {
                if (input.closest('[data-day-picker]')) return;
                const apply = () => input.closest('.day-chip')?.classList.toggle('is-selected', input.checked);
                apply();
                input.addEventListener('change', apply);
            });
        },

        // ---- Disable submit on click (prevent double submission) ----
        bootSubmitGuards() {
            document.querySelectorAll('form[data-async]').forEach(form => {
                form.addEventListener('submit', e => {
                    e.preventDefault();
                    const btn = form.querySelector('[type=submit]');
                    if (btn) btn.classList.add('is-loading');

                    App.ajax(form.action || window.location.href, new FormData(form))
                        .then(res => {
                            btn?.classList.remove('is-loading');
                            const ev = new CustomEvent('async-form:done', { detail: res });
                            form.dispatchEvent(ev);
                            if (res.success && res.message && form.dataset.async !== 'silent') {
                                App.success('สำเร็จ', res.message);
                            }
                        });
                });
            });
        },

        // ---- Auto-show server flash messages as toast -------------
        bootFlashMessages() {
            document.querySelectorAll('[data-flash]').forEach(el => {
                const type = el.dataset.flash || 'info';
                const text = el.textContent.trim();
                if (text) App.toast(type, '', text);
                el.remove();
            });
        },
    };

    // Read CSRF immediately at script load (defer = DOM is parsed)
    // so handlers that fire before App.init() (e.g. CronView's DOMContentLoaded) still get it
    App.csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';

    window.App = App;
    document.addEventListener('DOMContentLoaded', () => App.init());
})();

// ----- Compat helpers (used by inline handlers in old views) -----
function showLoading()  { window.App?.showLoader(); }
function hideLoading()  { window.App?.hideLoader(); }
function showAlert(icon, title, text) { window.App?.toast(icon === 'error' ? 'error' : icon, title, text); }
function showConfirm(title, text, confirmText) {
    return window.App.confirm({ title, text, confirmText }).then(ok => ({ isConfirmed: !!ok }));
}
