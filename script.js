// Gestione dello storage locale
class DrawingsManager {
    constructor() {
        this.drawings = this.loadDrawings();
        this.currentEditId = null;

        // Sistema utenti con ruoli diversi
        // MODIFICA LE PASSWORD QUI:
        this.users = {
            'admin': { password: 'admin123', role: 'admin', name: 'Amministratore' },
            'collaboratore': { password: 'collab123', role: 'collaboratore', name: 'Collaboratore' },
            'utente1': { password: 'utente1', role: 'visualizzatore', name: 'Utente 1' },
            'utente2': { password: 'utente2', role: 'visualizzatore', name: 'Utente 2' },
            'utente3': { password: 'utente3', role: 'visualizzatore', name: 'Utente 3' }
        };

        this.currentUser = this.loadCurrentUser();
        this.initializeEventListeners();
        this.updateUserInterface();
        this.renderTable();
    }

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
            console.log('✅ Dati salvati con successo:', this.drawings.length, 'disegni');
        } catch (error) {
            console.error('❌ ERRORE nel salvataggio:', error);
            alert('ERRORE: Impossibile salvare i dati!\n\n' +
                  'Possibili cause:\n' +
                  '1. localStorage bloccato (file:// invece di http://)\n' +
                  '2. Spazio localStorage esaurito\n\n' +
                  'Errore: ' + error.message);
        }
    }

    initializeEventListeners() {
        // Bottone nuovo disegno
        document.getElementById('addDrawingBtn').addEventListener('click', () => {
            this.openModal();
        });

        // Bottone annulla
        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.closeModal();
        });

        // Click fuori dal modal
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('modal');
            const adminModal = document.getElementById('adminModal');
            if (e.target === modal) {
                this.closeModal();
            }
            if (e.target === adminModal) {
                this.closeAdminModal();
            }
        });

        // Form submit
        document.getElementById('drawingForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDrawing();
        });

        // Toggle admin/login
        document.getElementById('toggleAdminBtn').addEventListener('click', () => {
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
            btn.addEventListener('click', () => {
                this.closeAdminModal();
            });
        });

        // Filtri
        document.getElementById('filterNumero').addEventListener('input', () => this.applyFilters());
        document.getElementById('filterCliente').addEventListener('input', () => this.applyFilters());
        document.getElementById('filterCantiere').addEventListener('input', () => this.applyFilters());
        document.getElementById('filterOggetto').addEventListener('input', () => this.applyFilters());

        // Azzera filtri
        document.getElementById('clearFilters').addEventListener('click', () => {
            document.getElementById('filterNumero').value = '';
            document.getElementById('filterCliente').value = '';
            document.getElementById('filterCantiere').value = '';
            document.getElementById('filterOggetto').value = '';
            this.applyFilters();
        });

        // Esporta dati
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });

        // Importa dati - click sul pulsante apre il file picker
        document.getElementById('importBtn').addEventListener('click', () => {
            document.getElementById('importFile').click();
        });

        // Importa dati - quando viene selezionato un file
        document.getElementById('importFile').addEventListener('change', (e) => {
            this.importData(e);
        });
    }

    openModal(drawing = null) {
        // Blocca se non può modificare
        if (!this.canEdit()) {
            if (this.isViewer()) {
                alert('⚠️ Sei un visualizzatore.\n\nPuoi solo vedere i dati, non modificarli.');
            } else {
                alert('⚠️ Devi effettuare il login per modificare i dati.');
            }
            return;
        }

        const modal = document.getElementById('modal');
        const form = document.getElementById('drawingForm');
        const title = document.getElementById('modalTitle');

        if (drawing) {
            title.textContent = 'Modifica Disegno';
            this.currentEditId = drawing.id;
            this.populateForm(drawing);
        } else {
            title.textContent = 'Nuovo Disegno';
            this.currentEditId = null;
            form.reset();
            // Suggerisci il prossimo numero
            this.suggestNextNumber();
            // Imposta la data odierna come default
            this.setTodayDate();
        }

        // Popola gli autocomplete con i valori già usati
        this.populateAutocomplete();

        modal.style.display = 'block';
        this.setFieldPermissions();
    }

    closeModal() {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('drawingForm').reset();
        this.currentEditId = null;
    }

    openAdminModal() {
        document.getElementById('adminModal').style.display = 'block';
        document.getElementById('adminPassword').value = '';
    }

    closeAdminModal() {
        document.getElementById('adminModal').style.display = 'none';
        document.getElementById('adminPassword').value = '';
    }

    checkAdminPassword() {
        const password = document.getElementById('adminPassword').value;

        // Cerca l'utente con questa password
        let foundUser = null;
        let foundUsername = null;

        for (const [username, userData] of Object.entries(this.users)) {
            if (userData.password === password) {
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
            this.renderTable(); // Aggiorna la tabella per mostrare/nascondere i pulsanti
            this.closeAdminModal();
            alert(`✅ Login effettuato!\n\nBenvenuto ${foundUser.name}!\nRuolo: ${this.getRoleDisplayName(foundUser.role)}`);
        } else {
            alert('❌ Password errata!');
            document.getElementById('adminPassword').value = '';
        }
    }

    getRoleDisplayName(role) {
        const names = {
            'admin': 'Amministratore (può modificare tutto)',
            'collaboratore': 'Collaboratore (può modificare tutto)',
            'visualizzatore': 'Visualizzatore (solo lettura)'
        };
        return names[role] || role;
    }

    canEdit() {
        // Admin e Collaboratore possono modificare
        return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'collaboratore');
    }

    isViewer() {
        // Visualizzatore può solo vedere
        return this.currentUser && this.currentUser.role === 'visualizzatore';
    }

    logout() {
        const userName = this.currentUser ? this.currentUser.name : 'Utente';
        if (confirm(`Vuoi uscire, ${userName}?`)) {
            this.currentUser = null;
            this.saveCurrentUser();
            this.updateUserInterface();
            this.renderTable(); // Aggiorna la tabella per nascondere i pulsanti
        }
    }

    updateUserInterface() {
        const userRole = document.getElementById('userRole');
        const toggleBtn = document.getElementById('toggleAdminBtn');
        const addDrawingBtn = document.getElementById('addDrawingBtn');

        if (this.currentUser) {
            // Utente loggato
            const roleIcons = {
                'admin': '👑',
                'collaboratore': '🤝',
                'visualizzatore': '👁️'
            };
            const icon = roleIcons[this.currentUser.role] || '👤';
            userRole.textContent = `${icon} ${this.currentUser.name}`;
            userRole.classList.add('admin');
            toggleBtn.textContent = '🚪 Logout';
            toggleBtn.classList.add('logout');

            // Nascondi "Nuovo Disegno" per i visualizzatori
            if (this.isViewer()) {
                addDrawingBtn.style.display = 'none';
            } else {
                addDrawingBtn.style.display = '';
            }
        } else {
            // Nessun utente loggato
            userRole.textContent = '👤 Ospite';
            userRole.classList.remove('admin');
            toggleBtn.textContent = '🔐 Login';
            toggleBtn.classList.remove('logout');
            addDrawingBtn.style.display = 'none'; // Ospiti non possono aggiungere
        }
    }

    setFieldPermissions() {
        // Tutti i campi del form
        const allFields = [
            'numeroDisegno', 'dataDisegno', 'cliente', 'cantiere', 'oggettoLavoro',
            'disegniOfficinaConsegnato', 'disegniOfficinaData',
            'disegniCantiereConsegnato', 'disegniCantiereData',
            'rdoMaterialiConsegnato', 'rdoMaterialiData',
            'rdoBulloneriaConsegnato', 'rdoBulloneriaData',
            'dxfPiastreConsegnato', 'dxfPiastreData',
            'ordineMateriali', 'arrivoMateriale',
            'ordineBulloneria', 'arrivoBulloneria',
            'note'
        ];

        if (this.canEdit()) {
            // Admin e Collaboratore: possono modificare TUTTO
            allFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.disabled = false;
                    field.style.backgroundColor = '';
                    field.style.opacity = '';
                    field.style.cursor = '';
                }
            });
        } else {
            // Visualizzatori e Ospiti: tutti i campi disabilitati
            allFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.disabled = true;
                    field.style.backgroundColor = 'var(--bg-primary)';
                    field.style.opacity = '0.6';
                    field.style.cursor = 'not-allowed';
                }
            });
        }
    }

    populateAutocomplete() {
        // Raccoglie tutti i valori unici per Cliente
        const clienti = [...new Set(this.drawings
            .map(d => d.cliente)
            .filter(c => c && c.trim() !== '')
        )].sort();

        // Raccoglie tutti i valori unici per Cantiere
        const cantieri = [...new Set(this.drawings
            .map(d => d.cantiere)
            .filter(c => c && c.trim() !== '')
        )].sort();

        // Raccoglie tutti i valori unici per "Consegnato a"
        const consegnati = new Set();
        this.drawings.forEach(d => {
            if (d.disegniOfficina?.consegnato) consegnati.add(d.disegniOfficina.consegnato.trim());
            if (d.disegniCantiere?.consegnato) consegnati.add(d.disegniCantiere.consegnato.trim());
            if (d.rdoMateriali?.consegnato) consegnati.add(d.rdoMateriali.consegnato.trim());
            if (d.rdoBulloneria?.consegnato) consegnati.add(d.rdoBulloneria.consegnato.trim());
            if (d.dxfPiastre?.consegnato) consegnati.add(d.dxfPiastre.consegnato.trim());
        });
        const consegnatiArray = [...consegnati].filter(c => c !== '').sort();

        // Popola le datalist
        this.updateDatalist('clientiList', clienti);
        this.updateDatalist('cantieriList', cantieri);
        this.updateDatalist('consegnatoList', consegnatiArray);
    }

    updateDatalist(datalistId, values) {
        const datalist = document.getElementById(datalistId);
        if (datalist) {
            datalist.innerHTML = values.map(value =>
                `<option value="${value}">`
            ).join('');
        }
    }

    suggestNextNumber() {
        const currentYear = new Date().getFullYear();
        const drawingsThisYear = this.drawings.filter(d =>
            d.numeroDisegno.includes(`/${currentYear}`)
        );

        if (drawingsThisYear.length > 0) {
            const numbers = drawingsThisYear.map(d => {
                const match = d.numeroDisegno.match(/^(\d+)\//);
                return match ? parseInt(match[1]) : 0;
            });
            const maxNumber = Math.max(...numbers);
            document.getElementById('numeroDisegno').value = `${maxNumber + 1}/${currentYear}`;
        } else {
            document.getElementById('numeroDisegno').value = `890/${currentYear}`;
        }
    }

    setTodayDate() {
        // Imposta la data odierna nel formato YYYY-MM-DD per l'input type="date"
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        document.getElementById('dataDisegno').value = `${year}-${month}-${day}`;
    }

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

    saveDrawing() {
        console.log('📝 Salvataggio in corso...');
        const drawingData = {
            id: this.currentEditId || Date.now(),
            numeroDisegno: document.getElementById('numeroDisegno').value,
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
                'preventivo', // I nuovi disegni partono come preventivi
            createdAt: this.currentEditId ?
                this.drawings.find(d => d.id === this.currentEditId)?.createdAt || Date.now() :
                Date.now()
        };

        if (this.currentEditId) {
            // Modifica esistente
            const index = this.drawings.findIndex(d => d.id === this.currentEditId);
            this.drawings[index] = drawingData;
            console.log('✏️ Disegno modificato:', drawingData.numeroDisegno);
        } else {
            // Nuovo disegno
            this.drawings.push(drawingData);
            console.log('➕ Nuovo disegno aggiunto:', drawingData.numeroDisegno);
        }

        this.saveDrawings();
        this.renderTable();
        this.closeModal();

        // Conferma visiva
        const message = this.currentEditId ? 'Disegno modificato!' : 'Disegno salvato!';
        console.log('✅', message);
    }

    deleteDrawing(id) {
        if (confirm('Sei sicuro di voler eliminare questo disegno?')) {
            this.drawings = this.drawings.filter(d => d.id !== id);
            this.saveDrawings();
            this.renderTable();
        }
    }

    toggleCommessa(id) {
        const drawing = this.drawings.find(d => d.id === id);
        if (drawing) {
            if (drawing.stato === 'preventivo') {
                drawing.stato = 'commessa';
            } else {
                drawing.stato = 'preventivo';
            }
            this.saveDrawings();
            this.renderTable();
        }
    }

    formatCellData(data, isRequired = false, isPreventivo = false, isNonNecessario = false) {
        // Se è un preventivo, mostra solo "PREVENTIVO"
        if (isPreventivo) {
            return '<div class="cell-preventivo">📋 PREVENTIVO</div>';
        }

        // Se è marcato come "Non necessario", mostra N/A in verde
        if (isNonNecessario) {
            return '<div class="cell-na-text">N/A</div>';
        }

        // Caso 1: Completamente vuoto
        if (!data || (!data.consegnato && !data.data)) {
            if (isRequired) {
                return `<div class="cell-empty">⚠️ NON CONSEGNATO</div>`;
            }
            return '<div class="cell-empty">-</div>';
        }

        // Caso 2: Parzialmente compilato (manca consegnato a OPPURE manca data)
        const hasConsegnato = data.consegnato && data.consegnato.trim() !== '';
        const hasData = data.data && data.data.trim() !== '';

        if (hasConsegnato && !hasData) {
            return `
                <div class="cell-data cell-partial">
                    <div><strong>A:</strong> ${data.consegnato}</div>
                    <div class="cell-warning">⚠️ MANCA DATA CONSEGNA</div>
                </div>
            `;
        }

        if (!hasConsegnato && hasData) {
            return `
                <div class="cell-data cell-partial">
                    <div><strong>Data:</strong> ${this.formatDate(data.data)}</div>
                    <div class="cell-warning">⚠️ MANCA DESTINATARIO</div>
                </div>
            `;
        }

        // Caso 3: Completamente compilato
        let html = '<div class="cell-data">';
        html += `<div><strong>A:</strong> ${data.consegnato}</div>`;
        html += `<div><strong>Data:</strong> ${this.formatDate(data.data)}</div>`;
        html += '</div>';
        return html;
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('it-IT');
    }

    getCellClass(data, isRequired = false, isPreventivo = false, isNonNecessario = false) {
        // Se è un preventivo, usa lo stile preventivo
        if (isPreventivo) {
            return 'cell-preventivo-bg';
        }

        // Se è marcato come "Non necessario", usa lo stile N/A (verde)
        if (isNonNecessario) {
            return 'cell-na';
        }

        // Caso 1: Completamente vuoto
        if (!data || (!data.consegnato && !data.data)) {
            return isRequired ? 'cell-incomplete' : '';
        }

        // Caso 2: Parzialmente compilato
        const hasConsegnato = data.consegnato && data.consegnato.trim() !== '';
        const hasData = data.data && data.data.trim() !== '';

        if ((hasConsegnato && !hasData) || (!hasConsegnato && hasData)) {
            return 'cell-partial';
        }

        // Caso 3: Completamente compilato
        return 'cell-complete';
    }

    // Funzioni per campi semplici con supporto N/A
    formatSimpleFieldNA(value, isRequired, isPreventivo, isNonNecessario) {
        if (isPreventivo) {
            return value || '-';
        }
        if (isNonNecessario) {
            return '<div class="cell-na-text">N/A</div>';
        }
        if (isRequired && (!value || value.trim() === '')) {
            return '<div class="cell-empty">⚠️ NON INSERITO</div>';
        }
        return value || '-';
    }

    getSimpleFieldClassNA(value, isRequired, isPreventivo, isNonNecessario) {
        if (isPreventivo) {
            return '';
        }
        if (isNonNecessario) {
            return 'cell-na';
        }
        if (isRequired) {
            if (!value || value.trim() === '') {
                return 'cell-incomplete';
            }
            return 'cell-complete';
        }
        return '';
    }

    formatNotes(note) {
        if (!note || note.trim() === '') {
            return {
                html: '<div class="notes-status-none">Nessuna</div>',
                hasNotes: false
            };
        }

        return {
            html: '<div class="notes-status-present">Presenti</div>',
            hasNotes: true
        };
    }

    formatSimpleField(value, isRequired, isPreventivo) {
        // Se è preventivo, mostra solo il valore
        if (isPreventivo) {
            return value || '-';
        }

        // Se è commessa e il campo è richiesto
        if (isRequired) {
            if (!value || value.trim() === '') {
                return '<div class="cell-empty">⚠️ NON INSERITO</div>';
            }
        }

        return value || '-';
    }

    getSimpleFieldClass(value, isRequired, isPreventivo) {
        if (isPreventivo) {
            return '';
        }

        if (isRequired) {
            if (!value || value.trim() === '') {
                return 'cell-incomplete';
            }
            return 'cell-complete';
        }

        return '';
    }

    renderTable(filteredDrawings = null) {
        const tbody = document.getElementById('tableBody');
        const drawingsToRender = filteredDrawings || this.drawings;

        // Ordina per data di creazione (più recente prima)
        const sortedDrawings = [...drawingsToRender].sort((a, b) => b.createdAt - a.createdAt);

        if (sortedDrawings.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        Nessun disegno presente. Clicca su "+ Nuovo Disegno" per iniziare.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = sortedDrawings.map(drawing => {
            // Determina se è un preventivo o una commessa
            const isPreventivo = drawing.stato === 'preventivo';
            const isDxfRequired = !isPreventivo; // DXF obbligatorio solo per commesse

            // Flag "Non Necessario" per ogni sezione
            const disegniOfficinaNa = drawing.disegniOfficinaNonNecessario || false;
            const disegniCantiereNa = drawing.disegniCantiereNonNecessario || false;
            const rdoMaterialiNa = drawing.rdoMaterialiNonNecessario || false;
            const rdoBulloneriaNa = drawing.rdoBulloneriaNonNecessario || false;
            const dxfPiastreNa = drawing.dxfPiastreNonNecessario || false;

            return `
                <tr class="${isPreventivo ? 'row-preventivo' : ''}">
                    <td>
                        <strong>${drawing.numeroDisegno}</strong>
                        ${isPreventivo ? '<br><span class="badge-preventivo">PREVENTIVO</span>' : '<span class="badge-commessa">COMMESSA</span>'}
                    </td>
                    <td>${drawing.cliente || '-'}</td>
                    <td>${drawing.cantiere || '-'}</td>
                    <td>${drawing.oggettoLavoro || '-'}</td>
                    <td class="${this.getCellClass(drawing.disegniOfficina, true, isPreventivo, disegniOfficinaNa)}">
                        ${this.formatCellData(drawing.disegniOfficina, true, isPreventivo, disegniOfficinaNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.disegniCantiere, true, isPreventivo, disegniCantiereNa)}">
                        ${this.formatCellData(drawing.disegniCantiere, true, isPreventivo, disegniCantiereNa)}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoMateriali, true, isPreventivo, rdoMaterialiNa)}">
                        ${this.formatCellData(drawing.rdoMateriali, true, isPreventivo, rdoMaterialiNa)}
                    </td>
                    <td class="${this.getSimpleFieldClassNA(drawing.ordineMateriali, !isPreventivo, isPreventivo, rdoMaterialiNa)}">
                        ${this.formatSimpleFieldNA(drawing.ordineMateriali, !isPreventivo, isPreventivo, rdoMaterialiNa)}
                    </td>
                    <td class="${this.getSimpleFieldClassNA(drawing.arrivoMateriale, !isPreventivo, isPreventivo, rdoMaterialiNa)}">
                        ${rdoMaterialiNa ? '<div class="cell-na-text">N/A</div>' :
                            (!isPreventivo && (!drawing.arrivoMateriale || drawing.arrivoMateriale.trim() === '')
                            ? '<div class="cell-empty">⚠️ NON INSERITO</div>'
                            : this.formatDate(drawing.arrivoMateriale))}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoBulloneria, true, isPreventivo, rdoBulloneriaNa)}">
                        ${this.formatCellData(drawing.rdoBulloneria, true, isPreventivo, rdoBulloneriaNa)}
                    </td>
                    <td class="${this.getSimpleFieldClassNA(drawing.ordineBulloneria, !isPreventivo, isPreventivo, rdoBulloneriaNa)}">
                        ${this.formatSimpleFieldNA(drawing.ordineBulloneria, !isPreventivo, isPreventivo, rdoBulloneriaNa)}
                    </td>
                    <td class="${this.getSimpleFieldClassNA(drawing.arrivoBulloneria, !isPreventivo, isPreventivo, rdoBulloneriaNa)}">
                        ${rdoBulloneriaNa ? '<div class="cell-na-text">N/A</div>' :
                            (!isPreventivo && (!drawing.arrivoBulloneria || drawing.arrivoBulloneria.trim() === '')
                            ? '<div class="cell-empty">⚠️ NON INSERITO</div>'
                            : this.formatDate(drawing.arrivoBulloneria))}
                    </td>
                    <td class="${this.getCellClass(drawing.dxfPiastre, isDxfRequired, isPreventivo, dxfPiastreNa)}">
                        ${this.formatCellData(drawing.dxfPiastre, isDxfRequired, isPreventivo, dxfPiastreNa)}
                    </td>
                    <td class="${(() => {
                        const notesData = this.formatNotes(drawing.note);
                        return notesData.hasNotes ? 'cell-notes-pending' : 'cell-notes-complete';
                    })()}">
                        ${this.formatNotes(drawing.note).html}
                    </td>
                    <td>
                        ${this.canEdit() ? `
                        <div class="actions-cell">
                            <button class="btn-toggle-commessa ${isPreventivo ? 'btn-activate' : 'btn-deactivate'}"
                                    onclick="manager.toggleCommessa(${drawing.id})"
                                    title="${isPreventivo ? 'Attiva come Commessa' : 'Torna a Preventivo'}">
                                ${isPreventivo ? '🚀 Attiva Commessa' : '📋 Torna a Preventivo'}
                            </button>
                            <button class="btn-edit" onclick="manager.openModal(${JSON.stringify(drawing).replace(/"/g, '&quot;')})">
                                ✏️ Modifica
                            </button>
                        </div>
                        ` : '<span style="color: var(--text-secondary); font-size: 12px;">Solo lettura</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    isCommessa(drawing) {
        // Considera una commessa se ha almeno un ordine materiali o ordine bulloneria
        return !!(drawing.ordineMateriali || drawing.ordineBulloneria);
    }

    applyFilters() {
        const filterNumero = document.getElementById('filterNumero').value.toLowerCase();
        const filterCliente = document.getElementById('filterCliente').value.toLowerCase();
        const filterCantiere = document.getElementById('filterCantiere').value.toLowerCase();
        const filterOggetto = document.getElementById('filterOggetto').value.toLowerCase();

        const filtered = this.drawings.filter(drawing => {
            const matchNumero = drawing.numeroDisegno.toLowerCase().includes(filterNumero);
            const matchCliente = drawing.cliente.toLowerCase().includes(filterCliente);
            const matchCantiere = (drawing.cantiere || '').toLowerCase().includes(filterCantiere);
            const matchOggetto = (drawing.oggettoLavoro || '').toLowerCase().includes(filterOggetto);

            return matchNumero && matchCliente && matchCantiere && matchOggetto;
        });

        this.renderTable(filtered);
    }

    async exportData() {
        if (this.drawings.length === 0) {
            alert('Nessun dato da esportare.');
            return;
        }

        // Crea il contenuto JSON formattato
        const dataToExport = {
            exportDate: new Date().toISOString(),
            version: '1.0',
            totalDrawings: this.drawings.length,
            drawings: this.drawings
        };

        const jsonString = JSON.stringify(dataToExport, null, 2);

        // Crea nome file con data
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `disegni_commesse_${dateStr}.json`;

        // Prova a usare File System Access API (Chrome/Edge) per scegliere la cartella
        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: 'File JSON',
                        accept: { 'application/json': ['.json'] }
                    }]
                });

                const writable = await handle.createWritable();
                await writable.write(jsonString);
                await writable.close();

                console.log(`📤 Esportati ${this.drawings.length} disegni`);
                alert(`Esportati con successo ${this.drawings.length} disegni!`);
                return;
            } catch (err) {
                // L'utente ha annullato o c'è stato un errore
                if (err.name === 'AbortError') {
                    return; // L'utente ha annullato, non mostrare errori
                }
                console.warn('File System Access API non disponibile, uso download tradizionale');
            }
        }

        // Fallback: download tradizionale nella cartella Download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        console.log(`📤 Esportati ${this.drawings.length} disegni in ${filename}`);
        alert(`Esportati ${this.drawings.length} disegni!\n\nFile: ${filename}\n\nNota: Per scegliere la cartella, usa Chrome o Edge.`);
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Verifica che sia un file JSON
        if (!file.name.endsWith('.json')) {
            alert('Errore: Seleziona un file JSON valido.');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                // Verifica struttura del file
                let drawingsToImport;
                if (importedData.drawings && Array.isArray(importedData.drawings)) {
                    // Nuovo formato con metadati
                    drawingsToImport = importedData.drawings;
                } else if (Array.isArray(importedData)) {
                    // Vecchio formato (array diretto)
                    drawingsToImport = importedData;
                } else {
                    throw new Error('Formato file non valido');
                }

                // Chiedi conferma prima di sovrascrivere
                const currentCount = this.drawings.length;
                const importCount = drawingsToImport.length;

                let message = `Trovati ${importCount} disegni nel file.\n\n`;
                if (currentCount > 0) {
                    message += `Hai attualmente ${currentCount} disegni.\n\n`;
                    message += 'Scegli come procedere:\n';
                    message += '- OK = SOSTITUISCI tutti i dati attuali\n';
                    message += '- Annulla = Non importare';
                } else {
                    message += 'Vuoi importare questi dati?';
                }

                if (confirm(message)) {
                    this.drawings = drawingsToImport;
                    this.saveDrawings();
                    this.renderTable();
                    alert(`Importati con successo ${importCount} disegni!`);
                    console.log(`📥 Importati ${importCount} disegni`);
                }
            } catch (error) {
                console.error('Errore importazione:', error);
                alert('Errore: Il file non è un JSON valido o ha un formato errato.\n\nDettaglio: ' + error.message);
            }

            // Reset input file per permettere di reimportare lo stesso file
            event.target.value = '';
        };

        reader.onerror = () => {
            alert('Errore nella lettura del file.');
            event.target.value = '';
        };

        reader.readAsText(file);
    }
}

// Inizializza l'applicazione
let manager;
document.addEventListener('DOMContentLoaded', () => {
    manager = new DrawingsManager();
});
