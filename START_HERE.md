# START HERE - FinancePlus Mail Archive AUTH FIX

Questo pacchetto corregge l'errore visto nello screenshot:

- `Application-specific password required`
- `[AUTHENTICATIONFAILED] Invalid credentials`

La causa e' una sola: Gmail non accetta la password normale dell'account. Serve una **Password per app** da 16 caratteri.

## 1. File da caricare su GitHub

Carica tutta questa cartella:

```text
FinancePlus_MailArchive_GitHub_AUTH_FIX
```

File principale Streamlit:

```text
app.py
```

## 2. Repository GitHub

Comandi rapidi:

```bash
git init
git add .
git commit -m "FinancePlus Mail Archive auth fix"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/financeplus-mail-archive-auth-fix.git
git push -u origin main
```

## 3. Streamlit Cloud

In Streamlit Cloud:

```text
New app > scegli repo GitHub > Main file path: app.py
```

Poi apri:

```text
Manage app > Settings > Secrets
```

Incolla:

```toml
[gmail]
email = "dangelo.danilo.pri@gmail.com"
app_password = "PASSWORD_PER_APP_16_CARATTERI"
```

La password per app va inserita senza spazi.

## 4. Dopo la prima configurazione

Dopo avere inserito i Secrets su Streamlit, non devi piu' reinserire email e password. L'app legge automaticamente i dati protetti da `st.secrets`.

## 5. Funzioni operative

- Cerca mail dal periodo scelto.
- Scarica piu' mail insieme.
- Salva corpo email e allegati.
- Crea automaticamente cliente in anagrafica.
- Abbina documenti al cliente.
- Mette i non riconosciuti in `archive/_TEMP_DA_ABBINARE`.
- Blocca duplicati con MD5.
- Elimina o archivia in Gmail solo le mail gia' salvate nel database.
- Esporta report CSV.
- Crea ZIP dell'archivio.


## Mittenti autorizzati

Questa versione scarica SOLO le mail provenienti da:

- elibetty731@gmail.com
- Valentinaboratto82@gmail.com
- stefano.faraone@eurofintechsrl.it
- praticheBS@proton.me
- sergio.pedolazzi@katudi.it
- paolo.baldinelli@katudi.it
- pratiche@katudi.it
- niccolo.sovico@ener2crowd.com

Vedi anche `docs/MITTENTI_AUTORIZZATI.md`.
