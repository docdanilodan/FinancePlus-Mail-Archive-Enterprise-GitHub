# Installazione da GitHub con clasp

Questa guida serve per pubblicare il progetto su GitHub e sincronizzarlo con Google Apps Script tramite `clasp`.

## 1. Requisiti

Installa Node.js, poi apri il terminale e installa clasp:

```bash
npm install -g @google/clasp
```

Accedi con il tuo account Google:

```bash
clasp login
```

## 2. Crea repository GitHub

Crea un nuovo repository, ad esempio:

```text
FinancePlus-Mail-Archive-Enterprise
```

Poi carica questi file nel repository:

```text
Code.gs
Index.html
appsscript.json
README.md
.gitignore
docs/
```

## 3. Crea nuovo progetto Apps Script da terminale

Dentro la cartella del progetto esegui:

```bash
clasp create --type webapp --title "FinancePlus Mail Archive Enterprise"
```

Questo crea il file locale `.clasp.json` con lo script ID del progetto Google.

## 4. Carica il codice su Apps Script

Esegui:

```bash
clasp push
```

## 5. Apri il progetto Apps Script

Esegui:

```bash
clasp open
```

## 6. Attiva Advanced Drive Service

In Apps Script:

1. clicca su `Servizi +`;
2. cerca `Drive API`;
3. aggiungilo;
4. verifica che nel manifest sia presente il servizio Drive v2.

## 7. Esegui setup

Nel progetto Apps Script:

1. seleziona la funzione `setup`;
2. clicca `Esegui`;
3. autorizza Gmail, Drive, Documenti, Fogli e Trigger.

## 8. Distribuisci come Web App

Vai su:

```text
Esegui il deployment > Nuovo deployment > App web
```

Imposta:

| Campo | Valore |
|---|---|
| Esegui come | Me |
| Accesso | Solo io |

Poi clicca `Distribuisci` e apri il link della Web App.

## 9. Aggiornamenti successivi

Quando modifichi i file nel repository locale:

```bash
git add .
git commit -m "Aggiornamento FinancePlus Mail Archive"
git push
clasp push
```

Poi in Apps Script aggiorna il deployment con una nuova versione.

## 10. Uso con progetto Apps Script gia esistente

Se hai gia un progetto Apps Script e vuoi collegarlo a questa cartella:

```bash
clasp clone SCRIPT_ID
```

Poi sostituisci i file con quelli di questo repository e fai:

```bash
clasp push
```

Lo `SCRIPT_ID` si trova nell'URL del progetto Apps Script.
