// ============================================================
// Gestione Disegni e Commesse - v2.0
// ============================================================

// --- Utility: sanitizzazione HTML per prevenire XSS ---
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, ch => map[ch]);
}

// --- Utility: hash SHA-256 per password ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Sistema Toast (notifiche non bloccanti) ---
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

        // Ordinamento tabella
        this.sortColumn = 'createdAt';
        this.sortDirection = 'desc';

        // Password hash SHA-256 (per generare un nuovo hash: aprire la console e digitare sha256('nuovaPassword'))
        // admin123, collab123, utente1, utente2, utente3
        this.users = {
            'admin': { hash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', role: 'admin', name: 'Amministratore' },
            'collaboratore': { hash: 'e3e4116aa49f779d0c96ae6eaa7a6b29da6fd0ef73d85b187471aeabc3b25428', role: 'collaboratore', name: 'Collaboratore' },
            'utente1': { hash: '9cdee5050fb57181e54646f487753dde73bc8e8c73843de92d01427420c64c23', role: 'visualizzatore', name: 'Utente 1' },
            'utente2': { hash: 'df21b1245419763295b2d582072ada296c09b458227f6176d36634c88c179a91', role: 'visualizzatore', name: 'Utente 2' },
            'utente3': { hash: 'd7843fc12f2260537ce74087e09f296cab80c1b4b1e8c5eb2d1b6250b5f5ce51', role: 'visualizzatore', name: 'Utente 3' }
        };

        // Cache dei riferimenti DOM
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

    // --- Storage ---
    loadDrawings() {
        const stored = localStorage.getItem('drawings');
        return stored ? JSON.parse(stored) : [];
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

    // --- Promemoria backup ---
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
        // Nuovo disegno
        this.dom.addDrawingBtn.addEventListener('click', () => this.openModal());

        // Annulla modal
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());

        // Click fuori dal modal
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.modal) this.closeModal();
            if (e.target === this.dom.adminModal) this.closeAdminModal();
        });

        // Form submit
        this.dom.drawingForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDrawing();
        });

        // Login/Logout
        this.dom.toggleAdminBtn.addEventListener('click', () => {
            if (this.currentUser) {
                this.logout();
            } else {
                this.openAdminModal();
            }
        });

        // Admin form
        document.getElementById('adminForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.checkAdminPassword();
        });

        // Chiudi admin modal
        document.querySelectorAll('.close-admin').forEach(btn => {
            btn.addEventListener('click', () => this.closeAdminModal());
        });

        // Filtri
        this.dom.filterNumero.addEventListener('input', () => this.applyFilters());
        this.dom.filterCliente.addEventListener('input', () => this.applyFilters());
        this.dom.filterCantiere.addEventListener('input', () => this.applyFilters());
        this.dom.filterOggetto.addEventListener('input', () => this.applyFilters());

        // Azzera filtri
        document.getElementById('clearFilters').addEventListener('click', () => {
            this.dom.filterNumero.value = '';
            this.dom.filterCliente.value = '';
            this.dom.filterCantiere.value = '';
            this.dom.filterOggetto.value = '';
            this.applyFilters();
        });

        // Esporta/Importa
        this.dom.exportBtn.addEventListener('click', () => this.exportData());
        this.dom.importBtn.addEventListener('click', () => this.dom.importFile.click());
        this.dom.importFile.addEventListener('change', (e) => this.importData(e));

        // Event delegation per pulsanti nella tabella (elimina inline onclick)
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

        // Ordinamento colonne (click sugli header)
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

        // Checkbox "Non Necessario" - disabilita campi corrispondenti
        const naCheckboxes = [
            { checkbox: 'disegniOfficinaNonNecessario', fields: ['disegniOfficinaConsegnato', 'disegniOfficinaData'] },
            { checkbox: 'disegniCantiereNonNecessario', fields: ['disegniCantiereConsegnato', 'disegniCantiereData'] },
            { checkbox: 'rdoMaterialiNonNecessario', fields: ['rdoMaterialiConsegnato', 'rdoMaterialiData', 'ordineMateriali', 'arrivoMateriale'] },
            { checkbox: 'rdoBulloneriaNonNecessario', fields: ['rdoBulloneriaConsegnato', 'rdoBulloneriaData', 'ordineBulloneria', 'arrivoBulloneria'] },
            { checkbox: 'dxfPiastreNonNecessario', fields: ['dxfPiastreConsegnato', 'dxfPiastreData'] }
        ];
        naCheckboxes.forEach(({ checkbox, fields }) => {
            const cb = document.getElementById(checkbox);
            if (cb) {
                cb.addEventListener('change', () => {
                    fields.forEach(fieldId => {
                        const field = document.getElementById(fieldId);
                        if (field) {
                            field.disabled = cb.checked;
                            field.style.opacity = cb.checked ? '0.4' : '';
                            if (cb.checked) field.value = '';
                        }
                    });
                });
            }
        });
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

        let foundUser = null;
        let foundUsername = null;

        for (const [username, userData] of Object.entries(this.users)) {
            if (userData.hash === passwordHash) {
                foundUser = userData;
                foundUsername = username;
                break;
            }
        }

        if (foundUser) {
            this.currentUser = {
                username: foundUsername,
                role: foundUser.role,
                name: foundUser.name
            };
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
        const names = {
            'admin': 'Amministratore',
            'collaboratore': 'Collaboratore',
            'visualizzatore': 'Visualizzatore (solo lettura)'
        };
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

    // --- Modal disegno ---
    openModal(drawing = null) {
        if (!this.canEdit()) {
            if (this.isViewer()) {
                this.toast.warning('Sei un visualizzatore. Puoi solo vedere i dati, non modificarli.');
            } else {
                this.toast.warning('Devi effettuare il login per modificare i dati.');
            }
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
        }

        this.populateAutocomplete();
        this.dom.modal.style.display = 'block';
        this.syncNonNecessarioFields();
    }

    closeModal() {
        this.dom.modal.style.display = 'none';
        this.dom.drawingForm.reset();
        this.currentEditId = null;
    }

    syncNonNecessarioFields() {
        // Sincronizza lo stato disabilitato dei campi in base ai checkbox "Non Necessario"
        const mappings = [
            { checkbox: 'disegniOfficinaNonNecessario', fields: ['disegniOfficinaConsegnato', 'disegniOfficinaData'] },
            { checkbox: 'disegniCantiereNonNecessario', fields: ['disegniCantiereConsegnato', 'disegniCantiereData'] },
            { checkbox: 'rdoMaterialiNonNecessario', fields: ['rdoMaterialiConsegnato', 'rdoMaterialiData', 'ordineMateriali', 'arrivoMateriale'] },
            { checkbox: 'rdoBulloneriaNonNecessario', fields: ['rdoBulloneriaConsegnato', 'rdoBulloneriaData', 'ordineBulloneria', 'arrivoBulloneria'] },
            { checkbox: 'dxfPiastreNonNecessario', fields: ['dxfPiastreConsegnato', 'dxfPiastreData'] }
        ];
        mappings.forEach(({ checkbox, fields }) => {
            const cb = document.getElementById(checkbox);
            if (cb) {
                fields.forEach(fieldId => {
                    const field = document.getElementById(fieldId);
                    if (field) {
                        field.disabled = cb.checked;
                        field.style.opacity = cb.checked ? '0.4' : '';
                    }
                });
            }
        });
    }

    // --- Autocomplete ---
    populateAutocomplete() {
        const clienti = [...new Set(this.drawings.map(d => d.cliente).filter(c => c && c.trim()))].sort();
        const cantieri = [...new Set(this.drawings.map(d => d.cantiere).filter(c => c && c.trim()))].sort();

        const consegnati = new Set();
        this.drawings.forEach(d => {
            ['disegniOfficina', 'disegniCantiere', 'rdoMateriali', 'rdoBulloneria', 'dxfPiastre'].forEach(key => {
                if (d[key]?.consegnato?.trim()) consegnati.add(d[key].consegnato.trim());
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

    // --- Numerazione automatica ---
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

        document.getElementById('disegniOfficinaConsegnato').value = drawing.disegniOfficina?.consegnato || '';
        document.getElementById('disegniOfficinaData').value = drawing.disegniOfficina?.data || '';
        document.getElementById('disegniOfficinaNonNecessario').checked = drawing.disegniOfficinaNonNecessario || false;

        document.getElementById('disegniCantiereConsegnato').value = drawing.disegniCantiere?.consegnato || '';
        document.getElementById('disegniCantiereData').value = drawing.disegniCantiere?.data || '';
        document.getElementById('disegniCantiereNonNecessario').checked = drawing.disegniCantiereNonNecessario || false;

        document.getElementById('rdoMaterialiConsegnato').value = drawing.rdoMateriali?.consegnato || '';
        document.getElementById('rdoMaterialiData').value = drawing.rdoMateriali?.data || '';
        document.getElementById('ordineMateriali').value = drawing.ordineMateriali || '';
        document.getElementById('arrivoMateriale').value = drawing.arrivoMateriale || '';
        document.getElementById('rdoMaterialiNonNecessario').checked = drawing.rdoMaterialiNonNecessario || false;

        document.getElementById('rdoBulloneriaConsegnato').value = drawing.rdoBulloneria?.consegnato || '';
        document.getElementById('rdoBulloneriaData').value = drawing.rdoBulloneria?.data || '';
        document.getElementById('ordineBulloneria').value = drawing.ordineBulloneria || '';
        document.getElementById('arrivoBulloneria').value = drawing.arrivoBulloneria || '';
        document.getElementById('rdoBulloneriaNonNecessario').checked = drawing.rdoBulloneriaNonNecessario || false;

        document.getElementById('dxfPiastreConsegnato').value = drawing.dxfPiastre?.consegnato || '';
        document.getElementById('dxfPiastreData').value = drawing.dxfPiastre?.data || '';
        document.getElementById('dxfPiastreNonNecessario').checked = drawing.dxfPiastreNonNecessario || false;

        document.getElementById('note').value = drawing.note || '';
    }

    // --- Salvataggio disegno (con controllo duplicati) ---
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
            disegniOfficina: {
                consegnato: document.getElementById('disegniOfficinaConsegnato').value,
                data: document.getElementById('disegniOfficinaData').value
            },
            disegniOfficinaNonNecessario: document.getElementById('disegniOfficinaNonNecessario').checked,
            disegniCantiere: {
                consegnato: document.getElementById('disegniCantiereConsegnato').value,
                data: document.getElementById('disegniCantiereData').value
            },
            disegniCantiereNonNecessario: document.getElementById('disegniCantiereNonNecessario').checked,
            rdoMateriali: {
                consegnato: document.getElementById('rdoMaterialiConsegnato').value,
                data: document.getElementById('rdoMaterialiData').value
            },
            rdoMaterialiNonNecessario: document.getElementById('rdoMaterialiNonNecessario').checked,
            ordineMateriali: document.getElementById('ordineMateriali').value,
            arrivoMateriale: document.getElementById('arrivoMateriale').value,
            rdoBulloneria: {
                consegnato: document.getElementById('rdoBulloneriaConsegnato').value,
                data: document.getElementById('rdoBulloneriaData').value
            },
            rdoBulloneriaNonNecessario: document.getElementById('rdoBulloneriaNonNecessario').checked,
            ordineBulloneria: document.getElementById('ordineBulloneria').value,
            arrivoBulloneria: document.getElementById('arrivoBulloneria').value,
            dxfPiastre: {
                consegnato: document.getElementById('dxfPiastreConsegnato').value,
                data: document.getElementById('dxfPiastreData').value
            },
            dxfPiastreNonNecessario: document.getElementById('dxfPiastreNonNecessario').checked,
            note: document.getElementById('note').value,
            stato: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.stato || 'preventivo' :
                'preventivo',
            createdAt: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.createdAt || Date.now() :
                Date.now()
        };

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

    // --- Eliminazione ---
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

    // --- Toggle stato ---
    toggleCommessa(id) {
        const drawing = this.drawings.find(d => d.id === id);
        if (drawing) {
            drawing.stato = drawing.stato === 'preventivo' ? 'commessa' : 'preventivo';
            this.saveDrawings();
            this.renderTable();
            this.toast.info(`Disegno ${drawing.numeroDisegno}: ${drawing.stato === 'commessa' ? 'Commessa attivata' : 'Tornato a Preventivo'}`);
        }
    }

    // --- Formattazione celle (unificata, con XSS protection) ---
    formatCellData(data, isRequired, isPreventivo, isNonNecessario) {
        if (isPreventivo) return '<div class="cell-preventivo">\u{1F4CB} PREVENTIVO</div>';
        if (isNonNecessario) return '<div class="cell-na-text">N/A</div>';

        if (!data || (!data.consegnato && !data.data)) {
            return isRequired ? '<div class="cell-empty">\u26A0\uFE0F NON CONSEGNATO</div>' : '<div class="cell-empty">-</div>';
        }

        const hasConsegnato = data.consegnato && data.consegnato.trim() !== '';
        const hasData = data.data && data.data.trim() !== '';

        if (hasConsegnato && !hasData) {
            return `<div class="cell-data cell-partial"><div><strong>A:</strong> ${escapeHtml(data.consegnato)}</div><div class="cell-warning">\u26A0\uFE0F MANCA DATA CONSEGNA</div></div>`;
        }
        if (!hasConsegnato && hasData) {
            return `<div class="cell-data cell-partial"><div><strong>Data:</strong> ${this.formatDate(data.data)}</div><div class="cell-warning">\u26A0\uFE0F MANCA DESTINATARIO</div></div>`;
        }

        return `<div class="cell-data"><div><strong>A:</strong> ${escapeHtml(data.consegnato)}</div><div><strong>Data:</strong> ${this.formatDate(data.data)}</div></div>`;
    }

    getCellClass(data, isRequired, isPreventivo, isNonNecessario) {
        if (isPreventivo) return 'cell-preventivo-bg';
        if (isNonNecessario) return 'cell-na';
        if (!data || (!data.consegnato && !data.data)) return isRequired ? 'cell-incomplete' : '';

        const hasConsegnato = data.consegnato && data.consegnato.trim() !== '';
        const hasData = data.data && data.data.trim() !== '';
        if ((hasConsegnato && !hasData) || (!hasConsegnato && hasData)) return 'cell-partial';
        return 'cell-complete';
    }

    // Unificata: formatta un campo semplice (con supporto N/A)
    formatSimpleField(value, isRequired, isPreventivo, isNonNecessario) {
        if (isNonNecessario) return '<div class="cell-na-text">N/A</div>';
        if (isPreventivo) return escapeHtml(value) || '-';
        if (isRequired && (!value || value.trim() === '')) return '<div class="cell-empty">\u26A0\uFE0F NON INSERITO</div>';
        return escapeHtml(value) || '-';
    }

    getSimpleFieldClass(value, isRequired, isPreventivo, isNonNecessario) {
        if (isNonNecessario) return 'cell-na';
        if (isPreventivo) return '';
        if (isRequired) return (!value || value.trim() === '') ? 'cell-incomplete' : 'cell-complete';
        return '';
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT');
    }

    formatDateField(value, isRequired, isPreventivo, isNonNecessario) {
        if (isNonNecessario) return '<div class="cell-na-text">N/A</div>';
        if (!isPreventivo && isRequired && (!value || value.trim() === '')) {
            return '<div class="cell-empty">\u26A0\uFE0F NON INSERITO</div>';
        }
        return this.formatDate(value);
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
                    valA = a.numeroDisegno.toLowerCase();
                    valB = b.numeroDisegno.toLowerCase();
                    break;
                case 'cliente':
                    valA = (a.cliente || '').toLowerCase();
                    valB = (b.cliente || '').toLowerCase();
                    break;
                case 'cantiere':
                    valA = (a.cantiere || '').toLowerCase();
                    valB = (b.cantiere || '').toLowerCase();
                    break;
                case 'oggettoLavoro':
                    valA = (a.oggettoLavoro || '').toLowerCase();
                    valB = (b.oggettoLavoro || '').toLowerCase();
                    break;
                case 'stato':
                    valA = a.stato || '';
                    valB = b.stato || '';
                    break;
                case 'createdAt':
                default:
                    valA = a.createdAt || 0;
                    valB = b.createdAt || 0;
                    break;
            }
            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }

    // --- Rendering tabella (con event delegation, XSS safe) ---
    renderTable(filteredDrawings = null) {
        const drawingsToRender = filteredDrawings || this.drawings;
        const sortedDrawings = this.sortDrawings(drawingsToRender);

        // Conteggio disegni
        const countEl = document.getElementById('drawingsCount');
        if (countEl) {
            countEl.textContent = `${sortedDrawings.length} disegn${sortedDrawings.length === 1 ? 'o' : 'i'}`;
        }

        if (sortedDrawings.length === 0) {
            this.dom.tableBody.innerHTML = `
                <tr><td colspan="15" style="text-align:center;padding:40px;color:var(--text-secondary);">
                    Nessun disegno presente. Clicca su "+ Nuovo Disegno" per iniziare.
                </td></tr>`;
            return;
        }

        this.dom.tableBody.innerHTML = sortedDrawings.map(drawing => {
            const isP = drawing.stato === 'preventivo';
            const oNa = drawing.disegniOfficinaNonNecessario || false;
            const cNa = drawing.disegniCantiereNonNecessario || false;
            const mNa = drawing.rdoMaterialiNonNecessario || false;
            const bNa = drawing.rdoBulloneriaNonNecessario || false;
            const dNa = drawing.dxfPiastreNonNecessario || false;
            const notesData = this.formatNotes(drawing.note);

            return `
                <tr class="${isP ? 'row-preventivo' : ''}">
                    <td>
                        <strong>${escapeHtml(drawing.numeroDisegno)}</strong>
                        ${isP ? '<br><span class="badge-preventivo">PREVENTIVO</span>' : '<span class="badge-commessa">COMMESSA</span>'}
                    </td>
                    <td>${escapeHtml(drawing.cliente) || '-'}</td>
                    <td>${escapeHtml(drawing.cantiere) || '-'}</td>
                    <td>${escapeHtml(drawing.oggettoLavoro) || '-'}</td>
                    <td class="${this.getCellClass(drawing.disegniOfficina, true, isP, oNa)}">
                        ${this.formatCellData(drawing.disegniOfficina, true, isP, oNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.disegniCantiere, true, isP, cNa)}">
                        ${this.formatCellData(drawing.disegniCantiere, true, isP, cNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoMateriali, true, isP, mNa)}">
                        ${this.formatCellData(drawing.rdoMateriali, true, isP, mNa)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.ordineMateriali, !isP, isP, mNa)}">
                        ${this.formatSimpleField(drawing.ordineMateriali, !isP, isP, mNa)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.arrivoMateriale, !isP, isP, mNa)}">
                        ${this.formatDateField(drawing.arrivoMateriale, !isP, isP, mNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoBulloneria, true, isP, bNa)}">
                        ${this.formatCellData(drawing.rdoBulloneria, true, isP, bNa)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.ordineBulloneria, !isP, isP, bNa)}">
                        ${this.formatSimpleField(drawing.ordineBulloneria, !isP, isP, bNa)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.arrivoBulloneria, !isP, isP, bNa)}">
                        ${this.formatDateField(drawing.arrivoBulloneria, !isP, isP, bNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.dxfPiastre, !isP, isP, dNa)}">
                        ${this.formatCellData(drawing.dxfPiastre, !isP, isP, dNa)}
                    </td>
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

    // --- Esportazione ---
    async exportData() {
        if (this.drawings.length === 0) {
            this.toast.warning('Nessun dato da esportare.');
            return;
        }

        const dataToExport = {
            exportDate: new Date().toISOString(),
            version: '2.0',
            totalDrawings: this.drawings.length,
            drawings: this.drawings
        };
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
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

        // Fallback download tradizionale
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

    // --- Importazione (con validazione) ---
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

                // Validazione struttura dei disegni importati
                const errors = this.validateImportedDrawings(drawingsToImport);
                if (errors.length > 0) {
                    this.toast.error(`Errori nell'importazione:\n${errors.join('\n')}`);
                    event.target.value = '';
                    return;
                }

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
                this.toast.error('Il file non e un JSON valido o ha un formato errato: ' + error.message);
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
            if (!d.id && d.id !== 0) errors.push(`Disegno ${i + 1}: manca campo "id"`);
            if (!d.numeroDisegno) errors.push(`Disegno ${i + 1}: manca campo "numeroDisegno"`);
        });
        // Limita a 5 errori per non inondare l'utente
        return errors.slice(0, 5);
    }
}

// Esponi sha256 per generare hash dalla console (utile per cambiare password)
window.sha256 = sha256;

// Inizializzazione
let manager;
document.addEventListener('DOMContentLoaded', () => {
    manager = new DrawingsManager();
});
