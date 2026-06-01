/* ============================================================
   schedules.js — Schedule CRUD logic
   ============================================================ */

(function () {
    'use strict';

    const SYSTEM_VARS = new Set(['date','time','date_th','weekday','org_name','site_title','site_footer']);

    const Schedules = {
        modal: null,
        form: null,
        specificDates: [],

        init() {
            this.form  = document.getElementById('scheduleForm');
            const el   = document.getElementById('scheduleModal');
            this.modal = el ? new bootstrap.Modal(el) : null;

            this.form?.addEventListener('submit', e => { e.preventDefault(); this.save(); });

            document.getElementById('scheduleTemplateSelect')?.addEventListener('change', () => this.updateTemplateVarsHint());

            // Repeat toggle
            document.getElementById('repeat_enabled')?.addEventListener('change', e => {
                document.getElementById('repeatFields').style.display = e.target.checked ? 'block' : 'none';
            });

            // Mode toggle (weekly / specific)
            document.querySelectorAll('[data-mode-toggle] [data-mode]').forEach(btn => {
                btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
            });

            // Specific date input
            const dateInput = document.getElementById('specificDateInput');
            const addBtn    = document.getElementById('btnAddDate');
            addBtn?.addEventListener('click', () => this.addDate(dateInput.value));
            dateInput?.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this.addDate(dateInput.value); }
            });

            // Pill remove (event delegation)
            document.getElementById('specificDatesList')?.addEventListener('click', e => {
                const btn = e.target.closest('[data-remove-date]');
                if (btn) this.removeDate(btn.dataset.removeDate);
            });

            // Action buttons (event delegation)
            document.body.addEventListener('click', e => {
                const newBtn  = e.target.closest('[data-action="new-schedule"]');
                if (newBtn)  { e.preventDefault(); this.openNew(); return; }

                const editBtn = e.target.closest('[data-action="edit-schedule"]');
                if (editBtn) { e.preventDefault(); this.openEdit(parseInt(editBtn.dataset.id, 10)); return; }

                const delBtn  = e.target.closest('[data-action="delete-schedule"]');
                if (delBtn)  { e.preventDefault(); this.remove(parseInt(delBtn.dataset.id, 10)); return; }

                const testBtn = e.target.closest('[data-action="test-schedule"]');
                if (testBtn) { e.preventDefault(); this.test(parseInt(testBtn.dataset.id, 10)); return; }

                const cloneBtn = e.target.closest('[data-action="clone-schedule"]');
                if (cloneBtn) { e.preventDefault(); this.clone(parseInt(cloneBtn.dataset.id, 10)); return; }
            });
        },

        setMode(mode) {
            mode = mode === 'specific' ? 'specific' : 'weekly';

            // Update hidden input
            const hidden = this.form.querySelector('[name="schedule_mode"]');
            if (hidden) hidden.value = mode;

            // Update toggle buttons
            document.querySelectorAll('[data-mode-toggle] [data-mode]').forEach(b => {
                b.classList.toggle('is-active', b.dataset.mode === mode);
            });

            // Show/hide panels
            document.querySelectorAll('[data-mode-panel]').forEach(panel => {
                panel.style.display = panel.dataset.modePanel === mode ? '' : 'none';
            });
        },

        renderDates() {
            const list = document.getElementById('specificDatesList');
            if (!list) return;

            if (this.specificDates.length === 0) {
                list.innerHTML = '<span class="text-muted-soft" style="font-size: 13px;">ยังไม่ได้เลือกวันที่</span>';
                return;
            }

            const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
            this.specificDates.sort();
            list.innerHTML = this.specificDates.map(d => {
                const dt = new Date(d + 'T00:00:00');
                const day = dayNames[dt.getDay()];
                const human = dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                return `<span class="date-pill">
                    <span class="pill-day">${day}.</span>
                    <span>${human}</span>
                    <button type="button" class="pill-remove" data-remove-date="${d}" title="ลบ">&times;</button>
                </span>`;
            }).join('');
        },

        syncSpecificInputs() {
            // Remove existing hidden inputs
            this.form.querySelectorAll('input[type="hidden"][name="specific_dates[]"]').forEach(i => i.remove());
            // Add fresh ones
            this.specificDates.forEach(d => {
                const i = document.createElement('input');
                i.type = 'hidden';
                i.name = 'specific_dates[]';
                i.value = d;
                this.form.appendChild(i);
            });
        },

        addDate(value) {
            if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                App.warning('กรุณาเลือกวันที่ที่ถูกต้อง');
                return;
            }
            if (this.specificDates.includes(value)) {
                App.info('มีวันที่นี้อยู่แล้ว');
                return;
            }
            this.specificDates.push(value);
            this.renderDates();
            this.syncSpecificInputs();
            const input = document.getElementById('specificDateInput');
            if (input) input.value = '';
        },

        removeDate(value) {
            this.specificDates = this.specificDates.filter(d => d !== value);
            this.renderDates();
            this.syncSpecificInputs();
        },

        resetForm() {
            this.form.reset();
            this.form.querySelector('[name="id"]').value = '';
            document.getElementById('repeatFields').style.display = 'none';

            // Reset day chips
            document.querySelectorAll('.day-chip input').forEach(i => {
                i.checked = false;
                i.dispatchEvent(new Event('change'));
            });
            // Default Mon-Fri (in 1=Sun convention: 2,3,4,5,6)
            [2, 3, 4, 5, 6].forEach(d => {
                const i = document.querySelector(`.day-chip input[value="${d}"]`);
                if (i) { i.checked = true; i.dispatchEvent(new Event('change')); }
            });

            // Reset specific dates
            this.specificDates = [];
            this.renderDates();
            this.syncSpecificInputs();

            // Default to weekly mode
            this.setMode('weekly');
        },

        openNew() {
            this.resetForm();
            document.getElementById('scheduleModalTitle').textContent = 'เพิ่มตารางเวลา';
            this.modal?.show();
        },

        async openEdit(id) {
            this.resetForm();
            const res = await App.ajax('/schedules/get', { id });
            if (!res.success) return;

            const d = res.data;
            const f = this.form;
            f.id.value             = d.id;
            f.schedule_name.value  = d.schedule_name || '';
            f.template_id.value    = d.template_id || '';
            f.send_time.value      = (d.send_time || '08:00').slice(0, 5);
            f.is_active.checked    = !!d.is_active;
            f.repeat_enabled.checked = !!d.repeat_enabled;
            f.repeat_interval.value  = d.repeat_interval || 30;
            f.repeat_unit.value      = d.repeat_unit || 'minutes';
            f.repeat_end_time.value  = (d.repeat_end_time || '17:00').slice(0, 5);
            document.getElementById('repeatFields').style.display = d.repeat_enabled ? 'block' : 'none';

            // Selected groups / days
            f.querySelectorAll('input[name="group_ids[]"]').forEach(i => {
                i.checked = (d.group_ids_array || []).includes(parseInt(i.value, 10));
            });
            f.querySelectorAll('input[name="days_of_week[]"]').forEach(i => {
                i.checked = (d.days_of_week_array || []).includes(parseInt(i.value, 10));
                i.dispatchEvent(new Event('change'));
            });

            // Mode + specific dates
            this.specificDates = Array.isArray(d.specific_dates) ? [...d.specific_dates] : [];
            this.renderDates();
            this.syncSpecificInputs();
            this.setMode(d.schedule_mode === 'specific' ? 'specific' : 'weekly');
            this.updateTemplateVarsHint();

            document.getElementById('scheduleModalTitle').textContent = 'แก้ไขตารางเวลา';
            this.modal?.show();
        },

        updateTemplateVarsHint() {
            const sel   = document.getElementById('scheduleTemplateSelect');
            const info  = document.getElementById('tplVarsInfo');
            const chips = document.getElementById('tplVarsChips');
            if (!sel || !info || !chips) return;
            const id  = parseInt(sel.value, 10);
            const tpl = (window.__scheduleTemplates || []).find(t => t.id === id);
            const itemVars = (tpl?.vars || []).filter(v => !SYSTEM_VARS.has(v));
            if (itemVars.length === 0) {
                info.style.display = 'none';
            } else {
                chips.innerHTML = itemVars.map(v => `<span class="chip">{${v}}</span>`).join('');
                info.style.display = '';
            }
        },

        async save() {
            // Make sure specific_dates hidden inputs are in sync before serializing
            this.syncSpecificInputs();
            const fd = new FormData(this.form);
            const res = await App.ajax('/schedules/save', fd);
            if (res.success) {
                App.success('สำเร็จ', res.message);
                this.modal?.hide();
                setTimeout(() => location.reload(), 600);
            }
        },

        async remove(id) {
            const ok = await App.confirm({ title: 'ลบตารางเวลา?', text: 'การลบนี้ไม่สามารถย้อนกลับได้', confirmText: 'ลบ', danger: true });
            if (!ok) return;
            const res = await App.ajax('/schedules/delete', { id });
            if (res.success) {
                App.success('สำเร็จ', res.message);
                document.querySelector(`tr[data-schedule-id="${id}"]`)?.remove();
            }
        },

        async clone(id) {
            const ok = await App.confirm({ title: 'ทำสำเนา?', text: 'จะสร้างตารางเวลาใหม่ที่ตั้งค่าเหมือนเดิม (ปิดใช้งานไว้)', confirmText: 'ทำสำเนา' });
            if (!ok) return;
            const res = await App.ajax('/schedules/clone', { id });
            if (res.success) {
                App.success('สำเร็จ', res.message);
                setTimeout(() => location.reload(), 600);
            }
        },

        async test(id) {
            const ok = await App.confirm({ title: 'ทดสอบส่ง?', text: 'ระบบจะส่งข้อความจริงไปยังกลุ่มที่ผูกไว้', confirmText: 'ทดสอบ' });
            if (!ok) return;
            const res = await App.ajax('/schedules/test', { schedule_id: id });
            if (res.success) {
                App.success('สำเร็จ', `ส่งไปยัง ${res.data?.groups_sent ?? 0} กลุ่ม`);
                if (res.data?.message_preview) {
                    document.getElementById('outputModalTitle').innerHTML = '<i class="bi bi-chat-text"></i> ตัวอย่างข้อความ';
                    document.getElementById('outputModalContent').textContent = res.data.message_preview;
                    new bootstrap.Modal(document.getElementById('outputModal')).show();
                }
            }
        },
    };

    document.addEventListener('DOMContentLoaded', () => Schedules.init());
    window.Schedules = Schedules;
})();
