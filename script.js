// ============================================================
// Gestione Disegni e Commesse - v4.0
// Salvataggio su file locale + sezioni multiple
// ============================================================

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

// --- IndexedDB per salvare il file handle ---
function openHandleDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('DrawingsFileHandleDB', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveFileHandle(handle) {
    const db = await openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'dataFile');
    return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    });
}

async function getStoredFileHandle() {
    try {
        const db = await openHandleDB();
        const tx = db.transaction('handles', 'readonly');
        const req = tx.objectStore('handles').get('dataFile');
        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function clearStoredFileHandle() {
    try {
        const db = await openHandleDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('dataFile');
    } catch { /* ignora */ }
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
        this.drawings = [];
        this.currentEditId = null;
        this.toast = new ToastManager();
        this.sortColumn = 'createdAt';
        this.sortDirection = 'desc';

        // File System Access API
        this.fileHandle = null;
        this.fileName = null;
        this.fileSupported = 'showOpenFilePicker' in window;

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
            importFile: document.getElementById('importFile'),
            fileStatus: document.getElementById('fileStatus'),
            fileConnectBtn: document.getElementById('fileConnectBtn'),
            fileDisconnectBtn: document.getElementById('fileDisconnectBtn')
        };

        this.currentUser = this.loadCurrentUser();
        this.initializeEventListeners();
        this.updateUserInterface();

        // Carica dati da localStorage come partenza, poi prova il file
        this.drawings = this.loadFromLocalStorage();
        this.renderTable();
        this.initFileStorage();
    }

    // =====================================================
    // FILE STORAGE - Salvataggio su file locale
    // =====================================================

    async initFileStorage() {
        if (!this.fileSupported) {
            this.updateFileStatus('non-supportato');
            this.toast.warning('Il tuo browser non supporta il salvataggio su file. Usa Chrome o Edge. I dati saranno salvati nel browser.');
            return;
        }

        // Prova a recuperare un handle salvato in precedenza
        const storedHandle = await getStoredFileHandle();
        if (storedHandle) {
            this.updateFileStatus('riconnetti', storedHandle.name);
        } else {
            this.updateFileStatus('disconnesso');
        }
    }

    async connectFile() {
        if (!this.fileSupported) return;

        try {
            // Chiedi all'utente di scegliere/creare il file
            const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'File dati JSON', accept: { 'application/json': ['.json'] } }],
                multiple: false
            });

            this.fileHandle = handle;
            this.fileName = handle.name;
            await saveFileHandle(handle);

            // Carica dati dal file
            await this.loadFromFile();
            this.renderTable();
            this.updateFileStatus('connesso');
            this.toast.success(`File "${this.fileName}" connesso! I dati vengono salvati sul tuo PC.`);
        } catch (err) {
            if (err.name === 'AbortError') return; // L'utente ha annullato
            this.toast.error('Errore nella connessione al file: ' + err.message);
        }
    }

    async createNewFile() {
        if (!this.fileSupported) return;

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'dati_disegni.json',
                types: [{ description: 'File dati JSON', accept: { 'application/json': ['.json'] } }]
            });

            this.fileHandle = handle;
            this.fileName = handle.name;
            await saveFileHandle(handle);

            // Salva i dati attuali nel nuovo file
            await this.saveToFile();
            this.updateFileStatus('connesso');
            this.toast.success(`File "${this.fileName}" creato! I dati vengono salvati sul tuo PC.`);
        } catch (err) {
            if (err.name === 'AbortError') return;
            this.toast.error('Errore nella creazione del file: ' + err.message);
        }
    }

    async reconnectFile() {
        const storedHandle = await getStoredFileHandle();
        if (!storedHandle) {
            this.toast.error('Nessun file salvato in precedenza.');
            this.updateFileStatus('disconnesso');
            return;
        }

        try {
            // Richiedi permesso (serve un click dell'utente)
            const permission = await storedHandle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                this.toast.warning('Permesso negato. Clicca di nuovo per autorizzare.');
                return;
            }

            this.fileHandle = storedHandle;
            this.fileName = storedHandle.name;

            await this.loadFromFile();
            this.renderTable();
            this.updateFileStatus('connesso');
            this.toast.success(`File "${this.fileName}" riconnesso!`);
        } catch (err) {
            this.toast.error('Impossibile riconnettersi al file: ' + err.message);
            this.updateFileStatus('disconnesso');
            await clearStoredFileHandle();
        }
    }

    async disconnectFile() {
        this.fileHandle = null;
        this.fileName = null;
        await clearStoredFileHandle();
        this.updateFileStatus('disconnesso');
        this.toast.info('File disconnesso. I dati restano salvati nel browser.');
    }

    async loadFromFile() {
        if (!this.fileHandle) return;

        try {
            const file = await this.fileHandle.getFile();
            const text = await file.text();

            if (!text.trim()) {
                // File vuoto: salva i dati correnti nel file
                await this.saveToFile();
                return;
            }

            const data = JSON.parse(text);
            let drawings;

            if (data.drawings && Array.isArray(data.drawings)) {
                drawings = data.drawings;
            } else if (Array.isArray(data)) {
                drawings = data;
            } else {
                throw new Error('Formato file non valido');
            }

            this.drawings = drawings.map(d => this.migrateDrawing(d));

            // Sincronizza anche con localStorage come backup
            this.saveToLocalStorage();
        } catch (err) {
            this.toast.error('Errore lettura file: ' + err.message);
            throw err;
        }
    }

    async saveToFile() {
        if (!this.fileHandle) return;

        try {
            const dataToSave = {
                version: '4.0',
                lastSaved: new Date().toISOString(),
                totalDrawings: this.drawings.length,
                drawings: this.drawings
            };
            const jsonString = JSON.stringify(dataToSave, null, 2);

            const writable = await this.fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
        } catch (err) {
            this.toast.error('Errore salvataggio file: ' + err.message);
            console.error('Errore saveToFile:', err);
        }
    }

    updateFileStatus(status, fileName) {
        const statusEl = this.dom.fileStatus;
        const connectBtn = this.dom.fileConnectBtn;
        const disconnectBtn = this.dom.fileDisconnectBtn;

        if (!statusEl) return;

        switch (status) {
            case 'connesso':
                statusEl.innerHTML = `<span class="file-status-dot connected"></span> ${escapeHtml(this.fileName)}`;
                statusEl.className = 'file-status connected';
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = '';
                break;
            case 'riconnetti':
                statusEl.innerHTML = `<span class="file-status-dot reconnect"></span> ${escapeHtml(fileName || 'File precedente')}`;
                statusEl.className = 'file-status reconnect';
                connectBtn.textContent = '\u{1F504} Riconnetti';
                connectBtn.style.display = '';
                connectBtn.onclick = () => this.reconnectFile();
                disconnectBtn.style.display = '';
                break;
            case 'disconnesso':
                statusEl.innerHTML = '<span class="file-status-dot disconnected"></span> Non connesso';
                statusEl.className = 'file-status disconnected';
                connectBtn.textContent = '\u{1F4C1} Apri File';
                connectBtn.style.display = '';
                connectBtn.onclick = () => this.showFileModal();
                disconnectBtn.style.display = 'none';
                break;
            case 'non-supportato':
                statusEl.innerHTML = '<span class="file-status-dot disconnected"></span> Solo browser';
                statusEl.className = 'file-status disconnected';
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'none';
                break;
        }
    }

    showFileModal() {
        const modal = document.getElementById('fileModal');
        if (modal) modal.style.display = 'block';
    }

    closeFileModal() {
        const modal = document.getElementById('fileModal');
        if (modal) modal.style.display = 'none';
    }

    // =====================================================
    // STORAGE (localStorage come backup/fallback)
    // =====================================================

    loadFromLocalStorage() {
        const stored = localStorage.getItem('drawings');
        if (!stored) return [];
        try {
            const drawings = JSON.parse(stored);
            if (!Array.isArray(drawings)) return [];
            return drawings.map(d => this.migrateDrawing(d));
        } catch (error) {
            console.error('Errore lettura localStorage:', error);
            return [];
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('drawings', JSON.stringify(this.drawings));
            localStorage.setItem('lastSaveDate', new Date().toISOString());
        } catch (error) {
            console.error('Errore salvataggio localStorage:', error);
        }
    }

    // Salva ovunque: file locale (se connesso) + localStorage (sempre)
    async saveDrawings() {
        this.saveToLocalStorage();
        if (this.fileHandle) {
            await this.saveToFile();
        }
    }

    // =====================================================
    // MIGRAZIONE DATI
    // =====================================================

    migrateDrawing(d) {
        if (Array.isArray(d.disegniOfficina)) return d;

        const migrated = { ...d };

        ['disegniOfficina', 'disegniCantiere', 'dxfPiastre'].forEach(key => {
            const old = migrated[key];
            if (old && (old.consegnato || old.data)) {
                migrated[key] = [{ descrizione: '', consegnato: old.consegnato || '', data: old.data || '' }];
            } else {
                migrated[key] = [];
            }
        });

        const rmOld = migrated.rdoMateriali;
        if ((rmOld && (rmOld.consegnato || rmOld.data)) || migrated.ordineMateriali || migrated.arrivoMateriale) {
            migrated.rdoMateriali = [{
                descrizione: '', consegnato: rmOld?.consegnato || '', data: rmOld?.data || '',
                ordine: migrated.ordineMateriali || '', arrivo: migrated.arrivoMateriale || ''
            }];
        } else {
            migrated.rdoMateriali = [];
        }
        delete migrated.ordineMateriali;
        delete migrated.arrivoMateriale;

        const rbOld = migrated.rdoBulloneria;
        if ((rbOld && (rbOld.consegnato || rbOld.data)) || migrated.ordineBulloneria || migrated.arrivoBulloneria) {
            migrated.rdoBulloneria = [{
                descrizione: '', consegnato: rbOld?.consegnato || '', data: rbOld?.data || '',
                ordine: migrated.ordineBulloneria || '', arrivo: migrated.arrivoBulloneria || ''
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
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }

    saveCurrentUser() {
        if (this.currentUser) {
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
        } else {
            localStorage.removeItem('currentUser');
        }
    }

    // =====================================================
    // EVENT LISTENERS
    // =====================================================

    initializeEventListeners() {
        this.dom.addDrawingBtn.addEventListener('click', () => this.openModal());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());

        window.addEventListener('click', (e) => {
            if (e.target === this.dom.modal) this.closeModal();
            if (e.target === this.dom.adminModal) this.closeAdminModal();
            const fileModal = document.getElementById('fileModal');
            if (e.target === fileModal) this.closeFileModal();
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.dom.modal.style.display === 'block') this.closeModal();
                if (this.dom.adminModal.style.display === 'block') this.closeAdminModal();
                const fileModal = document.getElementById('fileModal');
                if (fileModal && fileModal.style.display === 'block') this.closeFileModal();
            }
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

        // Disconnect file
        if (this.dom.fileDisconnectBtn) {
            this.dom.fileDisconnectBtn.addEventListener('click', () => this.disconnectFile());
        }

        // File modal buttons
        document.getElementById('fileOpenExisting')?.addEventListener('click', async () => {
            this.closeFileModal();
            await this.connectFile();
        });
        document.getElementById('fileCreateNew')?.addEventListener('click', async () => {
            this.closeFileModal();
            await this.createNewFile();
        });
        document.querySelectorAll('.close-file-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeFileModal());
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
                this.addEntry(addBtn.dataset.section);
                return;
            }
            const removeBtn = e.target.closest('.btn-remove-entry');
            if (removeBtn) {
                this.removeEntry(removeBtn.dataset.section, Number(removeBtn.dataset.index));
                return;
            }
        });

        // Checkbox "Non Necessario"
        Object.keys(SECTIONS).forEach(key => {
            const cb = document.getElementById(`${key}NonNecessario`);
            if (cb) {
                cb.addEventListener('change', () => this.toggleSectionDisabled(key, cb.checked));
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

    // =====================================================
    // AUTENTICAZIONE
    // =====================================================

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
        const passwordHash = await sha256(this.dom.adminPassword.value);
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

    // =====================================================
    // MODAL E FORM DINAMICO
    // =====================================================

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

    // --- Entry dinamiche ---
    renderSectionEntries(sectionKey, entries) {
        const container = document.getElementById(`${sectionKey}Entries`);
        const addBtn = document.getElementById(`${sectionKey}AddBtn`);
        if (!container) return;

        const config = SECTIONS[sectionKey];
        const data = entries || [];

        container.innerHTML = data.map((entry, i) => this.renderEntryHtml(sectionKey, i, entry)).join('');

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
        html += `<div class="entry-header"><span class="entry-label">#${index + 1}</span>`;
        html += `<button type="button" class="btn-remove-entry" data-section="${sectionKey}" data-index="${index}" title="Rimuovi">\u2715 Rimuovi</button></div>`;
        html += `<div class="form-grid">`;

        html += `<div class="form-group full-width"><label>Descrizione</label>`;
        html += `<input type="text" data-field="descrizione" value="${escapeHtml(data.descrizione || '')}" placeholder="Es: Profili HEA 200, Lamiere S355..."></div>`;

        html += `<div class="form-group"><label>Consegnato a</label>`;
        html += `<input type="text" data-field="consegnato" value="${escapeHtml(data.consegnato || '')}" list="consegnatoList"></div>`;

        html += `<div class="form-group"><label>Data</label>`;
        html += `<input type="date" data-field="data" value="${data.data || ''}"></div>`;

        if (config.hasOrdine) {
            html += `<div class="form-group"><label>Ordine</label>`;
            html += `<input type="text" data-field="ordine" value="${escapeHtml(data.ordine || '')}"></div>`;
            html += `<div class="form-group"><label>Arrivo</label>`;
            html += `<input type="date" data-field="arrivo" value="${data.arrivo || ''}"></div>`;
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
        const data = [];

        container.querySelectorAll('.entry-block').forEach(entry => {
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
        if (datalist) datalist.innerHTML = values.map(v => `<option value="${escapeHtml(v)}">`).join('');
    }

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
        document.getElementById('dataDisegno').value =
            `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    populateForm(drawing) {
        document.getElementById('numeroDisegno').value = drawing.numeroDisegno || '';
        document.getElementById('dataDisegno').value = drawing.dataDisegno || '';
        document.getElementById('cliente').value = drawing.cliente || '';
        document.getElementById('cantiere').value = drawing.cantiere || '';
        document.getElementById('oggettoLavoro').value = drawing.oggettoLavoro || '';
        document.getElementById('note').value = drawing.note || '';

        Object.keys(SECTIONS).forEach(key => {
            const entries = Array.isArray(drawing[key]) ? drawing[key] : [];
            const naCheckbox = document.getElementById(`${key}NonNecessario`);
            const isNa = drawing[`${key}NonNecessario`] || false;
            if (naCheckbox) naCheckbox.checked = isNa;
            this.renderSectionEntries(key, entries.length > 0 ? entries : [{}]);
            this.toggleSectionDisabled(key, isNa);
        });
    }

    // =====================================================
    // OPERAZIONI DATI
    // =====================================================

    async saveDrawing() {
        const numeroDisegno = document.getElementById('numeroDisegno').value.trim();

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
                this.drawings.find(d => d.id === this.currentEditId)?.stato || 'preventivo' : 'preventivo',
            createdAt: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.createdAt || Date.now() : Date.now()
        };

        Object.keys(SECTIONS).forEach(key => {
            const config = SECTIONS[key];
            drawingData[key] = this.filterEmptyEntries(this.collectSectionData(key), config.hasOrdine);
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

        await this.saveDrawings();
        this.renderTable();
        this.closeModal();
    }

    async deleteDrawing(id) {
        const drawing = this.drawings.find(d => d.id === id);
        const numero = drawing ? drawing.numeroDisegno : '';
        if (confirm(`Sei sicuro di voler eliminare il disegno ${numero}?`)) {
            this.drawings = this.drawings.filter(d => d.id !== id);
            await this.saveDrawings();
            this.renderTable();
            this.toast.info(`Disegno ${numero} eliminato.`);
        }
    }

    async toggleCommessa(id) {
        const drawing = this.drawings.find(d => d.id === id);
        if (drawing) {
            drawing.stato = drawing.stato === 'preventivo' ? 'commessa' : 'preventivo';
            await this.saveDrawings();
            this.renderTable();
            this.toast.info(`Disegno ${drawing.numeroDisegno}: ${drawing.stato === 'commessa' ? 'Commessa attivata' : 'Tornato a Preventivo'}`);
        }
    }

    // =====================================================
    // FORMATTAZIONE CELLE
    // =====================================================

    formatMultiEntryCell(entries, isRequired, isPreventivo, isNonNecessario, hasOrdine) {
        if (isPreventivo) return '<div class="cell-preventivo">\u{1F4CB} PREVENTIVO</div>';
        if (isNonNecessario) return '<div class="cell-na-text">N/A</div>';
        if (!entries || entries.length === 0) {
            return isRequired ? '<div class="cell-empty">\u26A0\uFE0F VUOTO</div>' : '<div class="cell-empty">-</div>';
        }

        return entries.map((entry, i) => {
            let html = '<div class="entry-cell">';
            if (entries.length > 1) html += `<div class="entry-cell-number">#${i + 1}</div>`;
            if (entry.descrizione) html += `<div class="entry-cell-desc">${escapeHtml(entry.descrizione)}</div>`;

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

    // =====================================================
    // ORDINAMENTO E RENDERING
    // =====================================================

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

    renderTable(filteredDrawings = null) {
        const drawingsToRender = filteredDrawings || this.drawings;
        const sortedDrawings = this.sortDrawings(drawingsToRender);

        const countEl = document.getElementById('drawingsCount');
        if (countEl) countEl.textContent = `${sortedDrawings.length} disegn${sortedDrawings.length === 1 ? 'o' : 'i'}`;

        if (sortedDrawings.length === 0) {
            this.dom.tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text-secondary);">
                Nessun disegno presente. Clicca su "+ Nuovo Disegno" per iniziare.</td></tr>`;
            return;
        }

        this.dom.tableBody.innerHTML = sortedDrawings.map(drawing => {
            const isP = drawing.stato === 'preventivo';
            const notesData = this.formatNotes(drawing.note);

            const sectionCells = Object.keys(SECTIONS).map(key => {
                const config = SECTIONS[key];
                const entries = Array.isArray(drawing[key]) ? drawing[key] : [];
                const isNa = drawing[`${key}NonNecessario`] || false;
                const cls = this.getMultiEntryCellClass(entries, !isP, isP, isNa, config.hasOrdine);
                const content = this.formatMultiEntryCell(entries, !isP, isP, isNa, config.hasOrdine);
                return `<td class="${cls}">${content}</td>`;
            }).join('');

            return `
                <tr class="${isP ? 'row-preventivo' : ''}">
                    <td><strong>${escapeHtml(drawing.numeroDisegno)}</strong>
                        ${isP ? '<br><span class="badge-preventivo">PREVENTIVO</span>' : '<span class="badge-commessa">COMMESSA</span>'}</td>
                    <td>${escapeHtml(drawing.cliente) || '-'}</td>
                    <td>${escapeHtml(drawing.cantiere) || '-'}</td>
                    <td>${escapeHtml(drawing.oggettoLavoro) || '-'}</td>
                    ${sectionCells}
                    <td class="${notesData.hasNotes ? 'cell-notes-pending' : 'cell-notes-complete'}">${notesData.html}</td>
                    <td>${this.canEdit() ? `
                        <div class="actions-cell">
                            <button class="btn-toggle-commessa ${isP ? 'btn-activate' : 'btn-deactivate'}"
                                data-action="toggle" data-id="${drawing.id}"
                                title="${isP ? 'Attiva come Commessa' : 'Torna a Preventivo'}">
                                ${isP ? '\u{1F680} Commessa' : '\u{1F4CB} Preventivo'}</button>
                            <button class="btn-edit" data-action="edit" data-id="${drawing.id}">\u270F\uFE0F Modifica</button>
                            <button class="btn-delete" data-action="delete" data-id="${drawing.id}">\u{1F5D1}\uFE0F Elimina</button>
                        </div>` : '<span style="color:var(--text-secondary);font-size:12px;">Solo lettura</span>'}</td>
                </tr>`;
        }).join('');
    }

    applyFilters() {
        const fN = this.dom.filterNumero.value.toLowerCase();
        const fC = this.dom.filterCliente.value.toLowerCase();
        const fCa = this.dom.filterCantiere.value.toLowerCase();
        const fO = this.dom.filterOggetto.value.toLowerCase();

        const filtered = this.drawings.filter(d => {
            return d.numeroDisegno.toLowerCase().includes(fN)
                && (d.cliente || '').toLowerCase().includes(fC)
                && (d.cantiere || '').toLowerCase().includes(fCa)
                && (d.oggettoLavoro || '').toLowerCase().includes(fO);
        });
        this.renderTable(filtered);
    }

    // =====================================================
    // EXPORT / IMPORT
    // =====================================================

    async exportData() {
        if (this.drawings.length === 0) {
            this.toast.warning('Nessun dato da esportare.');
            return;
        }

        const dataToExport = {
            exportDate: new Date().toISOString(),
            version: '4.0',
            totalDrawings: this.drawings.length,
            drawings: this.drawings
        };
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const filename = `disegni_commesse_${new Date().toISOString().split('T')[0]}.json`;

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{ description: 'File JSON', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(jsonString);
                await writable.close();
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
        this.toast.success(`Esportati ${this.drawings.length} disegni!`);
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

                drawingsToImport = drawingsToImport.map(d => this.migrateDrawing(d));

                const currentCount = this.drawings.length;
                let message = `Trovati ${drawingsToImport.length} disegni nel file.\n\n`;
                if (currentCount > 0) {
                    message += `Hai attualmente ${currentCount} disegni.\n`;
                    message += 'OK = SOSTITUISCI tutti i dati attuali\nAnnulla = Non importare';
                } else {
                    message += 'Vuoi importare questi dati?';
                }

                if (confirm(message)) {
                    this.drawings = drawingsToImport;
                    this.saveDrawings(); // async, errori gestiti internamente
                    this.renderTable();
                    this.toast.success(`Importati ${drawingsToImport.length} disegni!`);
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
