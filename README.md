# FinancePlus Mail Archive Enterprise

Web App Google Apps Script per archiviazione automatica email, allegati, clienti, mittenti, report PDF e gestione anti-duplicati.

## Funzioni principali

- Scarica email e allegati da Gmail.
- Crea automaticamente anagrafica cliente.
- Riconosce cliente da oggetto, corpo email, nome allegato e testo estratto.
- Registra automaticamente i mittenti.
- Archivia documenti in Google Drive per cliente.
- Salva i documenti non abbinati in cartella temporanea `Temporanea - Da abbinare / DA VERIFICARE`.
- Evita duplicati tramite hash MD5.
- Crea Registro Master in Google Sheet.
- Genera report PDF cliente e mittente.
- Permette eliminazione da Gmail delle email selezionate gia salvate.
- Salva le impostazioni una sola volta.
- Supporta scarico automatico tramite trigger orario.

## File principali

| File | Descrizione |
|---|---|
| `Code.gs` | Backend Apps Script: Gmail, Drive, Sheet, PDF, trigger, eliminazione email |
| `Index.html` | Dashboard Web App FinancePlus |
| `appsscript.json` | Manifest con autorizzazioni e Advanced Drive Service |
| `docs/INSTALLAZIONE_GITHUB.md` | Guida per GitHub e clasp |
| `docs/ISTRUZIONI_RAPIDE.md` | Procedura rapida |

## Installazione rapida manuale

1. Apri Google Apps Script.
2. Crea un nuovo progetto.
3. Incolla `Code.gs` nel file `Code.gs`.
4. Crea il file HTML `Index.html` e incolla il contenuto.
5. Da Impostazioni progetto attiva la visualizzazione del manifest.
6. Sostituisci `appsscript.json`.
7. Salva.
8. Esegui `setup`.
9. Autorizza Gmail, Drive, Documenti, Fogli e Trigger.
10. Distribuisci come Web App.

## Installazione GitHub con clasp

Vedi `docs/INSTALLAZIONE_GITHUB.md`.

## Primo uso nella dashboard

1. Apri il link della Web App.
2. Premi `Inizializza struttura`.
3. Salva le impostazioni una sola volta.
4. Premi `Scarica adesso`.
5. Verifica le cartelle Drive e il Registro Master.

## Note operative

Il foglio `Alias` e facoltativo. Serve solo per correggere o rafforzare il riconoscimento dei clienti quando i nomi nelle email sono abbreviati o ambigui.

I mittenti sono letti automaticamente da Gmail. Non vanno inseriti manualmente.
