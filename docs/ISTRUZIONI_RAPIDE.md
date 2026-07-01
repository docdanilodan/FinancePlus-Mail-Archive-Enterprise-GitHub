# Istruzioni rapide

## Manuale senza clasp

1. Copia `Code.gs` in Apps Script.
2. Copia `Index.html` in un file HTML chiamato `Index` oppure `Index.html`.
3. Attiva il manifest e copia `appsscript.json`.
4. Salva.
5. Esegui `setup`.
6. Autorizza.
7. Distribuisci come Web App.

## Con GitHub e clasp

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "FinancePlus Mail Archive Enterprise"
clasp push
clasp open
```

Poi esegui `setup` e fai il deployment come Web App.

## Funzioni principali da conoscere

| Funzione | Uso |
|---|---|
| `setup` | Crea struttura Drive, Registro Master e fogli |
| `processMailNow` | Scarica email subito usando impostazioni salvate |
| `runAutomaticArchive` | Funzione usata dal trigger automatico |
| `createHourlyTrigger` | Attiva scarico automatico |
| `deleteSavedSelectedEmails` | Sposta nel cestino Gmail le email selezionate e gia salvate |
| `generateAllReports` | Genera report PDF |

## Regole operative

- I mittenti vengono presi automaticamente da Gmail.
- I clienti vengono riconosciuti automaticamente da email e allegati.
- Il foglio `Alias` e facoltativo.
- I documenti non abbinati vanno nella cartella temporanea.
- Le email eliminate vengono spostate nel cestino Gmail, non cancellate definitivamente.
