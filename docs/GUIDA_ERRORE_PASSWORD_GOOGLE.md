# Guida correzione errore Gmail

## Errore visto

```text
Application-specific password required
```

oppure:

```text
[AUTHENTICATIONFAILED] Invalid credentials
```

## Significato

L'app sta provando ad accedere a Gmail tramite IMAP. Gmail non accetta la password normale dell'account Google per questo tipo di accesso. Serve una **Password per app**.

## Procedura

### 1. Attiva verifica in due passaggi

Vai su Google Account > Sicurezza > Verifica in due passaggi.

### 2. Crea password per app

Vai su Google Account > Sicurezza > Password per le app.

Crea una nuova password per app con nome, ad esempio:

```text
FinancePlus Streamlit
```

Google genera una password di 16 caratteri.

### 3. Copia la password

Copia i 16 caratteri. Nell'app o nei Secrets di Streamlit inseriscila **senza spazi**.

Esempio:

```text
abcd efgh ijkl mnop
```

diventa:

```text
abcdefghijklmnop
```

### 4. Abilita IMAP in Gmail

Gmail > Impostazioni > Visualizza tutte le impostazioni > Inoltro e POP/IMAP > Attiva IMAP.

### 5. Inserisci i Secrets in Streamlit

Su Streamlit Cloud:

```text
Manage app > Settings > Secrets
```

Incolla:

```toml
[gmail]
email = "dangelo.danilo.pri@gmail.com"
app_password = "abcdefghijklmnop"
```

### 6. Riavvia app

Dopo aver salvato i Secrets, riavvia/reboot l'app Streamlit.

## Controlli se ancora non funziona

| Problema | Controllo |
|---|---|
| Invalid credentials | Password per app sbagliata o con spazi |
| Application-specific password required | Stai usando password normale Google |
| IMAP login failed | IMAP non attivo in Gmail |
| Non trovo Password per app | Verifica in due passaggi non attiva, account Workspace bloccato, oppure Advanced Protection attiva |
| Dopo cambio password Google non funziona | Le password per app vengono revocate: devi crearne una nuova |
