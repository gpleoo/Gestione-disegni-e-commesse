// Gestione dello storage locale
class DrawingsManager {
    constructor() {
        this.drawings = this.loadDrawings();
        this.currentEditId = null;
        this.initializeEventListeners();
        this.renderTable();
    }

    loadDrawings() {
        const stored = localStorage.getItem('drawings');
        return stored ? JSON.parse(stored) : [];
    }

    saveDrawings() {
        localStorage.setItem('drawings', JSON.stringify(this.drawings));
    }

    initializeEventListeners() {
        // Bottone nuovo disegno
        document.getElementById('addDrawingBtn').addEventListener('click', () => {
            this.openModal();
        });

        // Chiusura modal
        document.querySelector('.close').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.closeModal();
        });

        // Click fuori dal modal
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('modal');
            if (e.target === modal) {
                this.closeModal();
            }
        });

        // Form submit
        document.getElementById('drawingForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveDrawing();
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
    }

    openModal(drawing = null) {
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
        }

        modal.style.display = 'block';
    }

    closeModal() {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('drawingForm').reset();
        this.currentEditId = null;
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
            document.getElementById('numeroDisegno').value = `1/${currentYear}`;
        }
    }

    populateForm(drawing) {
        document.getElementById('numeroDisegno').value = drawing.numeroDisegno || '';
        document.getElementById('cliente').value = drawing.cliente || '';
        document.getElementById('cantiere').value = drawing.cantiere || '';
        document.getElementById('oggettoLavoro').value = drawing.oggettoLavoro || '';

        document.getElementById('disegniOfficinaConsegnato').value = drawing.disegniOfficina?.consegnato || '';
        document.getElementById('disegniOfficinaData').value = drawing.disegniOfficina?.data || '';

        document.getElementById('disegniCantiereConsegnato').value = drawing.disegniCantiere?.consegnato || '';
        document.getElementById('disegniCantiereData').value = drawing.disegniCantiere?.data || '';

        document.getElementById('rdoMaterialiConsegnato').value = drawing.rdoMateriali?.consegnato || '';
        document.getElementById('rdoMaterialiData').value = drawing.rdoMateriali?.data || '';
        document.getElementById('ordineMateriali').value = drawing.ordineMateriali || '';
        document.getElementById('arrivoMateriale').value = drawing.arrivoMateriale || '';

        document.getElementById('rdoBulloneriaConsegnato').value = drawing.rdoBulloneria?.consegnato || '';
        document.getElementById('rdoBulloneriaData').value = drawing.rdoBulloneria?.data || '';
        document.getElementById('ordineBulloneria').value = drawing.ordineBulloneria || '';
        document.getElementById('arrivoBulloneria').value = drawing.arrivoBulloneria || '';

        document.getElementById('dxfPiastreConsegnato').value = drawing.dxfPiastre?.consegnato || '';
        document.getElementById('dxfPiastreData').value = drawing.dxfPiastre?.data || '';

        document.getElementById('note').value = drawing.note || '';
    }

    saveDrawing() {
        const drawingData = {
            id: this.currentEditId || Date.now(),
            numeroDisegno: document.getElementById('numeroDisegno').value,
            cliente: document.getElementById('cliente').value,
            cantiere: document.getElementById('cantiere').value,
            oggettoLavoro: document.getElementById('oggettoLavoro').value,
            disegniOfficina: {
                consegnato: document.getElementById('disegniOfficinaConsegnato').value,
                data: document.getElementById('disegniOfficinaData').value
            },
            disegniCantiere: {
                consegnato: document.getElementById('disegniCantiereConsegnato').value,
                data: document.getElementById('disegniCantiereData').value
            },
            rdoMateriali: {
                consegnato: document.getElementById('rdoMaterialiConsegnato').value,
                data: document.getElementById('rdoMaterialiData').value
            },
            ordineMateriali: document.getElementById('ordineMateriali').value,
            arrivoMateriale: document.getElementById('arrivoMateriale').value,
            rdoBulloneria: {
                consegnato: document.getElementById('rdoBulloneriaConsegnato').value,
                data: document.getElementById('rdoBulloneriaData').value
            },
            ordineBulloneria: document.getElementById('ordineBulloneria').value,
            arrivoBulloneria: document.getElementById('arrivoBulloneria').value,
            dxfPiastre: {
                consegnato: document.getElementById('dxfPiastreConsegnato').value,
                data: document.getElementById('dxfPiastreData').value
            },
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
        } else {
            // Nuovo disegno
            this.drawings.push(drawingData);
        }

        this.saveDrawings();
        this.renderTable();
        this.closeModal();
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

    formatCellData(data, isRequired = false, isPreventivo = false) {
        // Se è un preventivo, mostra solo "PREVENTIVO"
        if (isPreventivo) {
            return '<div class="cell-preventivo">📋 PREVENTIVO</div>';
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

    getCellClass(data, isRequired = false, isPreventivo = false) {
        // Se è un preventivo, usa lo stile preventivo
        if (isPreventivo) {
            return 'cell-preventivo-bg';
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

    formatNotes(note) {
        if (!note || note.trim() === '') {
            return {
                html: '<div class="notes-status-none">NESSUNA</div>',
                hasNotes: false
            };
        }

        return {
            html: '<div class="notes-status-present">PRESENTI</div>',
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

            return `
                <tr class="${isPreventivo ? 'row-preventivo' : ''}">
                    <td>
                        <strong>${drawing.numeroDisegno}</strong>
                        ${isPreventivo ? '<br><span class="badge-preventivo">PREVENTIVO</span>' : '<span class="badge-commessa">COMMESSA</span>'}
                    </td>
                    <td>${drawing.cliente || '-'}</td>
                    <td>${drawing.cantiere || '-'}</td>
                    <td>${drawing.oggettoLavoro || '-'}</td>
                    <td class="${this.getCellClass(drawing.disegniOfficina, true, isPreventivo)}">
                        ${this.formatCellData(drawing.disegniOfficina, true, isPreventivo)}
                    </td>
                    <td class="${this.getCellClass(drawing.disegniCantiere, true, isPreventivo)}">
                        ${this.formatCellData(drawing.disegniCantiere, true, isPreventivo)}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoMateriali, true, isPreventivo)}">
                        ${this.formatCellData(drawing.rdoMateriali, true, isPreventivo)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.ordineMateriali, !isPreventivo, isPreventivo)}">
                        ${this.formatSimpleField(drawing.ordineMateriali, !isPreventivo, isPreventivo)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.arrivoMateriale, !isPreventivo, isPreventivo)}">
                        ${!isPreventivo && (!drawing.arrivoMateriale || drawing.arrivoMateriale.trim() === '')
                            ? '<div class="cell-empty">⚠️ NON INSERITO</div>'
                            : this.formatDate(drawing.arrivoMateriale)}
                    </td>
                    <td class="${this.getCellClass(drawing.rdoBulloneria, true, isPreventivo)}">
                        ${this.formatCellData(drawing.rdoBulloneria, true, isPreventivo)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.ordineBulloneria, !isPreventivo, isPreventivo)}">
                        ${this.formatSimpleField(drawing.ordineBulloneria, !isPreventivo, isPreventivo)}
                    </td>
                    <td class="${this.getSimpleFieldClass(drawing.arrivoBulloneria, !isPreventivo, isPreventivo)}">
                        ${!isPreventivo && (!drawing.arrivoBulloneria || drawing.arrivoBulloneria.trim() === '')
                            ? '<div class="cell-empty">⚠️ NON INSERITO</div>'
                            : this.formatDate(drawing.arrivoBulloneria)}
                    </td>
                    <td class="${this.getCellClass(drawing.dxfPiastre, isDxfRequired, isPreventivo)}">
                        ${this.formatCellData(drawing.dxfPiastre, isDxfRequired, isPreventivo)}
                    </td>
                    <td class="${(() => {
                        const notesData = this.formatNotes(drawing.note);
                        return notesData.hasNotes ? 'cell-notes-pending' : 'cell-notes-complete';
                    })()}">
                        ${this.formatNotes(drawing.note).html}
                    </td>
                    <td>
                        <div class="actions-cell">
                            <button class="btn-toggle-commessa ${isPreventivo ? 'btn-activate' : 'btn-deactivate'}"
                                    onclick="manager.toggleCommessa(${drawing.id})"
                                    title="${isPreventivo ? 'Attiva come Commessa' : 'Torna a Preventivo'}">
                                ${isPreventivo ? '🚀 Attiva Commessa' : '📋 Torna a Preventivo'}
                            </button>
                            <button class="btn-edit" onclick="manager.openModal(${JSON.stringify(drawing).replace(/"/g, '&quot;')})">
                                ✏️ Modifica
                            </button>
                            <button class="btn-delete" onclick="manager.deleteDrawing(${drawing.id})">
                                🗑️ Elimina
                            </button>
                        </div>
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
}

// Inizializza l'applicazione
let manager;
document.addEventListener('DOMContentLoaded', () => {
    manager = new DrawingsManager();
});
