# FinancePlus Mail Archive - GitHub + Streamlit AUTH FIX

Versione corretta per Streamlit Cloud basata su Gmail IMAP e **Password per app Google**.

Questa versione e' stata preparata per risolvere gli errori:

```text
Application-specific password required
[AUTHENTICATIONFAILED] Invalid credentials
```

## Perche' succede

Gmail non consente l'accesso IMAP con la password normale dell'account Google. Per app esterne serve una password specifica per app, generata dall'account Google, dopo l'attivazione della verifica in due passaggi.

## Avvio locale

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Configurazione locale sicura

Copia:

```text
.streamlit/secrets.example.toml
```

in:

```text
.streamlit/secrets.toml
```

Poi modifica:

```toml
[gmail]
email = "dangelo.danilo.pri@gmail.com"
app_password = "PASSWORD_PER_APP_16_CARATTERI"
```

`secrets.toml` e' escluso da GitHub tramite `.gitignore`.

## Configurazione Streamlit Cloud

Non caricare mai la password in GitHub.

Su Streamlit Cloud vai in:

```text
Manage app > Settings > Secrets
```

Incolla:

```toml
[gmail]
email = "dangelo.danilo.pri@gmail.com"
app_password = "PASSWORD_PER_APP_16_CARATTERI"
```

## Funzioni

| Area | Funzione |
|---|---|
| Scarico mail | Cerca mail per data, mittenti e allegati |
| Scarico multiplo | Selezione di piu' mail o tutte quelle trovate |
| Archivio | Salvataggio corpo mail e allegati in cartelle cliente/anno/mese |
| Anagrafica | Creazione automatica cliente se riconosciuto |
| Temporanea | Mail non riconosciute in `_TEMP_DA_ABBINARE` |
| Anti duplicato | MD5 su ogni allegato |
| Eliminazione sicura | Cestina solo se la mail e' gia' salvata nel database |
| Archiviazione sicura | Archivia solo se la mail e' gia' salvata nel database |
| Report | CSV e ZIP archivio |

## Nota su Streamlit Cloud

Lo spazio disco di Streamlit Cloud puo' non essere permanente dopo riavvii o redeploy. Per conservazione definitiva scarica periodicamente lo ZIP dell'archivio oppure collega in futuro Google Drive/pCloud come storage esterno.


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
