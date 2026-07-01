# Deploy GitHub + Streamlit

## 1. Prepara repository GitHub

```bash
git init
git add .
git commit -m "FinancePlus Mail Archive auth fix"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/financeplus-mail-archive-auth-fix.git
git push -u origin main
```

## 2. Crea app su Streamlit Cloud

- New app
- Repository: quello appena creato
- Branch: main
- Main file path: app.py

## 3. Inserisci Secrets

Streamlit Cloud > Manage app > Settings > Secrets:

```toml
[gmail]
email = "dangelo.danilo.pri@gmail.com"
app_password = "PASSWORD_PER_APP_16_CARATTERI"
```

## 4. Riavvia app

Dopo i Secrets, clicca Reboot.

## 5. Test

Apri pagina:

```text
Fix errore Gmail
```

Poi vai su:

```text
Scarica mail
```

Premi:

```text
Cerca mail
```
