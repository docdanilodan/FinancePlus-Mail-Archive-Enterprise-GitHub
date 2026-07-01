import email
import hashlib
import imaplib
import os
import re
import shutil
import sqlite3
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from email import policy
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime, parseaddr
from pathlib import Path
from typing import Optional

import pandas as pd
import streamlit as st

APP_TITLE = "FinancePlus Mail Archive - Sender Lock"
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ARCHIVE_DIR = BASE_DIR / "archive"
DB_PATH = DATA_DIR / "mail_archive.db"
REPORTS_DIR = DATA_DIR / "reports"

PRIORITY_SENDERS = [
    "elibetty731@gmail.com",
    "Valentinaboratto82@gmail.com",
    "stefano.faraone@eurofintechsrl.it",
    "praticheBS@proton.me",
    "sergio.pedolazzi@katudi.it",
    "paolo.baldinelli@katudi.it",
    "pratiche@katudi.it",
    "niccolo.sovico@ener2crowd.com",
]

KNOWN_CLIENTS = [
    "BEL GARDEN EUROPE S.R.L.", "BEL GARDEN", "AFM", "HASHCOM S.R.L.", "HASHCOM",
    "RENTECH", "ROTODIS S.R.L.", "ROTODIS", "PMS", "RIGENERA ITALIA S.R.L.", "RIGENERA",
    "ETS GROUP S.R.L.", "ETS GROUP", "TEKIIN", "ROGUE DATA", "SCHIANO S.R.L.", "SCHIANO",
    "HPLUS ITALIA S.R.L.", "HPLUS", "FRANCESCO RUSSO S.R.L.", "FRANCESCO RUSSO",
    "ATLANTE MULTISERVIZI S.R.L.", "ATLANTE", "ELETTROTECNICA QUINZANO S.R.L.", "ELETTROTECNICA QUINZANO",
    "PELCOM S.R.L.", "PELCOM", "GS INDUSTRIAL", "SYRIA FRUIT", "BIOCLINIQUE", "VIVENDA",
    "FC TRASPORTI", "D HOME", "CONSILIO", "TELCONTROL", "LA TONIC", "D S GOMME", "KATI",
    "ALSOLVED", "RELAIS EROS", "ROTO SYSTEM", "ROTOSYSTEM", "FINSET", "M87", "KATUDI",
]

TEMP_CLIENT = "_TEMP_DA_ABBINARE"


@dataclass
class MailPreview:
    uid: str
    date: str
    sender: str
    subject: str
    client: str
    attachments_count: int
    snippet: str


# -------------------------
# Setup and utilities
# -------------------------

def ensure_dirs() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    ARCHIVE_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)


def init_db() -> None:
    ensure_dirs()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT UNIQUE NOT NULL,
                message_id TEXT,
                email_date TEXT,
                sender TEXT,
                subject TEXT,
                client TEXT,
                folder_path TEXT,
                saved_at TEXT NOT NULL,
                attachments_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'SAVED'
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uid TEXT NOT NULL,
                client TEXT,
                filename TEXT,
                file_path TEXT,
                md5 TEXT,
                size_bytes INTEGER,
                created_at TEXT NOT NULL,
                UNIQUE(uid, md5)
            )
            """
        )
        conn.commit()


def safe_name(value: str, fallback: str = "senza_nome") -> str:
    value = str(value or "").strip()
    value = re.sub(r"[\\/:*?\"<>|]+", "_", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = value[:150].strip(" ._")
    return value or fallback


def decode_mime(value: Optional[str]) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def normalize_text(value: str) -> str:
    value = (value or "").upper()
    replacements = {
        "À": "A", "È": "E", "É": "E", "Ì": "I", "Ò": "O", "Ù": "U",
        "'": " ", ".": " ", ",": " ", "-": " ", "_": " ", "/": " ", "\\": " ",
    }
    for k, v in replacements.items():
        value = value.replace(k, v)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def canonical_client(value: str) -> str:
    value = value.strip().upper()
    value = re.sub(r"\s+", " ", value)
    value = value.replace(" SRL", " S.R.L.") if value.endswith(" SRL") else value
    value = value.replace(" SPA", " S.P.A.") if value.endswith(" SPA") else value
    return value


def detect_client(subject: str, body: str, filenames: list[str]) -> str:
    combined = " ".join([subject or "", body or ""] + filenames)
    norm = normalize_text(combined)

    for client in KNOWN_CLIENTS:
        c_norm = normalize_text(client)
        if c_norm and c_norm in norm:
            return canonical_client(client)

    # Generic Italian company-name extraction: ACME SRL / ACME S.R.L. / ACME SPA / ACME S.P.A.
    pattern = re.compile(r"\b([A-Z0-9& ]{3,80})\s+(S\s*R\s*L|SRL|S\s*P\s*A|SPA|SAS|SNC)\b")
    m = pattern.search(norm)
    if m:
        raw = f"{m.group(1).strip()} {m.group(2).replace(' ', '')}"
        return canonical_client(raw)

    return TEMP_CLIENT


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def month_folder(base_client: str, email_dt: datetime) -> Path:
    client_folder = ARCHIVE_DIR / safe_name(base_client)
    y = str(email_dt.year)
    m = f"{email_dt.month:02d}"
    folder = client_folder / y / m
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def save_client(name: str) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            "INSERT OR IGNORE INTO clients(name, created_at) VALUES (?, ?)",
            (name, datetime.now().isoformat(timespec="seconds")),
        )
        conn.commit()


def is_saved(uid: str) -> bool:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT 1 FROM emails WHERE uid=?", (uid,)).fetchone()
    return bool(row)


def read_saved_emails() -> pd.DataFrame:
    with sqlite3.connect(DB_PATH) as conn:
        return pd.read_sql_query(
            "SELECT uid, email_date, sender, subject, client, folder_path, attachments_count, saved_at, status FROM emails ORDER BY email_date DESC",
            conn,
        )


def read_clients() -> pd.DataFrame:
    with sqlite3.connect(DB_PATH) as conn:
        return pd.read_sql_query("SELECT name, created_at FROM clients ORDER BY name", conn)


# -------------------------
# Gmail IMAP layer
# -------------------------

def get_secret_value(*names: str, default: str = "") -> str:
    for name in names:
        try:
            if "." in name:
                group, key = name.split(".", 1)
                value = st.secrets.get(group, {}).get(key, "")
            else:
                value = st.secrets.get(name, "")
            if value:
                return str(value)
        except Exception:
            pass
    return default


def clean_app_password(value: str) -> str:
    return re.sub(r"\s+", "", value or "")


def connect_imap(account_email: str, app_password: str) -> imaplib.IMAP4_SSL:
    account_email = account_email.strip()
    app_password = clean_app_password(app_password)
    if not account_email or not app_password:
        raise ValueError("Inserisci email Gmail e password per app da 16 caratteri.")

    mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
    try:
        mail.login(account_email, app_password)
        mail.select("INBOX")
        return mail
    except imaplib.IMAP4.error as exc:
        message = str(exc)
        try:
            mail.logout()
        except Exception:
            pass
        if "Application-specific password required" in message or "185833" in message:
            raise RuntimeError(
                "Gmail richiede una PASSWORD PER APP. Non usare la password normale dell'account Google. "
                "Attiva la verifica in due passaggi, crea una password per app e inserisci i 16 caratteri."
            ) from exc
        if "AUTHENTICATIONFAILED" in message.upper() or "Invalid credentials" in message:
            raise RuntimeError(
                "Credenziali Gmail non valide. Controlla: email corretta, IMAP attivo, verifica in due passaggi attiva, "
                "password per app corretta e senza spazi."
            ) from exc
        raise


def gmail_raw_query(start: date, end: date, senders: list[str], only_with_attachments: bool = True) -> str:
    # Gmail before is exclusive, so add one day to include selected end date.
    end_exclusive = end + timedelta(days=1)
    parts = [f"after:{start.strftime('%Y/%m/%d')}", f"before:{end_exclusive.strftime('%Y/%m/%d')}"]
    if only_with_attachments:
        parts.append("has:attachment")
    clean_senders = [s.strip() for s in senders if s.strip()]
    if clean_senders:
        sender_q = " OR ".join([f"from:{s}" for s in clean_senders])
        parts.append(f"({sender_q})")
    return " ".join(parts)


def imap_search_uids(mail: imaplib.IMAP4_SSL, query: str, max_results: int) -> list[str]:
    # Gmail-specific IMAP extension. Quotes are required because the query contains spaces.
    escaped = query.replace('"', '\\"')
    status, data = mail.uid("SEARCH", None, "X-GM-RAW", f'"{escaped}"')
    if status != "OK":
        raise RuntimeError(f"Ricerca Gmail non riuscita: {data}")
    uids = data[0].decode().split() if data and data[0] else []
    # Gmail returns ascending order; use latest first.
    uids = list(reversed(uids))
    return uids[:max_results]


def fetch_message(mail: imaplib.IMAP4_SSL, uid: str) -> email.message.EmailMessage:
    status, data = mail.uid("FETCH", uid, "(RFC822)")
    if status != "OK" or not data:
        raise RuntimeError(f"Impossibile leggere mail UID {uid}")
    raw = None
    for item in data:
        if isinstance(item, tuple):
            raw = item[1]
            break
    if not raw:
        raise RuntimeError(f"Mail UID {uid} vuota o non leggibile")
    return email.message_from_bytes(raw, policy=policy.default)


def parse_email_datetime(msg: email.message.EmailMessage) -> datetime:
    raw_date = msg.get("Date", "")
    try:
        dt = parsedate_to_datetime(raw_date)
        if dt.tzinfo:
            dt = dt.astimezone().replace(tzinfo=None)
        return dt
    except Exception:
        return datetime.now()


def get_text_body(msg: email.message.EmailMessage, max_chars: int = 4000) -> str:
    chunks: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment":
                try:
                    chunks.append(part.get_content())
                except Exception:
                    pass
    else:
        if msg.get_content_type() == "text/plain":
            try:
                chunks.append(msg.get_content())
            except Exception:
                pass
    text = "\n".join([c for c in chunks if c]).strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_chars]


def list_attachments(msg: email.message.EmailMessage) -> list[tuple[str, bytes, str]]:
    items: list[tuple[str, bytes, str]] = []
    for part in msg.walk():
        filename = part.get_filename()
        filename = decode_mime(filename) if filename else ""
        disposition = part.get_content_disposition()
        if filename and disposition in {"attachment", "inline", None}:
            try:
                payload = part.get_payload(decode=True)
            except Exception:
                payload = None
            if payload:
                mime = part.get_content_type() or "application/octet-stream"
                items.append((safe_name(filename), payload, mime))
    return items


def build_preview(uid: str, msg: email.message.EmailMessage) -> MailPreview:
    subject = decode_mime(msg.get("Subject", "(senza oggetto)"))
    sender = decode_mime(msg.get("From", ""))
    body = get_text_body(msg, max_chars=1200)
    attachments = list_attachments(msg)
    filenames = [name for name, _, _ in attachments]
    client = detect_client(subject, body, filenames)
    dt = parse_email_datetime(msg)
    return MailPreview(
        uid=uid,
        date=dt.isoformat(timespec="seconds"),
        sender=sender,
        subject=subject,
        client=client,
        attachments_count=len(attachments),
        snippet=body[:250],
    )


def save_email_and_attachments(uid: str, msg: email.message.EmailMessage) -> dict:
    subject = decode_mime(msg.get("Subject", "(senza oggetto)"))
    sender = decode_mime(msg.get("From", ""))
    message_id = msg.get("Message-ID", "")
    dt = parse_email_datetime(msg)
    body = get_text_body(msg, max_chars=20000)
    attachments = list_attachments(msg)
    filenames = [name for name, _, _ in attachments]
    client = detect_client(subject, body, filenames)
    save_client(client)

    folder = month_folder(client, dt)
    timestamp = dt.strftime("%Y%m%d_%H%M%S")
    email_file = folder / f"EMAIL_{timestamp}_{safe_name(subject, 'senza_oggetto')}.txt"
    email_file.write_text(
        f"Data: {dt.isoformat(timespec='seconds')}\nMittente: {sender}\nOggetto: {subject}\nCliente: {client}\nUID: {uid}\nMessage-ID: {message_id}\n\n{body}",
        encoding="utf-8",
        errors="replace",
    )

    saved_count = 0
    duplicate_count = 0
    with sqlite3.connect(DB_PATH) as conn:
        for filename, payload, _mime in attachments:
            digest = md5_bytes(payload)
            ext_path = folder / filename
            target = ext_path
            if target.exists():
                stem = target.stem
                suffix = target.suffix
                target = folder / f"{stem}_{digest[:8]}{suffix}"

            existing = conn.execute("SELECT 1 FROM documents WHERE md5=?", (digest,)).fetchone()
            if existing:
                duplicate_count += 1
                continue

            target.write_bytes(payload)
            conn.execute(
                """
                INSERT OR IGNORE INTO documents(uid, client, filename, file_path, md5, size_bytes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (uid, client, filename, str(target), digest, len(payload), datetime.now().isoformat(timespec="seconds")),
            )
            saved_count += 1

        conn.execute(
            """
            INSERT OR REPLACE INTO emails(uid, message_id, email_date, sender, subject, client, folder_path, saved_at, attachments_count, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                message_id,
                dt.isoformat(timespec="seconds"),
                sender,
                subject,
                client,
                str(folder),
                datetime.now().isoformat(timespec="seconds"),
                len(attachments),
                "SAVED",
            ),
        )
        conn.commit()

    return {
        "uid": uid,
        "client": client,
        "folder": str(folder),
        "attachments": len(attachments),
        "saved": saved_count,
        "duplicates": duplicate_count,
    }


def list_mailboxes(mail: imaplib.IMAP4_SSL) -> list[str]:
    status, boxes = mail.list()
    if status != "OK" or not boxes:
        return []
    result: list[str] = []
    for raw in boxes:
        line = raw.decode(errors="replace") if isinstance(raw, bytes) else str(raw)
        m = re.search(r'"([^"]+)"$', line)
        if m:
            result.append(m.group(1))
        else:
            result.append(line.split()[-1].strip('"'))
    return result


def find_trash_box(mail: imaplib.IMAP4_SSL) -> str:
    boxes = list_mailboxes(mail)
    preferred = ["[Gmail]/Trash", "[Google Mail]/Trash", "[Gmail]/Cestino", "[Google Mail]/Cestino", "Cestino", "Trash"]
    for name in preferred:
        if name in boxes:
            return name
    for name in boxes:
        n = name.lower()
        if "trash" in n or "cestino" in n or "deleted" in n:
            return name
    return "[Gmail]/Trash"


def trash_saved_uid(mail: imaplib.IMAP4_SSL, uid: str) -> None:
    if not is_saved(uid):
        raise RuntimeError(f"UID {uid} non risulta salvata nel database: eliminazione bloccata.")
    trash_box = find_trash_box(mail)
    status, _ = mail.uid("COPY", uid, trash_box)
    if status != "OK":
        # Fallback: mark deleted from INBOX. This is still protected by is_saved().
        mail.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
        mail.expunge()
    else:
        mail.uid("STORE", uid, "+FLAGS", "(\\Deleted)")
        mail.expunge()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE emails SET status='TRASHED' WHERE uid=?", (uid,))
        conn.commit()


def archive_saved_uid(mail: imaplib.IMAP4_SSL, uid: str) -> None:
    if not is_saved(uid):
        raise RuntimeError(f"UID {uid} non risulta salvata nel database: archiviazione bloccata.")
    # Gmail IMAP supports X-GM-LABELS. Removing Inbox label is equivalent to Archive.
    try:
        mail.uid("STORE", uid, "-X-GM-LABELS", "(\\Inbox)")
    except Exception:
        # Fallback: set seen only, do not delete.
        mail.uid("STORE", uid, "+FLAGS", "(\\Seen)")
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("UPDATE emails SET status='ARCHIVED' WHERE uid=?", (uid,))
        conn.commit()


def create_archive_zip() -> Path:
    zip_path = REPORTS_DIR / f"FinancePlus_Archivio_Mail_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in ARCHIVE_DIR.rglob("*"):
            if path.is_file():
                zf.write(path, path.relative_to(BASE_DIR))
        if DB_PATH.exists():
            zf.write(DB_PATH, DB_PATH.relative_to(BASE_DIR))
    return zip_path


# -------------------------
# Streamlit UI
# -------------------------

def header() -> None:
    st.markdown(
        """
        <div style="padding:18px;border-radius:18px;background:linear-gradient(135deg,#08233f,#0b4a74);color:white;margin-bottom:18px">
            <h1 style="margin:0">FinancePlus Mail Archive</h1>
            <p style="margin:6px 0 0 0">Mittenti bloccati + Gmail IMAP + Password per App + salvataggio automatico sicuro</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def auth_box() -> tuple[str, str]:
    default_email = get_secret_value("gmail.email", "GMAIL_EMAIL", default="")
    default_pwd = get_secret_value("gmail.app_password", "GMAIL_APP_PASSWORD", default="")

    with st.sidebar:
        st.subheader("Accesso Gmail")
        account_email = st.text_input("Email Gmail", value=default_email, placeholder="dangelo.danilo.pri@gmail.com")
        app_password = st.text_input(
            "Password per app Gmail",
            value=default_pwd,
            type="password",
            help="Usa la password per app da 16 caratteri, non la password normale Google.",
        )
        st.caption("Per non inserirla ogni volta, mettila nei Secrets di Streamlit.")
    return account_email, app_password


def page_dashboard() -> None:
    st.subheader("Dashboard")
    saved = read_saved_emails()
    clients = read_clients()
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Mail salvate", len(saved))
    c2.metric("Clienti in anagrafica", len(clients))
    c3.metric("Allegati registrati", int(saved["attachments_count"].sum()) if not saved.empty else 0)
    c4.metric("Da abbinare", int((saved["client"] == TEMP_CLIENT).sum()) if not saved.empty else 0)

    if not saved.empty:
        st.markdown("### Ultime mail salvate")
        st.dataframe(saved.head(20), use_container_width=True)


def page_download(account_email: str, app_password: str) -> None:
    st.subheader("Scarica mail e allegati")
    st.info("Errore visto nello screenshot: serve la password per app Gmail. Dopo averla messa nei Secrets, non dovrai reinserirla.")

    col1, col2, col3 = st.columns(3)
    start = col1.date_input("Da data", value=date(2026, 1, 1))
    end = col2.date_input("A data", value=date.today())
    max_results = col3.number_input("Numero massimo mail", min_value=1, max_value=500, value=50, step=10)

    st.markdown("### Mittenti autorizzati allo scarico")
    st.caption("L'app scarica SOLO le mail provenienti dagli indirizzi autorizzati sotto. Non scarica altri mittenti.")
    st.code("\n".join(PRIORITY_SENDERS), language="text")
    senders = PRIORITY_SENDERS.copy()

    only_attach = st.checkbox("Solo mail con allegati", value=True)
    query = gmail_raw_query(start, end, senders, only_attach)
    st.code(query, language="text")

    if st.button("Cerca mail", type="primary"):
        try:
            with st.spinner("Connessione Gmail e ricerca in corso..."):
                mail = connect_imap(account_email, app_password)
                uids = imap_search_uids(mail, query, int(max_results))
                previews = []
                for uid in uids:
                    msg = fetch_message(mail, uid)
                    p = build_preview(uid, msg)
                    previews.append(p.__dict__)
                mail.logout()
            st.session_state["previews"] = previews
            st.success(f"Trovate {len(previews)} mail.")
        except Exception as exc:
            st.error(str(exc))
            st.markdown("Apri `docs/GUIDA_ERRORE_PASSWORD_GOOGLE.md` nel pacchetto per la correzione passo-passo.")

    previews = st.session_state.get("previews", [])
    if previews:
        df = pd.DataFrame(previews)
        st.dataframe(df, use_container_width=True)
        labels = [f"{r['date']} | {r['sender']} | {r['client']} | {r['subject']} | UID:{r['uid']}" for r in previews]
        selected = st.multiselect("Seleziona piu mail da scaricare", labels)
        download_all = st.checkbox("Scarica tutte le mail trovate", value=False)
        selected_uids = [x.split("UID:")[-1] for x in selected]
        to_download = [r["uid"] for r in previews] if download_all else selected_uids

        col_a, col_b = st.columns(2)
        delete_after = col_a.checkbox("Dopo salvataggio, sposta le mail selezionate nel cestino Gmail", value=False)
        archive_after = col_b.checkbox("Dopo salvataggio, archivia le mail selezionate", value=False)

        if st.button("Scarica e salva selezionate", type="primary"):
            if not to_download:
                st.warning("Seleziona almeno una mail o attiva 'Scarica tutte'.")
            else:
                results = []
                errors = []
                try:
                    mail = connect_imap(account_email, app_password)
                    for uid in to_download:
                        try:
                            msg = fetch_message(mail, uid)
                            result = save_email_and_attachments(uid, msg)
                            if delete_after:
                                trash_saved_uid(mail, uid)
                                result["gmail_action"] = "TRASHED"
                            elif archive_after:
                                archive_saved_uid(mail, uid)
                                result["gmail_action"] = "ARCHIVED"
                            else:
                                result["gmail_action"] = "NONE"
                            results.append(result)
                        except Exception as exc:
                            errors.append({"uid": uid, "errore": str(exc)})
                    mail.logout()
                except Exception as exc:
                    st.error(str(exc))
                    return

                if results:
                    st.success(f"Salvate {len(results)} mail.")
                    st.dataframe(pd.DataFrame(results), use_container_width=True)
                if errors:
                    st.error("Alcune mail non sono state elaborate.")
                    st.dataframe(pd.DataFrame(errors), use_container_width=True)


def page_saved(account_email: str, app_password: str) -> None:
    st.subheader("Mail salvate: archivia/elimina solo se gia salvate")
    saved = read_saved_emails()
    if saved.empty:
        st.info("Nessuna mail salvata nel database.")
        return
    st.dataframe(saved, use_container_width=True)
    labels = [f"{r.email_date} | {r.client} | {r.subject} | UID:{r.uid}" for r in saved.itertuples()]
    selected = st.multiselect("Seleziona mail gia salvate", labels)
    selected_uids = [x.split("UID:")[-1] for x in selected]

    col1, col2 = st.columns(2)
    if col1.button("Archivia selezionate"):
        try:
            mail = connect_imap(account_email, app_password)
            for uid in selected_uids:
                archive_saved_uid(mail, uid)
            mail.logout()
            st.success(f"Archiviate {len(selected_uids)} mail.")
        except Exception as exc:
            st.error(str(exc))

    if col2.button("Sposta selezionate nel cestino", type="primary"):
        try:
            mail = connect_imap(account_email, app_password)
            for uid in selected_uids:
                trash_saved_uid(mail, uid)
            mail.logout()
            st.success(f"Spostate nel cestino {len(selected_uids)} mail.")
        except Exception as exc:
            st.error(str(exc))


def page_clients() -> None:
    st.subheader("Anagrafica clienti automatica")
    clients = read_clients()
    if clients.empty:
        st.info("Nessun cliente creato. Scarica prima le mail.")
    else:
        st.dataframe(clients, use_container_width=True)

    st.markdown("### Documenti da abbinare manualmente")
    temp_dir = ARCHIVE_DIR / TEMP_CLIENT
    if temp_dir.exists():
        rows = []
        for f in temp_dir.rglob("*"):
            if f.is_file():
                rows.append({"file": str(f.relative_to(BASE_DIR)), "size_kb": round(f.stat().st_size / 1024, 1)})
        if rows:
            st.dataframe(pd.DataFrame(rows), use_container_width=True)
        else:
            st.success("Nessun file temporaneo da abbinare.")
    else:
        st.success("Nessun file temporaneo da abbinare.")


def page_reports() -> None:
    st.subheader("Report e download archivio")
    saved = read_saved_emails()
    if saved.empty:
        st.info("Nessun dato da esportare.")
        return
    st.dataframe(saved, use_container_width=True)
    csv_data = saved.to_csv(index=False).encode("utf-8")
    st.download_button("Scarica report CSV", data=csv_data, file_name="financeplus_mail_report.csv", mime="text/csv")

    if st.button("Crea ZIP archivio locale"):
        zip_path = create_archive_zip()
        st.session_state["last_zip"] = str(zip_path)
        st.success(f"ZIP creato: {zip_path.name}")

    last_zip = st.session_state.get("last_zip")
    if last_zip and Path(last_zip).exists():
        st.download_button(
            "Scarica ZIP archivio",
            data=Path(last_zip).read_bytes(),
            file_name=Path(last_zip).name,
            mime="application/zip",
        )


def page_auth_help() -> None:
    st.subheader("Correzione errore Gmail")
    st.markdown(
        """
        L'errore dello screenshot non dipende dal tasto **Scarica Mail**. Dipende dalle credenziali Gmail.

        Devi usare una **password per app Gmail da 16 caratteri**, non la password normale del tuo account Google.

        Nei **Secrets** di Streamlit inserisci:

        ```toml
        [gmail]
        email = "dangelo.danilo.pri@gmail.com"
        app_password = "xxxxxxxxxxxxxxxx"
        ```

        Regole:
        - non inserire spazi nella password per app;
        - abilita IMAP in Gmail;
        - abilita la verifica in due passaggi dell'account Google;
        - non pubblicare mai la password dentro GitHub.
        """
    )


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, layout="wide")
    ensure_dirs()
    init_db()
    header()
    account_email, app_password = auth_box()

    page = st.sidebar.radio(
        "Menu",
        ["Dashboard", "Scarica mail", "Mail salvate", "Clienti", "Report", "Fix errore Gmail"],
    )

    if page == "Dashboard":
        page_dashboard()
    elif page == "Scarica mail":
        page_download(account_email, app_password)
    elif page == "Mail salvate":
        page_saved(account_email, app_password)
    elif page == "Clienti":
        page_clients()
    elif page == "Report":
        page_reports()
    else:
        page_auth_help()


if __name__ == "__main__":
    main()
