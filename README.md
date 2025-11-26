# 📐 Gestione Disegni e Commesse

Web app professionale per la gestione di disegni tecnici e commesse, con interfaccia dark e caratteri ben visibili.

## 🚀 Come Utilizzare

1. **Aprire l'applicazione**: Fare doppio clic su `index.html` per aprire l'app nel browser
2. L'applicazione funziona completamente offline e salva tutti i dati nel browser (localStorage)

## ✨ Funzionalità Principali

### Aggiungere un Nuovo Disegno
- Cliccare su "+ Nuovo Disegno"
- Compilare i campi richiesti (Numero Disegno e Cliente sono obbligatori)
- Il numero disegno viene suggerito automaticamente in formato progressivo (es: 910/2025)
- Salvare con il pulsante "Salva"

### Visualizzazione
- **L'ultimo disegno registrato appare sempre in alto**
- Le colonne evidenziate in **ROSSO** indicano campi non compilati (⚠️ NON CONSEGNATO)
- Le colonne evidenziate in **VERDE** indicano campi completati

### Filtri di Ricerca
- Utilizzare i campi di filtro per cercare per:
  - Numero Disegno
  - Cliente
  - Cantiere
  - Oggetto Lavoro
- I filtri funzionano in tempo reale
- Cliccare "Azzera Filtri" per rimuovere tutti i filtri

### Modificare un Disegno
- Cliccare sul pulsante "✏️ Modifica" nella riga desiderata
- Modificare i campi necessari
- Salvare le modifiche

### Eliminare un Disegno
- Cliccare sul pulsante "🗑️ Elimina" nella riga desiderata
- Confermare l'eliminazione

## 📋 Campi Speciali

Per le seguenti colonne è possibile inserire:
- **Consegnato a**: Nome del destinatario
- **Data**: Data di consegna

Colonne con consegna tracciata:
- Disegni Officina
- Disegni Cantiere
- RDO Materiali
- RDO Bulloneria
- DXF Piastre (obbligatorio solo quando il disegno diventa commessa)

## ⚙️ Note Tecniche

- **Tema**: Dark mode professionale
- **Persistenza dati**: I dati sono salvati automaticamente nel browser
- **Compatibilità**: Funziona su Chrome, Firefox, Edge, Safari
- **Offline**: Funziona senza connessione internet

## 🎨 Caratteristiche Interfaccia

- Caratteri chiari e professionali (Segoe UI)
- Evidenziazione automatica dei campi mancanti
- Tabella scorrevole per molte colonne
- Form modale per inserimento/modifica dati
- Filtri di ricerca in tempo reale

## 💾 Backup dei Dati

I dati sono salvati nel localStorage del browser. Per fare un backup:
1. Aprire la console del browser (F12)
2. Andare su "Application" > "Local Storage"
3. Copiare il valore di "drawings"

Per ripristinare:
1. Incollare il valore copiato nella stessa posizione

## 🔒 Sicurezza

- I dati rimangono sul PC locale
- Nessuna connessione a server esterni
- Privacy totale
