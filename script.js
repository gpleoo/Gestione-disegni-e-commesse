// ============================================================
// Gestione Disegni e Commesse - v3.0
// Sezioni multiple con descrizione
// ============================================================

// Configurazione sezioni
const SECTIONS = {
    disegniOfficina: { label: 'Disegni Officina', addLabel: 'Disegno Officina', hasOrdine: false },
    disegniCantiere: { label: 'Disegni Cantiere', addLabel: 'Disegno Cantiere', hasOrdine: false },
    rdoMateriali: { label: 'RDO Materiali', addLabel: 'RDO Materiali', hasOrdine: true },
    rdoBulloneria: { label: 'RDO Bulloneria', addLabel: 'RDO Bulloneria', hasOrdine: true },
    dxfPiastre: { label: 'DXF Piastre', addLabel: 'DXF Piastre', hasOrdine: false }
};

const MAX_ENTRIES = 5;

// --- Utility ---
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, ch => map[ch]);
}

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Toast ---
class ToastManager {
    constructor() {
        this.container = document.getElementById('toastContainer');
    }
    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        this.container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    success(msg) { this.show(msg, 'success'); }
    error(msg) { this.show(msg, 'error', 5000); }
    warning(msg) { this.show(msg, 'warning', 4000); }
    info(msg) { this.show(msg, 'info'); }
}

// --- Classe principale ---
class DrawingsManager {
    constructor() {
        this.drawings = this.loadDrawings();
        this.currentEditId = null;
        this.toast = new ToastManager();
        this.sortColumn = 'createdAt';
        this.sortDirection = 'desc';

        this.users = {
            'admin': { hash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', role: 'admin', name: 'Amministratore' },
            'collaboratore': { hash: 'e3e4116aa49f779d0c96ae6eaa7a6b29da6fd0ef73d85b187471aeabc3b25428', role: 'collaboratore', name: 'Collaboratore' },
            'utente1': { hash: '9cdee5050fb57181e54646f487753dde73bc8e8c73843de92d01427420c64c23', role: 'visualizzatore', name: 'Utente 1' },
            'utente2': { hash: 'df21b1245419763295b2d582072ada296c09b458227f6176d36634c88c179a91', role: 'visualizzatore', name: 'Utente 2' },
            'utente3': { hash: 'd7843fc12f2260537ce74087e09f296cab80c1b4b1e8c5eb2d1b6250b5f5ce51', role: 'visualizzatore', name: 'Utente 3' }
        };

        this.dom = {
            tableBody: document.getElementById('tableBody'),
            modal: document.getElementById('modal'),
            adminModal: document.getElementById('adminModal'),
            drawingForm: document.getElementById('drawingForm'),
            modalTitle: document.getElementById('modalTitle'),
            adminPassword: document.getElementById('adminPassword'),
            userRole: document.getElementById('userRole'),
            toggleAdminBtn: document.getElementById('toggleAdminBtn'),
            addDrawingBtn: document.getElementById('addDrawingBtn'),
            filterNumero: document.getElementById('filterNumero'),
            filterCliente: document.getElementById('filterCliente'),
            filterCantiere: document.getElementById('filterCantiere'),
            filterOggetto: document.getElementById('filterOggetto'),
            exportBtn: document.getElementById('exportBtn'),
            importBtn: document.getElementById('importBtn'),
            importFile: document.getElementById('importFile')
        };

        this.currentUser = this.loadCurrentUser();
        this.initializeEventListeners();
        this.updateUserInterface();
        this.renderTable();
        this.checkBackupReminder();
    }

    // --- Storage e migrazione ---
    loadDrawings() {
        const stored = localStorage.getItem('drawings');
        if (!stored) return [];
        const drawings = JSON.parse(stored);
        return drawings.map(d => this.migrateDrawing(d));
    }

    migrateDrawing(d) {
        // Se gia in formato array, non serve migrazione
        if (Array.isArray(d.disegniOfficina)) return d;

        const migrated = { ...d };

        // Migra sezioni semplici
        ['disegniOfficina', 'disegniCantiere', 'dxfPiastre'].forEach(key => {
            const old = migrated[key];
            if (old && (old.consegnato || old.data)) {
                migrated[key] = [{ descrizione: '', consegnato: old.consegnato || '', data: old.data || '' }];
            } else {
                migrated[key] = [];
            }
        });

        // Migra RDO Materiali (include ordine + arrivo)
        const rmOld = migrated.rdoMateriali;
        if ((rmOld && (rmOld.consegnato || rmOld.data)) || migrated.ordineMateriali || migrated.arrivoMateriale) {
            migrated.rdoMateriali = [{
                descrizione: '',
                consegnato: rmOld?.consegnato || '',
                data: rmOld?.data || '',
                ordine: migrated.ordineMateriali || '',
                arrivo: migrated.arrivoMateriale || ''
            }];
        } else {
            migrated.rdoMateriali = [];
        }
        delete migrated.ordineMateriali;
        delete migrated.arrivoMateriale;

        // Migra RDO Bulloneria
        const rbOld = migrated.rdoBulloneria;
        if ((rbOld && (rbOld.consegnato || rbOld.data)) || migrated.ordineBulloneria || migrated.arrivoBulloneria) {
            migrated.rdoBulloneria = [{
                descrizione: '',
                consegnato: rbOld?.consegnato || '',
                data: rbOld?.data || '',
                ordine: migrated.ordineBulloneria || '',
                arrivo: migrated.arrivoBulloneria || ''
            }];
        } else {
            migrated.rdoBulloneria = [];
        }
        delete migrated.ordineBulloneria;
        delete migrated.arrivoBulloneria;

        return migrated;
    }

    loadCurrentUser() {
        const stored = localStorage.getItem('currentUser');
        return stored ? JSON.parse(stored) : null;
    }

    saveCurrentUser() {
        if (this.currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        } else {
            localStorage.removeItem('currentUser');
        }
    }

    saveDrawings() {
        try {
            localStorage.setItem('drawings', JSON.stringify(this.drawings));
            localStorage.setItem('lastSaveDate', new Date().toISOString());
        } catch (error) {
            this.toast.error('ERRORE: Impossibile salvare i dati! Spazio localStorage esaurito o bloccato.');
            console.error('Errore salvataggio:', error);
        }
    }

    checkBackupReminder() {
        const lastExport = localStorage.getItem('lastExportDate');
        if (!lastExport && this.drawings.length > 0) {
            this.toast.warning('Non hai mai esportato un backup. Usa il pulsante Esporta per salvare i tuoi dati.');
            return;
        }
        if (lastExport && this.drawings.length > 0) {
            const daysSince = (Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince > 7) {
                this.toast.warning(`Ultimo backup: ${Math.floor(daysSince)} giorni fa. Ricordati di esportare!`);
            }
        }
    }

    // --- Event Listeners ---
    initializeEventListeners() {
        this.dom.addDrawingBtn.addEventListener('click', () => this.openModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());

        window.addEventListener('click', (e) => {
            if (e.target === this.dom.modal) this.closeModal();
            if (e.target === this.dom.adminModal) this.closeAdminModal();
        });

        this.dom.drawingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDrawing();
        });

        this.dom.toggleAdminBtn.addEventListener('click', () => {
            this.currentUser ? this.logout() : this.openAdminModal();
        });

        document.getElementById('adminForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.checkAdminPassword();
        });

        document.querySelectorAll('.close-admin').forEach(btn => {
            btn.addEventListener('click', () => this.closeAdminModal());
        });

        // Filtri
        this.dom.filterNumero.addEventListener('input', () => this.applyFilters());
        this.dom.filterCliente.addEventListener('input', () => this.applyFilters());
        this.dom.filterCantiere.addEventListener('input', () => this.applyFilters());
        this.dom.filterOggetto.addEventListener('input', () => this.applyFilters());

        document.getElementById('clearFilters').addEventListener('click', () => {
            this.dom.filterNumero.value = '';
            this.dom.filterCliente.value = '';
            this.dom.filterCantiere.value = '';
            this.dom.filterOggetto.value = '';
            this.applyFilters();
        });

        this.dom.exportBtn.addEventListener('click', () => this.exportData());
        this.dom.importBtn.addEventListener('click', () => this.dom.importFile.click());
        this.dom.importFile.addEventListener('change', (e) => this.importData(e));

        // Event delegation tabella
        this.dom.tableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = Number(btn.dataset.id);
            if (action === 'edit') {
                const drawing = this.drawings.find(d => d.id === id);
                if (drawing) this.openModal(drawing);
            } else if (action === 'delete') {
                this.deleteDrawing(id);
            } else if (action === 'toggle') {
                this.toggleCommessa(id);
            }
        });

        // Ordinamento colonne
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (this.sortColumn === col) {
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortColumn = col;
                    this.sortDirection = 'asc';
                }
                this.updateSortIndicators();
                this.applyFilters();
            });
        });

        // Event delegation form: aggiungi/rimuovi entry
        this.dom.drawingForm.addEventListener('click', (e) => {
            const addBtn = e.target.closest('.btn-add-entry');
            if (addBtn) {
                const section = addBtn.dataset.section;
                this.addEntry(section);
                return;
            }
            const removeBtn = e.target.closest('.btn-remove-entry');
            if (removeBtn) {
                const section = removeBtn.dataset.section;
                const index = Number(removeBtn.dataset.index);
                this.removeEntry(section, index);
                return;
            }
        });

        // Checkbox "Non Necessario"
        Object.keys(SECTIONS).forEach(key => {
            const cb = document.getElementById(`${key}NonNecessario`);
            if (cb) {
                cb.addEventListener('change', () => {
                    this.toggleSectionDisabled(key, cb.checked);
                });
            }
        });
    }

    toggleSectionDisabled(sectionKey, disabled) {
        const container = document.getElementById(`${sectionKey}Entries`);
        const addBtn = document.getElementById(`${sectionKey}AddBtn`);
        if (container) {
            container.style.opacity = disabled ? '0.3' : '';
            container.style.pointerEvents = disabled ? 'none' : '';
            container.querySelectorAll('input').forEach(inp => inp.disabled = disabled);
        }
        if (addBtn) {
            addBtn.disabled = disabled;
            addBtn.style.opacity = disabled ? '0.3' : '';
        }
    }

    updateSortIndicators() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === this.sortColumn) {
                th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    // --- Autenticazione ---
    openAdminModal() {
        this.dom.adminModal.style.display = 'block';
        this.dom.adminPassword.value = '';
        this.dom.adminPassword.focus();
    }

    closeAdminModal() {
        this.dom.adminModal.style.display = 'none';
        this.dom.adminPassword.value = '';
    }

    async checkAdminPassword() {
        const password = this.dom.adminPassword.value;
        const passwordHash = await sha256(password);
        let foundUser = null, foundUsername = null;

        for (const [username, userData] of Object.entries(this.users)) {
            if (userData.hash === passwordHash) {
                foundUser = userData;
                foundUsername = username;
                break;
            }
        }

        if (foundUser) {
            this.currentUser = { username: foundUsername, role: foundUser.role, name: foundUser.name };
            this.saveCurrentUser();
            this.updateUserInterface();
            this.renderTable();
            this.closeAdminModal();
            this.toast.success(`Benvenuto ${foundUser.name}! Ruolo: ${this.getRoleDisplayName(foundUser.role)}`);
        } else {
            this.toast.error('Password errata!');
            this.dom.adminPassword.value = '';
            this.dom.adminPassword.focus();
        }
    }

    getRoleDisplayName(role) {
        const names = { 'admin': 'Amministratore', 'collaboratore': 'Collaboratore', 'visualizzatore': 'Visualizzatore (solo lettura)' };
        return names[role] || role;
    }

    canEdit() {
        return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'collaboratore');
    }

    isViewer() {
        return this.currentUser && this.currentUser.role === 'visualizzatore';
    }

    logout() {
        const userName = this.currentUser ? this.currentUser.name : 'Utente';
        if (confirm(`Vuoi uscire, ${userName}?`)) {
            this.currentUser = null;
            this.saveCurrentUser();
            this.updateUserInterface();
            this.renderTable();
            this.toast.info('Logout effettuato.');
        }
    }

    updateUserInterface() {
        if (this.currentUser) {
            const roleIcons = { 'admin': '\u{1F451}', 'collaboratore': '\u{1F91D}', 'visualizzatore': '\u{1F441}\uFE0F' };
            const icon = roleIcons[this.currentUser.role] || '\u{1F464}';
            this.dom.userRole.textContent = `${icon} ${this.currentUser.name}`;
            this.dom.userRole.classList.add('admin');
            this.dom.toggleAdminBtn.textContent = '\u{1F6AA} Logout';
            this.dom.toggleAdminBtn.classList.add('logout');
            this.dom.addDrawingBtn.style.display = this.isViewer() ? 'none' : '';
        } else {
            this.dom.userRole.textContent = '\u{1F464} Ospite';
            this.dom.userRole.classList.remove('admin');
            this.dom.toggleAdminBtn.textContent = '\u{1F510} Login';
            this.dom.toggleAdminBtn.classList.remove('logout');
            this.dom.addDrawingBtn.style.display = 'none';
        }
    }

    // --- Modal e form dinamico ---
    openModal(drawing = null) {
        if (!this.canEdit()) {
            this.toast.warning(this.isViewer()
                ? 'Sei un visualizzatore. Puoi solo vedere i dati, non modificarli.'
                : 'Devi effettuare il login per modificare i dati.');
            return;
        }

        if (drawing) {
            this.dom.modalTitle.textContent = 'Modifica Disegno';
            this.currentEditId = drawing.id;
            this.populateForm(drawing);
        } else {
            this.dom.modalTitle.textContent = 'Nuovo Disegno';
            this.currentEditId = null;
            this.dom.drawingForm.reset();
            this.suggestNextNumber();
            this.setTodayDate();
            // Inizializza sezioni con 1 entry vuota
            Object.keys(SECTIONS).forEach(key => {
                this.renderSectionEntries(key, [{}]);
                const cb = document.getElementById(`${key}NonNecessario`);
                if (cb) this.toggleSectionDisabled(key, cb.checked);
            });
        }

        this.populateAutocomplete();
        this.dom.modal.style.display = 'block';
    }

    closeModal() {
        this.dom.modal.style.display = 'none';
        this.dom.drawingForm.reset();
        this.currentEditId = null;
    }

    // --- Gestione entries dinamiche ---
    renderSectionEntries(sectionKey, entries) {
        const container = document.getElementById(`${sectionKey}Entries`);
        const addBtn = document.getElementById(`${sectionKey}AddBtn`);
        if (!container) return;

        const config = SECTIONS[sectionKey];
        const data = entries || [];

        container.innerHTML = data.map((entry, i) => this.renderEntryHtml(sectionKey, i, entry)).join('');

        // Aggiorna stato pulsante aggiungi
        if (addBtn) {
            const atMax = data.length >= MAX_ENTRIES;
            addBtn.disabled = atMax;
            addBtn.textContent = atMax
                ? `Massimo ${MAX_ENTRIES} voci raggiunte`
                : `+ Aggiungi ${config.addLabel}`;
        }
    }

    renderEntryHtml(sectionKey, index, data = {}) {
        const config = SECTIONS[sectionKey];
        let html = `<div class="entry-block" data-section="${sectionKey}" data-index="${index}">`;
        html += `<div class="entry-header">`;
        html += `<span class="entry-label">#${index + 1}</span>`;
        html += `<button type="button" class="btn-remove-entry" data-section="${sectionKey}" data-index="${index}" title="Rimuovi">\u2715 Rimuovi</button>`;
        html += `</div>`;
        html += `<div class="form-grid">`;

        // Descrizione (full width)
        html += `<div class="form-group full-width">`;
        html += `<label>Descrizione</label>`;
        html += `<input type="text" data-field="descrizione" value="${escapeHtml(data.descrizione || '')}" placeholder="Es: Profili HEA 200, Lamiere S355...">`;
        html += `</div>`;

        // Consegnato a
        html += `<div class="form-group">`;
        html += `<label>Consegnato a</label>`;
        html += `<input type="text" data-field="consegnato" value="${escapeHtml(data.consegnato || '')}" list="consegnatoList">`;
        html += `</div>`;

        // Data
        html += `<div class="form-group">`;
        html += `<label>Data</label>`;
        html += `<input type="date" data-field="data" value="${data.data || ''}">`;
        html += `</div>`;

        if (config.hasOrdine) {
            // Ordine
            html += `<div class="form-group">`;
            html += `<label>Ordine</label>`;
            html += `<input type="text" data-field="ordine" value="${escapeHtml(data.ordine || '')}">`;
            html += `</div>`;

            // Arrivo
            html += `<div class="form-group">`;
            html += `<label>Arrivo</label>`;
            html += `<input type="date" data-field="arrivo" value="${data.arrivo || ''}">`;
            html += `</div>`;
        }

        html += `</div></div>`;
        return html;
    }

    addEntry(sectionKey) {
        const currentEntries = this.collectSectionData(sectionKey);
        if (currentEntries.length >= MAX_ENTRIES) {
            this.toast.warning(`Massimo ${MAX_ENTRIES} voci per sezione.`);
            return;
        }
        currentEntries.push({});
        this.renderSectionEntries(sectionKey, currentEntries);

        // Rispetta stato "Non Necessario"
        const cb = document.getElementById(`${sectionKey}NonNecessario`);
        if (cb && cb.checked) this.toggleSectionDisabled(sectionKey, true);
    }

    removeEntry(sectionKey, index) {
        const currentEntries = this.collectSectionData(sectionKey);
        currentEntries.splice(index, 1);
        this.renderSectionEntries(sectionKey, currentEntries.length > 0 ? currentEntries : [{}]);

        const cb = document.getElementById(`${sectionKey}NonNecessario`);
        if (cb && cb.checked) this.toggleSectionDisabled(sectionKey, true);
    }

    collectSectionData(sectionKey) {
        const container = document.getElementById(`${sectionKey}Entries`);
        if (!container) return [];
        const config = SECTIONS[sectionKey];
        const entries = container.querySelectorAll('.entry-block');
        const data = [];

        entries.forEach(entry => {
            const item = {
                descrizione: entry.querySelector('[data-field="descrizione"]')?.value || '',
                consegnato: entry.querySelector('[data-field="consegnato"]')?.value || '',
                data: entry.querySelector('[data-field="data"]')?.value || ''
            };
            if (config.hasOrdine) {
                item.ordine = entry.querySelector('[data-field="ordine"]')?.value || '';
                item.arrivo = entry.querySelector('[data-field="arrivo"]')?.value || '';
            }
            data.push(item);
        });

        return data;
    }

    // Filtra entry vuote prima di salvare
    filterEmptyEntries(entries, hasOrdine) {
        return entries.filter(e => {
            return e.descrizione || e.consegnato || e.data ||
                (hasOrdine && (e.ordine || e.arrivo));
        });
    }

    // --- Autocomplete ---
    populateAutocomplete() {
        const clienti = [...new Set(this.drawings.map(d => d.cliente).filter(c => c && c.trim()))].sort();
        const cantieri = [...new Set(this.drawings.map(d => d.cantiere).filter(c => c && c.trim()))].sort();

        const consegnati = new Set();
        this.drawings.forEach(d => {
            Object.keys(SECTIONS).forEach(key => {
                if (Array.isArray(d[key])) {
                    d[key].forEach(entry => {
                        if (entry.consegnato?.trim()) consegnati.add(entry.consegnato.trim());
                    });
                }
            });
        });

        this.updateDatalist('clientiList', clienti);
        this.updateDatalist('cantieriList', cantieri);
        this.updateDatalist('consegnatoList', [...consegnati].sort());
    }

    updateDatalist(datalistId, values) {
        const datalist = document.getElementById(datalistId);
        if (datalist) {
            datalist.innerHTML = values.map(v => `<option value="${escapeHtml(v)}">`).join('');
        }
    }

    // --- Numerazione ---
    suggestNextNumber() {
        const currentYear = new Date().getFullYear();
        const drawingsThisYear = this.drawings.filter(d => d.numeroDisegno.includes(`/${currentYear}`));
        if (drawingsThisYear.length > 0) {
            const numbers = drawingsThisYear.map(d => {
                const match = d.numeroDisegno.match(/^(\d+)\//);
                return match ? parseInt(match[1]) : 0;
            });
            document.getElementById('numeroDisegno').value = `${Math.max(...numbers) + 1}/${currentYear}`;
        } else {
            document.getElementById('numeroDisegno').value = `890/${currentYear}`;
        }
    }

    setTodayDate() {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        document.getElementById('dataDisegno').value = `${y}-${m}-${d}`;
    }

    // --- Popola form ---
    populateForm(drawing) {
        document.getElementById('numeroDisegno').value = drawing.numeroDisegno || '';
        document.getElementById('dataDisegno').value = drawing.dataDisegno || '';
        document.getElementById('cliente').value = drawing.cliente || '';
        document.getElementById('cantiere').value = drawing.cantiere || '';
        document.getElementById('oggettoLavoro').value = drawing.oggettoLavoro || '';
        document.getElementById('note').value = drawing.note || '';

        // Popola sezioni dinamiche
        Object.keys(SECTIONS).forEach(key => {
            const entries = Array.isArray(drawing[key]) ? drawing[key] : [];
            const naCheckbox = document.getElementById(`${key}NonNecessario`);
            const isNa = drawing[`${key}NonNecessario`] || false;

            if (naCheckbox) naCheckbox.checked = isNa;
            this.renderSectionEntries(key, entries.length > 0 ? entries : [{}]);
            this.toggleSectionDisabled(key, isNa);
        });
    }

    // --- Salvataggio ---
    saveDrawing() {
        const numeroDisegno = document.getElementById('numeroDisegno').value.trim();

        // Controllo duplicati
        const duplicato = this.drawings.find(d =>
            d.numeroDisegno === numeroDisegno && d.id !== this.currentEditId
        );
        if (duplicato) {
            this.toast.error(`Esiste gia un disegno con il numero "${numeroDisegno}". Usa un numero diverso.`);
            return;
        }

        const drawingData = {
            id: this.currentEditId || Date.now() + Math.floor(Math.random() * 1000),
            numeroDisegno,
            dataDisegno: document.getElementById('dataDisegno').value,
            cliente: document.getElementById('cliente').value,
            cantiere: document.getElementById('cantiere').value,
            oggettoLavoro: document.getElementById('oggettoLavoro').value,
            note: document.getElementById('note').value,
            stato: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.stato || 'preventivo' :
                'preventivo',
            createdAt: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.createdAt || Date.now() :
                Date.now()
        };

        // Raccogli dati sezioni
        Object.keys(SECTIONS).forEach(key => {
            const config = SECTIONS[key];
            const raw = this.collectSectionData(key);
            drawingData[key] = this.filterEmptyEntries(raw, config.hasOrdine);
            drawingData[`${key}NonNecessario`] = document.getElementById(`${key}NonNecessario`)?.checked || false;
        });

        if (this.currentEditId) {
            const index = this.drawings.findIndex(d => d.id === this.currentEditId);
            this.drawings[index] = drawingData;
            this.toast.success('Disegno modificato!');
        } else {
            this.drawings.push(drawingData);
            this.toast.success('Nuovo disegno salvato!');
        }

        this.saveDrawings();
        this.renderTable();
        this.closeModal();
    }

    deleteDrawing(id) {
        const drawing = this.drawings.find(d => d.id === id);
        const numero = drawing ? drawing.numeroDisegno : '';
        if (confirm(`Sei sicuro di voler eliminare il disegno ${numero}?`)) {
            this.drawings = this.drawings.filter(d => d.id !== id);
            this.saveDrawings();
            this.renderTable();
            this.toast.info(`Disegno ${numero} eliminato.`);
        }
    }

    toggleCommessa(id) {
        const drawing = this.drawings.find(d => d.id === id);
        if (drawing) {
            drawing.stato = drawing.stato === 'preventivo' ? 'commessa' : 'preventivo';
            this.saveDrawings();
            this.renderTable();
            this.toast.info(`Disegno ${drawing.numeroDisegno}: ${drawing.stato === 'commessa' ? 'Commessa attivata' : 'Tornato a Preventivo'}`);
        }
    }

    // --- Formattazione celle multi-entry ---
    formatMultiEntryCell(entries, isRequired, isPreventivo, isNonNecessario, hasOrdine) {
        if (isPreventivo) return '<div class="cell-preventivo">\u{1F4CB} PREVENTIVO</div>';
        if (isNonNecessario) return '<div class="cell-na-text">N/A</div>';

        if (!entries || entries.length === 0) {
            return isRequired ? '<div class="cell-empty">\u26A0\uFE0F VUOTO</div>' : '<div class="cell-empty">-</div>';
        }

        return entries.map((entry, i) => {
            let html = '<div class="entry-cell">';

            // Numero se multipli
            if (entries.length > 1) {
                html += `<div class="entry-cell-number">#${i + 1}</div>`;
            }

            // Descrizione
            if (entry.descrizione) {
                html += `<div class="entry-cell-desc">${escapeHtml(entry.descrizione)}</div>`;
            }

            // Consegnato e data
            const hasC = entry.consegnato?.trim();
            const hasD = entry.data?.trim();

            if (hasC && hasD) {
                html += `<div class="entry-cell-info"><strong>A:</strong> ${escapeHtml(entry.consegnato)} <strong>|</strong> ${this.formatDate(entry.data)}</div>`;
            } else if (hasC) {
                html += `<div class="entry-cell-info"><strong>A:</strong> ${escapeHtml(entry.consegnato)}</div>`;
                html += `<div class="cell-warning">\u26A0\uFE0F Manca data</div>`;
            } else if (hasD) {
                html += `<div class="entry-cell-info"><strong>Data:</strong> ${this.formatDate(entry.data)}</div>`;
                html += `<div class="cell-warning">\u26A0\uFE0F Manca destinatario</div>`;
            } else {
                html += `<div class="cell-warning">\u26A0\uFE0F Non compilato</div>`;
            }

            // Ordine e arrivo (solo per RDO)
            if (hasOrdine) {
                const hasO = entry.ordine?.trim();
                const hasA = entry.arrivo?.trim();
                if (hasO || hasA) {
                    html += '<div class="entry-cell-ordine">';
                    if (hasO) html += `<span><strong>Ord:</strong> ${escapeHtml(entry.ordine)}</span>`;
                    if (hasO && hasA) html += ' | ';
                    if (hasA) html += `<span><strong>Arr:</strong> ${this.formatDate(entry.arrivo)}</span>`;
                    html += '</div>';
                } else if (isRequired) {
                    html += `<div class="cell-warning">\u26A0\uFE0F Manca ordine/arrivo</div>`;
                }
            }

            html += '</div>';
            return html;
        }).join('');
    }

    getMultiEntryCellClass(entries, isRequired, isPreventivo, isNonNecessario, hasOrdine) {
        if (isPreventivo) return 'cell-preventivo-bg';
        if (isNonNecessario) return 'cell-na';
        if (!entries || entries.length === 0) return isRequired ? 'cell-incomplete' : '';

        let allComplete = true;
        let anyData = false;

        entries.forEach(entry => {
            const hasC = entry.consegnato?.trim();
            const hasD = entry.data?.trim();
            anyData = anyData || hasC || hasD;

            if (!hasC || !hasD) allComplete = false;

            if (hasOrdine) {
                const hasO = entry.ordine?.trim();
                const hasA = entry.arrivo?.trim();
                anyData = anyData || hasO || hasA;
                if (!hasO || !hasA) allComplete = false;
            }
        });

        if (allComplete) return 'cell-complete';
        if (anyData) return 'cell-partial';
        return isRequired ? 'cell-incomplete' : '';
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('it-IT');
    }

    formatNotes(note) {
        if (!note || note.trim() === '') {
            return { html: '<div class="notes-status-none">Nessuna</div>', hasNotes: false };
        }
        return { html: '<div class="notes-status-present">Presenti</div>', hasNotes: true };
    }

    // --- Ordinamento ---
    sortDrawings(drawings) {
        const sorted = [...drawings];
        sorted.sort((a, b) => {
            let valA, valB;
            switch (this.sortColumn) {
                case 'numeroDisegno':
                    valA = a.numeroDisegno.toLowerCase(); valB = b.numeroDisegno.toLowerCase(); break;
                case 'cliente':
                    valA = (a.cliente || '').toLowerCase(); valB = (b.cliente || '').toLowerCase(); break;
                case 'cantiere':
                    valA = (a.cantiere || '').toLowerCase(); valB = (b.cantiere || '').toLowerCase(); break;
                case 'oggettoLavoro':
                    valA = (a.oggettoLavoro || '').toLowerCase(); valB = (b.oggettoLavoro || '').toLowerCase(); break;
                case 'stato':
                    valA = a.stato || ''; valB = b.stato || ''; break;
                case 'createdAt': default:
                    valA = a.createdAt || 0; valB = b.createdAt || 0; break;
            }
            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    // --- Rendering tabella ---
    renderTable(filteredDrawings = null) {
        const drawingsToRender = filteredDrawings || this.drawings;
        const sortedDrawings = this.sortDrawings(drawingsToRender);

        const countEl = document.getElementById('drawingsCount');
        if (countEl) {
            countEl.textContent = `${sortedDrawings.length} disegn${sortedDrawings.length === 1 ? 'o' : 'i'}`;
        }

        if (sortedDrawings.length === 0) {
            this.dom.tableBody.innerHTML = `
                <tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-secondary);">
                    Nessun disegno presente. Clicca su "+ Nuovo Disegno" per iniziare.
                </td></tr>`;
            return;
        }

        this.dom.tableBody.innerHTML = sortedDrawings.map(drawing => {
            const isP = drawing.stato === 'preventivo';
            const notesData = this.formatNotes(drawing.note);

            // Genera celle per ogni sezione
            const sectionCells = Object.keys(SECTIONS).map(key => {
                const config = SECTIONS[key];
                const entries = Array.isArray(drawing[key]) ? drawing[key] : [];
                const isNa = drawing[`${key}NonNecessario`] || false;
                const isRequired = !isP;
                const cls = this.getMultiEntryCellClass(entries, isRequired, isP, isNa, config.hasOrdine);
                const content = this.formatMultiEntryCell(entries, isRequired, isP, isNa, config.hasOrdine);
                return `<td class="${cls}">${content}</td>`;
            }).join('');

            return `
                <tr class="${isP ? 'row-preventivo' : ''}">
                    <td>
                        <strong>${escapeHtml(drawing.numeroDisegno)}</strong>
                        ${isP ? '<br><span class="badge-preventivo">PREVENTIVO</span>' : '<span class="badge-commessa">COMMESSA</span>'}
                    </td>
                    <td>${escapeHtml(drawing.cliente) || '-'}</td>
                    <td>${escapeHtml(drawing.cantiere) || '-'}</td>
                    <td>${escapeHtml(drawing.oggettoLavoro) || '-'}</td>
                    ${sectionCells}
                    <td class="${notesData.hasNotes ? 'cell-notes-pending' : 'cell-notes-complete'}">
                        ${notesData.html}
                    </td>
                    <td>
                        ${this.canEdit() ? `
                        <div class="actions-cell">
                            <button class="btn-toggle-commessa ${isP ? 'btn-activate' : 'btn-deactivate'}"
                                    data-action="toggle" data-id="${drawing.id}"
                                    title="${isP ? 'Attiva come Commessa' : 'Torna a Preventivo'}">
                                ${isP ? '\u{1F680} Commessa' : '\u{1F4CB} Preventivo'}
                            </button>
                            <button class="btn-edit" data-action="edit" data-id="${drawing.id}">\u270F\uFE0F Modifica</button>
                            <button class="btn-delete" data-action="delete" data-id="${drawing.id}">\u{1F5D1}\uFE0F Elimina</button>
                        </div>
                        ` : '<span style="color:var(--text-secondary);font-size:12px;">Solo lettura</span>'}
                    </td>
                </tr>`;
        }).join('');
    }

    // --- Filtri ---
    applyFilters() {
        const fNumero = this.dom.filterNumero.value.toLowerCase();
        const fCliente = this.dom.filterCliente.value.toLowerCase();
        const fCantiere = this.dom.filterCantiere.value.toLowerCase();
        const fOggetto = this.dom.filterOggetto.value.toLowerCase();

        const filtered = this.drawings.filter(d => {
            return d.numeroDisegno.toLowerCase().includes(fNumero)
                && (d.cliente || '').toLowerCase().includes(fCliente)
                && (d.cantiere || '').toLowerCase().includes(fCantiere)
                && (d.oggettoLavoro || '').toLowerCase().includes(fOggetto);
        });
        this.renderTable(filtered);
    }

    // --- Export/Import ---
    async exportData() {
        if (this.drawings.length === 0) {
            this.toast.warning('Nessun dato da esportare.');
            return;
        }

        const dataToExport = {
            exportDate: new Date().toISOString(),
            version: '3.0',
            totalDrawings: this.drawings.length,
            drawings: this.drawings
        };
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `disegni_commesse_${dateStr}.json`;

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'File JSON', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonString);
                await writable.close();
                localStorage.setItem('lastExportDate', new Date().toISOString());
                this.toast.success(`Esportati ${this.drawings.length} disegni!`);
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        const blob = new Blob([jsonString], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        localStorage.setItem('lastExportDate', new Date().toISOString());
        this.toast.success(`Esportati ${this.drawings.length} disegni in ${filename}`);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            this.toast.error('Seleziona un file JSON valido.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                let drawingsToImport;

                if (importedData.drawings && Array.isArray(importedData.drawings)) {
                    drawingsToImport = importedData.drawings;
                } else if (Array.isArray(importedData)) {
                    drawingsToImport = importedData;
                } else {
                    throw new Error('Formato file non valido');
                }

                const errors = this.validateImportedDrawings(drawingsToImport);
                if (errors.length > 0) {
                    this.toast.error(`Errori: ${errors.join(', ')}`);
                    event.target.value = '';
                    return;
                }

                // Migra tutti i disegni importati (retrocompatibilita)
                drawingsToImport = drawingsToImport.map(d => this.migrateDrawing(d));

                const currentCount = this.drawings.length;
                const importCount = drawingsToImport.length;
                let message = `Trovati ${importCount} disegni nel file.\n\n`;
                if (currentCount > 0) {
                    message += `Hai attualmente ${currentCount} disegni.\n`;
                    message += 'OK = SOSTITUISCI tutti i dati attuali\nAnnulla = Non importare';
                } else {
                    message += 'Vuoi importare questi dati?';
                }

                if (confirm(message)) {
                    this.drawings = drawingsToImport;
                    this.saveDrawings();
                    this.renderTable();
                    this.toast.success(`Importati ${importCount} disegni!`);
                }
            } catch (error) {
                this.toast.error('Il file non e un JSON valido: ' + error.message);
            }
            event.target.value = '';
        };

        reader.onerror = () => {
            this.toast.error('Errore nella lettura del file.');
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    validateImportedDrawings(drawings) {
        const errors = [];
        drawings.forEach((d, i) => {
            if (!d.id && d.id !== 0) errors.push(`Disegno ${i + 1}: manca "id"`);
            if (!d.numeroDisegno) errors.push(`Disegno ${i + 1}: manca "numeroDisegno"`);
        });
        return errors.slice(0, 5);
    }
}

window.sha256 = sha256;

let manager;
document.addEventListener('DOMContentLoaded', () => {
    manager = new DrawingsManager();
});
