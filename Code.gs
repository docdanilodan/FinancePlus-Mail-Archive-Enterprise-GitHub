/***************************************************************
 * FinancePlus Mail Archive Enterprise - Google Apps Script
 * Backend Gmail + Drive + Google Sheet + PDF reports
 * Versione: 1.2 Enterprise Web App - Auto clienti/mittenti + impostazioni salvate + eliminazione email
 * Timezone: Europe/Rome
 ***************************************************************/

const CONFIG = {
  APP_NAME: 'FinancePlus Mail Archive Enterprise',
  ROOT_FOLDER_NAME: 'ARCHIVIO_EMAIL_ALLEGATI_CLIENTI_2026',
  MASTER_SPREADSHEET_NAME: 'Registro_mail_allegati_2026',
  DEFAULT_START: '2026/04/01',
  DEFAULT_END_EXCLUSIVE: '2026/06/27', // include fino al 26/06/2026
  TIMEZONE: 'Europe/Rome',
  MAX_THREADS_PER_RUN: 300,
  MAX_SEARCH_RESULTS: 300,
  MAX_REPORT_ROWS: 400,
  MAX_REPORTS_PER_RUN: 25,
  GENERATE_REPORTS_AFTER_ARCHIVE: true,
  ENABLE_TEXT_EXTRACTION: true,
  OCR_LANGUAGE: 'it',
  OCR_TEXT_MAX_CHARS: 6000,
  SNIPPET_MAX_CHARS: 900,
  AUTO_LEARN_ALIASES: true,
  DEFAULT_USE_TODAY_END: true,
  DEFAULT_TRASH_AFTER_ARCHIVE: false,
  DEFAULT_AUTO_TRIGGER_HOURS: 1,
  ALLOWED_EXTENSIONS: [
    'pdf','doc','docx','xls','xlsx','csv','txt','jpg','jpeg','png','zip','rar','7z','p7m','xml'
  ],
  SUBFOLDERS: {
    CLIENTI: 'Clienti',
    MITTENTI: 'Mittenti',
    REPORT_CLIENTI: 'Report PDF Clienti',
    REPORT_MITTENTI: 'Report PDF Mittenti',
    REGISTRO: 'Registro Master',
    LOG: 'Log Operazioni',
    DA_VERIFICARE: 'Da Verificare',
    TEMPORANEA: 'Temporanea - Da abbinare'
  }
};

const SHEETS = {
  REGISTRO: 'Registro',
  CLIENTI: 'Clienti',
  MITTENTI: 'Mittenti',
  LOG: 'Log',
  HASH: 'Hash',
  ALIAS: 'Alias',
  CONFIG: 'Configurazione'
};

const HEADERS = {
  REGISTRO: [
    'ID Riga','Gmail Message ID','Thread ID','Data Email','Ora Email','Mittente','Destinatario',
    'Oggetto','Cliente Riconosciuto','Alias Rilevato','Nome Allegato','Tipo File','Dimensione Byte',
    'Hash MD5','Stato Allegato','Cartella Drive','Link File Drive','Descrizione Corpo Mail',
    'Data Archiviazione','Note','Testo Estratto Allegato','P.IVA rilevata','Codice Fiscale rilevato','PEC rilevata','Sorgente riconoscimento','Gmail eliminata'
  ],
  CLIENTI: [
    'Cliente','Stato anagrafica','P.IVA rilevata','Codice Fiscale rilevato','PEC rilevata','Email rilevata',
    'Alias principali','Email ricevute','Allegati archiviati','Duplicati esclusi','Errori','Da verificare',
    'Spazio byte','Cartella Drive','Ultimo aggiornamento'
  ],
  MITTENTI: [
    'Mittente','Email ricevute','Allegati archiviati','Duplicati esclusi','Clienti collegati','Ultimo aggiornamento'
  ],
  LOG: ['Data','Ora','Operazione','Esito','Dettaglio'],
  HASH: ['Hash MD5','Nome Allegato','Cliente','Gmail Message ID','Link File Drive','Data Archiviazione'],
  ALIAS: ['Cliente ufficiale','Alias'],
  CONFIG: ['Parametro','Valore','Descrizione']
};

// Nessun alias cliente preimpostato.
// Gli alias vanno inseriti manualmente nel foglio "Alias" del Registro Master.
// Struttura: Cliente ufficiale | Alias
// Esempio operativo: ROSSI S.R.L. | ROSSI
const DEFAULT_ALIASES = [];

// Modalità Enterprise: gli alias NON sono obbligatori.
// Il sistema prova prima a riconoscere il cliente da alias reali eventualmente inseriti,
// poi da denominazione/ragione sociale presente in email, oggetto, nomi file e testo OCR degli allegati,
// poi da Partita IVA/Codice Fiscale. I mittenti vengono sempre presi automaticamente da Gmail.

function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(CONFIG.APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setup() {
  const root = getRootFolder_();
  Object.keys(CONFIG.SUBFOLDERS).forEach(function(k) {
    getOrCreateFolder_(root, CONFIG.SUBFOLDERS[k]);
  });
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  seedAliases_();
  initializeDefaultSettings_();
  rebuildIndexes_();
  log_('SETUP', 'OK', 'Struttura inizializzata: ' + root.getName());
  return getDashboardStats();
}

function getDashboardStats() {
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  const registro = ss.getSheetByName(SHEETS.REGISTRO);
  const clienti = ss.getSheetByName(SHEETS.CLIENTI);
  const mittenti = ss.getSheetByName(SHEETS.MITTENTI);
  const rows = getDataRows_(registro);
  const totals = rows.reduce(function(acc, r) {
    const stato = String(r[14] || '').toUpperCase();
    acc.allegati += stato === 'SCARICATO' ? 1 : 0;
    acc.duplicati += stato === 'DUPLICATO' ? 1 : 0;
    acc.errori += stato === 'ERRORE' ? 1 : 0;
    const clienteStat = String(r[8] || '').toUpperCase();
    acc.daVerificare += (clienteStat === 'DA VERIFICARE' || clienteStat.indexOf('PIVA_') === 0 || clienteStat.indexOf('CF_') === 0) ? 1 : 0;
    acc.spazio += Number(r[12] || 0);
    acc.emailSet[String(r[1] || '')] = true;
    return acc;
  }, { allegati: 0, duplicati: 0, errori: 0, daVerificare: 0, spazio: 0, emailSet: {} });

  const root = getRootFolder_();
  return {
    appName: CONFIG.APP_NAME,
    rootFolderName: CONFIG.ROOT_FOLDER_NAME,
    rootFolderUrl: root.getUrl(),
    masterUrl: ss.getUrl(),
    emailAnalizzate: Object.keys(totals.emailSet).filter(Boolean).length,
    allegatiScaricati: totals.allegati,
    duplicatiEsclusi: totals.duplicati,
    errori: totals.errori,
    daVerificare: totals.daVerificare,
    clienti: Math.max(clienti.getLastRow() - 1, 0),
    mittenti: Math.max(mittenti.getLastRow() - 1, 0),
    spazio: formatBytes_(totals.spazio),
    lastUpdate: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
  };
}

function runArchive(options) {
  setup();
  const saved = getSavedSettings();
  options = Object.assign({}, saved, options || {});
  if (options.saveAsDefault === true) saveSettings(options);

  const start = normalizeDateForGmail_(options.startDate) || CONFIG.DEFAULT_START;
  const useTodayEnd = String(options.useTodayEnd) === 'true' || options.useTodayEnd === true;
  const endExclusive = useTodayEnd ? tomorrowGmailDate_() : (normalizeDateForGmail_(options.endDateExclusive) || CONFIG.DEFAULT_END_EXCLUSIVE);
  const maxThreads = Number(options.maxThreads || CONFIG.MAX_THREADS_PER_RUN);
  const generateReports = options.generateReports === false || String(options.generateReports) === 'false' ? false : CONFIG.GENERATE_REPORTS_AFTER_ARCHIVE;
  const trashAfterArchive = options.trashAfterArchive === true || String(options.trashAfterArchive) === 'true';

  const query = 'after:' + start + ' before:' + endExclusive + ' has:attachment -in:sent -in:drafts';
  const threads = GmailApp.search(query, 0, maxThreads);

  const ss = getMasterSpreadsheet_();
  const registro = ss.getSheetByName(SHEETS.REGISTRO);
  const hashSheet = ss.getSheetByName(SHEETS.HASH);
  const knownHashes = loadKnownHashes_(hashSheet);
  const touchedClients = {};

  let processedMessages = 0;
  let processedAttachments = 0;
  let downloaded = 0;
  let duplicates = 0;
  let errors = 0;
  let gmailMovedToTrash = 0;

  threads.forEach(function(thread) {
    const messages = thread.getMessages();
    messages.forEach(function(message) {
      const msgDate = message.getDate();
      if (!isDateInside_(msgDate, start, endExclusive)) return;

      const attachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
      if (!attachments || attachments.length === 0) return;

      processedMessages++;
      const subject = message.getSubject() || '';
      const body = safePlainBody_(message);
      const from = message.getFrom() || '';
      const to = message.getTo() || '';
      const extractedTexts = attachments.map(function(att) {
        return extractTextFromAttachment_(att);
      });
      const recognition = recognizeClient_(subject, body + ' ' + extractedTexts.join(' '), attachments);
      const clientName = recognition.cliente || 'DA VERIFICARE';
      const alias = recognition.alias || '';
      if (clientName !== 'DA VERIFICARE') learnAliasesFromRecognition_(recognition);
      const clientFolder = getClientFolder_(clientName);
      touchedClients[clientName] = true;

      let messageCanBeMovedToTrash = trashAfterArchive;
      let messageHasSavedOrDuplicate = false;

      attachments.forEach(function(blob, attIndex) {
        processedAttachments++;
        const originalName = blob.getName() || 'allegato_senza_nome';
        const ext = getExtension_(originalName);
        const rowBase = buildRowBase_(message, thread, recognition, originalName, ext, blob.getBytes().length, body, extractedTexts[attIndex] || '');

        try {
          if (!isAllowedFile_(originalName)) {
            appendRegistroRow_(registro, rowBase, '', 'ERRORE', clientFolder.getUrl(), '', 'Estensione non ammessa');
            messageCanBeMovedToTrash = false;
            errors++;
            return;
          }

          const hash = calculateMd5_(blob);
          if (knownHashes[hash]) {
            appendRegistroRow_(registro, rowBase, hash, 'DUPLICATO', clientFolder.getUrl(), knownHashes[hash].link || '', 'File già archiviato');
            messageHasSavedOrDuplicate = true;
            duplicates++;
            return;
          }

          const finalName = uniqueFileName_(clientFolder, sanitizeFileName_(originalName));
          const savedFile = clientFolder.createFile(blob.copyBlob().setName(finalName));
          knownHashes[hash] = { link: savedFile.getUrl(), cliente: clientName };

          appendRegistroRow_(registro, rowBase, hash, 'SCARICATO', clientFolder.getUrl(), savedFile.getUrl(), 'OK');
          appendHashRow_(hashSheet, hash, finalName, clientName, message.getId(), savedFile.getUrl());
          messageHasSavedOrDuplicate = true;
          downloaded++;
        } catch (err) {
          appendRegistroRow_(registro, rowBase, '', 'ERRORE', clientFolder.getUrl(), '', String(err && err.message ? err.message : err));
          messageCanBeMovedToTrash = false;
          errors++;
        }
      });

      if (messageCanBeMovedToTrash && messageHasSavedOrDuplicate) {
        try {
          GmailApp.moveMessageToTrash(message);
          updateRegistroGmailStatus_([message.getId()], 'CESTINATA AUTOMATICAMENTE');
          gmailMovedToTrash++;
        } catch (trashErr) {
          log_('GMAIL TRASH AUTO', 'ERRORE', message.getId() + ': ' + trashErr.message);
        }
      }
    });
  });

  rebuildIndexes_();

  let reports = [];
  if (generateReports) {
    const clients = Object.keys(touchedClients).slice(0, CONFIG.MAX_REPORTS_PER_RUN);
    reports = clients.map(function(c) {
      try {
        return generateClientReport(c);
      } catch (err) {
        log_('REPORT CLIENTE', 'ERRORE', c + ': ' + err.message);
        return { cliente: c, error: err.message };
      }
    });
  }

  const summary = {
    query: query,
    threadsAnalizzati: threads.length,
    emailAnalizzate: processedMessages,
    allegatiAnalizzati: processedAttachments,
    scaricati: downloaded,
    duplicati: duplicates,
    errori: errors,
    reportGenerati: reports.filter(function(r) { return r && r.url; }).length,
    gmailCestinate: gmailMovedToTrash,
    reports: reports,
    stats: getDashboardStats()
  };
  log_('SCARICA MAIL', 'OK', JSON.stringify(summary));
  return summary;
}

function listClients() {
  setup();
  const rows = getDataRows_(getMasterSpreadsheet_().getSheetByName(SHEETS.CLIENTI));
  return rows.map(function(r) {
    return {
      cliente: r[0],
      stato: r[1],
      piva: r[2],
      cf: r[3],
      pec: r[4],
      emailRilevata: r[5],
      alias: r[6],
      email: r[7],
      allegati: r[8],
      duplicati: r[9],
      errori: r[10],
      daVerificare: r[11],
      spazio: formatBytes_(Number(r[12] || 0)),
      cartella: r[13],
      aggiornamento: r[14]
    };
  });
}

function listSenders() {
  setup();
  const rows = getDataRows_(getMasterSpreadsheet_().getSheetByName(SHEETS.MITTENTI));
  return rows.map(function(r) {
    return {
      mittente: r[0],
      email: r[1],
      allegati: r[2],
      duplicati: r[3],
      clienti: r[4],
      aggiornamento: r[5]
    };
  });
}

function searchArchive(term) {
  setup();
  term = String(term || '').trim().toUpperCase();
  if (!term) return [];
  const rows = getDataRows_(getMasterSpreadsheet_().getSheetByName(SHEETS.REGISTRO));
  const out = [];
  rows.forEach(function(r) {
    const haystack = r.join(' ').toUpperCase();
    if (haystack.indexOf(term) >= 0) {
      out.push({
        data: r[3],
        ora: r[4],
        mittente: r[5],
        oggetto: r[7],
        cliente: r[8],
        allegato: r[10],
        stato: r[14],
        cartella: r[15],
        file: r[16],
        descrizione: r[17]
      });
    }
  });
  return out.slice(0, CONFIG.MAX_SEARCH_RESULTS);
}

function generateClientReport(cliente) {
  setup();
  cliente = String(cliente || '').trim();
  if (!cliente) throw new Error('Cliente non indicato');

  const ss = getMasterSpreadsheet_();
  const rows = getDataRows_(ss.getSheetByName(SHEETS.REGISTRO)).filter(function(r) {
    return String(r[8] || '').toUpperCase() === cliente.toUpperCase();
  });
  if (rows.length === 0) throw new Error('Nessun dato trovato per il cliente: ' + cliente);

  const reportFolder = getOrCreateFolder_(getRootFolder_(), CONFIG.SUBFOLDERS.REPORT_CLIENTI);
  const title = 'Report Cliente - ' + sanitizeFileName_(cliente) + ' - ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd_HHmmss');
  const doc = DocumentApp.create(title);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(reportFolder);

  const body = doc.getBody();
  buildReportHeader_(body, 'REPORT CLIENTE', cliente);
  const stats = summarizeRows_(rows);
  addStatsTable_(body, stats);
  body.appendParagraph('Dettaglio email e allegati').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  addRowsTable_(body, rows.slice(0, CONFIG.MAX_REPORT_ROWS));
  body.appendParagraph('Report generato automaticamente da FinancePlus Mail Archive Enterprise.').setItalic(true);
  doc.saveAndClose();

  const pdfBlob = docFile.getBlob().getAs(MimeType.PDF).setName(title + '.pdf');
  const pdf = reportFolder.createFile(pdfBlob);
  docFile.setTrashed(true);
  log_('REPORT CLIENTE', 'OK', cliente + ' -> ' + pdf.getUrl());
  return { cliente: cliente, url: pdf.getUrl(), name: pdf.getName() };
}

function generateSenderReport(mittente) {
  setup();
  mittente = String(mittente || '').trim();
  if (!mittente) throw new Error('Mittente non indicato');

  const ss = getMasterSpreadsheet_();
  const rows = getDataRows_(ss.getSheetByName(SHEETS.REGISTRO)).filter(function(r) {
    return String(r[5] || '').toUpperCase().indexOf(mittente.toUpperCase()) >= 0;
  });
  if (rows.length === 0) throw new Error('Nessun dato trovato per il mittente: ' + mittente);

  const reportFolder = getOrCreateFolder_(getRootFolder_(), CONFIG.SUBFOLDERS.REPORT_MITTENTI);
  const title = 'Report Mittente - ' + sanitizeFileName_(extractEmail_(mittente) || mittente) + ' - ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd_HHmmss');
  const doc = DocumentApp.create(title);
  const docFile = DriveApp.getFileById(doc.getId());
  docFile.moveTo(reportFolder);

  const body = doc.getBody();
  buildReportHeader_(body, 'REPORT MITTENTE', mittente);
  const stats = summarizeRows_(rows);
  addStatsTable_(body, stats);
  body.appendParagraph('Dettaglio documenti trasmessi').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  addRowsTable_(body, rows.slice(0, CONFIG.MAX_REPORT_ROWS));
  body.appendParagraph('Report generato automaticamente da FinancePlus Mail Archive Enterprise.').setItalic(true);
  doc.saveAndClose();

  const pdfBlob = docFile.getBlob().getAs(MimeType.PDF).setName(title + '.pdf');
  const pdf = reportFolder.createFile(pdfBlob);
  docFile.setTrashed(true);
  log_('REPORT MITTENTE', 'OK', mittente + ' -> ' + pdf.getUrl());
  return { mittente: mittente, url: pdf.getUrl(), name: pdf.getName() };
}

function rebuildIndexes_() {
  const ss = getMasterSpreadsheet_();
  const registroRows = getDataRows_(ss.getSheetByName(SHEETS.REGISTRO));
  const clienti = {};
  const mittenti = {};

  registroRows.forEach(function(r) {
    const client = String(r[8] || 'DA VERIFICARE');
    const sender = String(r[5] || 'Mittente non rilevato');
    const status = String(r[14] || '').toUpperCase();
    const size = Number(r[12] || 0);

    if (!clienti[client]) {
      clienti[client] = { alias: {}, emailSet: {}, allegati: 0, duplicati: 0, errori: 0, daVerificare: 0, spazio: 0, folder: r[15], last: r[18], piva: '', cf: '', pec: '', emailRilevata: '' };
    }
    clienti[client].alias[String(r[9] || '')] = true;
    clienti[client].piva = clienti[client].piva || String(r[21] || '') || findPartitaIva_(String(r.join(' ')));
    clienti[client].cf = clienti[client].cf || String(r[22] || '') || findCodiceFiscale_(String(r.join(' ')));
    clienti[client].pec = clienti[client].pec || String(r[23] || '') || findPec_(String(r.join(' ')));
    clienti[client].emailRilevata = clienti[client].emailRilevata || extractEmail_(String(r[5] || ''));
    clienti[client].emailSet[String(r[1] || '')] = true;
    clienti[client].allegati += status === 'SCARICATO' ? 1 : 0;
    clienti[client].duplicati += status === 'DUPLICATO' ? 1 : 0;
    clienti[client].errori += status === 'ERRORE' ? 1 : 0;
    clienti[client].daVerificare += client.toUpperCase() === 'DA VERIFICARE' ? 1 : 0;
    clienti[client].spazio += size;
    clienti[client].folder = r[15] || clienti[client].folder;
    clienti[client].last = r[18] || clienti[client].last;

    if (!mittenti[sender]) {
      mittenti[sender] = { emailSet: {}, allegati: 0, duplicati: 0, clienti: {}, last: r[18] };
    }
    mittenti[sender].emailSet[String(r[1] || '')] = true;
    mittenti[sender].allegati += status === 'SCARICATO' ? 1 : 0;
    mittenti[sender].duplicati += status === 'DUPLICATO' ? 1 : 0;
    mittenti[sender].clienti[client] = true;
    mittenti[sender].last = r[18] || mittenti[sender].last;
  });

  const clientSheet = ss.getSheetByName(SHEETS.CLIENTI);
  rewriteSheet_(clientSheet, HEADERS.CLIENTI, Object.keys(clienti).sort().map(function(c) {
    const x = clienti[c];
    const stato = c.toUpperCase() === 'DA VERIFICARE' || c.indexOf('PIVA_') === 0 || c.indexOf('CF_') === 0
      ? 'TEMPORANEA - DA ABBINARE'
      : 'ANAGRAFICA AUTO';
    return [
      c,
      stato,
      x.piva,
      x.cf,
      x.pec,
      x.emailRilevata,
      Object.keys(x.alias).filter(Boolean).join(', '),
      Object.keys(x.emailSet).filter(Boolean).length,
      x.allegati,
      x.duplicati,
      x.errori,
      x.daVerificare,
      x.spazio,
      x.folder,
      x.last
    ];
  }));

  const senderSheet = ss.getSheetByName(SHEETS.MITTENTI);
  rewriteSheet_(senderSheet, HEADERS.MITTENTI, Object.keys(mittenti).sort().map(function(s) {
    const x = mittenti[s];
    return [
      s,
      Object.keys(x.emailSet).filter(Boolean).length,
      x.allegati,
      x.duplicati,
      Object.keys(x.clienti).sort().join(', '),
      x.last
    ];
  }));
}


function getSavedSettings() {
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  initializeDefaultSettings_();
  const sh = ss.getSheetByName(SHEETS.CONFIG);
  const rows = getDataRows_(sh);
  const map = {};
  rows.forEach(function(r) { map[String(r[0] || '')] = String(r[1] || ''); });
  return {
    startDate: map.startDate || '2026-04-01',
    endDateExclusive: map.endDateExclusive || '2026-06-27',
    useTodayEnd: map.useTodayEnd === 'true',
    maxThreads: Number(map.maxThreads || CONFIG.MAX_THREADS_PER_RUN),
    generateReports: map.generateReports !== 'false',
    trashAfterArchive: map.trashAfterArchive === 'true',
    autoTriggerHours: Number(map.autoTriggerHours || CONFIG.DEFAULT_AUTO_TRIGGER_HOURS)
  };
}

function saveSettings(settings) {
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  const sh = ss.getSheetByName(SHEETS.CONFIG);
  const current = readSettingsMap_();
  const out = Object.assign({
    startDate: current.startDate || '2026-04-01',
    endDateExclusive: current.endDateExclusive || '2026-06-27',
    useTodayEnd: current.useTodayEnd || String(CONFIG.DEFAULT_USE_TODAY_END),
    maxThreads: current.maxThreads || String(CONFIG.MAX_THREADS_PER_RUN),
    generateReports: current.generateReports || String(CONFIG.GENERATE_REPORTS_AFTER_ARCHIVE),
    trashAfterArchive: current.trashAfterArchive || String(CONFIG.DEFAULT_TRASH_AFTER_ARCHIVE),
    autoTriggerHours: current.autoTriggerHours || String(CONFIG.DEFAULT_AUTO_TRIGGER_HOURS)
  }, settings || {});
  const rows = settingsRows_(out);
  rewriteSheet_(sh, HEADERS.CONFIG, rows);
  log_('IMPOSTAZIONI', 'OK', 'Impostazioni salvate');
  return getSavedSettings();
}

function initializeDefaultSettings_() {
  const ss = getMasterSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.CONFIG);
  if (!sh) return;
  if (getDataRows_(sh).length === 0) {
    rewriteSheet_(sh, HEADERS.CONFIG, settingsRows_({
      startDate: '2026-04-01',
      endDateExclusive: '2026-06-27',
      useTodayEnd: CONFIG.DEFAULT_USE_TODAY_END,
      maxThreads: CONFIG.MAX_THREADS_PER_RUN,
      generateReports: CONFIG.GENERATE_REPORTS_AFTER_ARCHIVE,
      trashAfterArchive: CONFIG.DEFAULT_TRASH_AFTER_ARCHIVE,
      autoTriggerHours: CONFIG.DEFAULT_AUTO_TRIGGER_HOURS
    }));
  }
}

function readSettingsMap_() {
  const sh = getMasterSpreadsheet_().getSheetByName(SHEETS.CONFIG);
  const rows = sh ? getDataRows_(sh) : [];
  const map = {};
  rows.forEach(function(r) { map[String(r[0] || '')] = String(r[1] || ''); });
  return map;
}

function settingsRows_(out) {
  return [
    ['startDate', String(out.startDate || '2026-04-01'), 'Data iniziale ricerca Gmail'],
    ['endDateExclusive', String(out.endDateExclusive || '2026-06-27'), 'Data finale esclusiva. Usata solo se useTodayEnd=false'],
    ['useTodayEnd', String(out.useTodayEnd === true || String(out.useTodayEnd) === 'true'), 'Se true scarica fino a oggi automaticamente'],
    ['maxThreads', String(out.maxThreads || CONFIG.MAX_THREADS_PER_RUN), 'Numero massimo thread Gmail per singola esecuzione'],
    ['generateReports', String(out.generateReports === false || String(out.generateReports) === 'false' ? false : true), 'Genera report PDF cliente dopo scarico'],
    ['trashAfterArchive', String(out.trashAfterArchive === true || String(out.trashAfterArchive) === 'true'), 'Se true sposta in Cestino Gmail dopo archiviazione senza errori'],
    ['autoTriggerHours', String(out.autoTriggerHours || CONFIG.DEFAULT_AUTO_TRIGGER_HOURS), 'Frequenza trigger automatico in ore']
  ];
}

function createAutoArchiveTrigger(hours) {
  hours = Number(hours || getSavedSettings().autoTriggerHours || CONFIG.DEFAULT_AUTO_TRIGGER_HOURS);
  if (hours < 1) hours = 1;
  deleteAutoArchiveTriggers();
  ScriptApp.newTrigger('runArchiveScheduled').timeBased().everyHours(hours).create();
  saveSettings({ autoTriggerHours: hours });
  log_('TRIGGER AUTO', 'OK', 'Scarico automatico ogni ' + hours + ' ore');
  return { ok: true, message: 'Scarico automatico attivato ogni ' + hours + ' ore' };
}

function deleteAutoArchiveTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let count = 0;
  triggers.forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'runArchiveScheduled') {
      ScriptApp.deleteTrigger(t);
      count++;
    }
  });
  log_('TRIGGER AUTO', 'OK', 'Trigger rimossi: ' + count);
  return { ok: true, removed: count };
}

function runArchiveScheduled() {
  const settings = getSavedSettings();
  settings.saveAsDefault = false;
  return runArchive(settings);
}

function listArchivedEmails() {
  setup();
  const rows = getDataRows_(getMasterSpreadsheet_().getSheetByName(SHEETS.REGISTRO));
  const map = {};
  rows.forEach(function(r) {
    const id = String(r[1] || '');
    if (!id) return;
    if (!map[id]) {
      map[id] = {
        messageId: id,
        threadId: r[2],
        data: r[3],
        ora: r[4],
        mittente: r[5],
        oggetto: r[7],
        clienti: {},
        allegati: 0,
        scaricati: 0,
        duplicati: 0,
        errori: 0,
        gmailStatus: r[25] || ''
      };
    }
    map[id].clienti[String(r[8] || 'DA VERIFICARE')] = true;
    map[id].allegati++;
    const stato = String(r[14] || '').toUpperCase();
    if (stato === 'SCARICATO') map[id].scaricati++;
    if (stato === 'DUPLICATO') map[id].duplicati++;
    if (stato === 'ERRORE') map[id].errori++;
    map[id].gmailStatus = map[id].gmailStatus || r[25] || '';
  });
  return Object.keys(map).map(function(k) {
    const x = map[k];
    x.clienti = Object.keys(x.clienti).join(', ');
    return x;
  }).sort(function(a,b) {
    return String(b.data + ' ' + b.ora).localeCompare(String(a.data + ' ' + a.ora));
  }).slice(0, 300);
}

function deleteSavedEmails(messageIds) {
  setup();
  messageIds = messageIds || [];
  if (!Array.isArray(messageIds)) messageIds = [messageIds];
  const unique = {};
  messageIds.forEach(function(id) { if (id) unique[String(id)] = true; });
  const ids = Object.keys(unique);
  let moved = 0;
  const errors = [];
  ids.forEach(function(id) {
    try {
      const msg = GmailApp.getMessageById(id);
      GmailApp.moveMessageToTrash(msg);
      moved++;
    } catch (err) {
      errors.push(id + ': ' + (err && err.message ? err.message : err));
    }
  });
  updateRegistroGmailStatus_(ids, 'CESTINATA DA DASHBOARD');
  log_('ELIMINA EMAIL SALVATE', errors.length ? 'PARZIALE' : 'OK', 'Cestinate: ' + moved + ' Errori: ' + errors.join(' | '));
  rebuildIndexes_();
  return { moved: moved, errors: errors, stats: getDashboardStats() };
}

function updateRegistroGmailStatus_(ids, status) {
  if (!ids || ids.length === 0) return;
  const idMap = {};
  ids.forEach(function(id) { idMap[String(id)] = true; });
  const sh = getMasterSpreadsheet_().getSheetByName(SHEETS.REGISTRO);
  const last = sh.getLastRow();
  if (last <= 1) return;
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (idMap[String(values[i][1] || '')]) {
      sh.getRange(i + 2, 26).setValue(status);
      const oldNote = String(values[i][19] || '');
      sh.getRange(i + 2, 20).setValue((oldNote ? oldNote + ' | ' : '') + status);
    }
  }
}

function getRootFolder_() {
  const folders = DriveApp.getFoldersByName(CONFIG.ROOT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(CONFIG.ROOT_FOLDER_NAME);
}

function getClientFolder_(clientName) {
  const root = getRootFolder_();
  const name = String(clientName || '').trim() || 'DA VERIFICARE';
  const isTemporary = name.toUpperCase() === 'DA VERIFICARE' || name.indexOf('PIVA_') === 0 || name.indexOf('CF_') === 0;
  const parentName = isTemporary ? CONFIG.SUBFOLDERS.TEMPORANEA : CONFIG.SUBFOLDERS.CLIENTI;
  const parent = getOrCreateFolder_(root, parentName);
  return getOrCreateFolder_(parent, sanitizeFolderName_(name));
}

function getOrCreateFolder_(parent, name) {
  const clean = sanitizeFolderName_(name);
  const folders = parent.getFoldersByName(clean);
  if (folders.hasNext()) return folders.next();
  return parent.createFolder(clean);
}

function getMasterSpreadsheet_() {
  const root = getRootFolder_();
  const files = root.getFilesByName(CONFIG.MASTER_SPREADSHEET_NAME);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(f.getId());
  }
  const ss = SpreadsheetApp.create(CONFIG.MASTER_SPREADSHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);
  return ss;
}

function initializeSheets_(ss) {
  Object.keys(SHEETS).forEach(function(k) {
    const name = SHEETS[k];
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = HEADERS[k];
    if (headers) {
      if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    }
  });
  const defaultSheet = ss.getSheetByName('Foglio1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > Object.keys(SHEETS).length) ss.deleteSheet(defaultSheet);
}

function seedAliases_() {
  const ss = getMasterSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.ALIAS);
  const existing = getDataRows_(sh).map(function(r) { return String(r[0] + '|' + r[1]).toUpperCase(); });
  DEFAULT_ALIASES.forEach(function(item) {
    item.alias.forEach(function(a) {
      const key = String(item.cliente + '|' + a).toUpperCase();
      if (existing.indexOf(key) < 0) sh.appendRow([item.cliente, a]);
    });
  });
}

function resetAliasClienti() {
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  const sh = ss.getSheetByName(SHEETS.ALIAS);
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.deleteRows(2, lastRow - 1);
  }
  log_('ALIAS', 'OK', 'Foglio Alias svuotato. Inserire solo clienti reali, non esempi.');
  return getDashboardStats();
}

function aggiungiAliasCliente(clienteUfficiale, aliasCliente) {
  const cliente = String(clienteUfficiale || '').trim();
  const alias = String(aliasCliente || '').trim();
  if (!cliente || !alias) throw new Error('Inserire Cliente ufficiale e Alias.');
  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  const sh = ss.getSheetByName(SHEETS.ALIAS);
  sh.appendRow([cliente, alias]);
  log_('ALIAS', 'OK', 'Alias aggiunto: ' + cliente + ' | ' + alias);
  return { cliente: cliente, alias: alias };
}

function recognizeClient_(subject, body, attachments) {
  const textParts = [subject || '', body || ''];
  attachments.forEach(function(a) { textParts.push(a.getName() || ''); });

  const rawText = textParts.join('\n');
  const text = normalizeText_(rawText);
  const aliases = getAliasRows_();

  // 1) Alias reali inseriti dall'utente: massima priorità.
  for (let i = 0; i < aliases.length; i++) {
    const cliente = aliases[i].cliente;
    const alias = aliases[i].alias;
    if (alias && text.indexOf(normalizeText_(alias)) >= 0) {
      return { cliente: cliente, alias: alias, source: 'ALIAS_MANUALE', piva: findPartitaIva_(text), cf: findCodiceFiscale_(text) };
    }
  }

  // 2) Denominazione/ragione sociale rilevata automaticamente da oggetto, corpo, nomi file e OCR allegati.
  const detectedCompany = extractCompanyName_(rawText);
  const piva = findPartitaIva_(text);
  const cf = findCodiceFiscale_(text);
  if (detectedCompany) {
    return {
      cliente: detectedCompany,
      alias: detectedCompany,
      source: 'DENOMINAZIONE_AUTO',
      piva: piva,
      cf: cf
    };
  }

  // 3) Identificativi fiscali: se non si trova il nome, crea cartella provvisoria per PIVA/CF.
  if (piva) return { cliente: 'PIVA_' + piva, alias: piva, source: 'PARTITA_IVA_AUTO', piva: piva, cf: cf };
  if (cf) return { cliente: 'CF_' + cf, alias: cf, source: 'CODICE_FISCALE_AUTO', piva: piva, cf: cf };

  return { cliente: 'DA VERIFICARE', alias: '', source: 'NON_RICONOSCIUTO', piva: '', cf: '' };
}

function learnAliasesFromRecognition_(recognition) {
  if (!CONFIG.AUTO_LEARN_ALIASES) return;
  if (!recognition || !recognition.cliente || recognition.cliente === 'DA VERIFICARE') return;

  const cliente = String(recognition.cliente || '').trim();
  const candidates = [];
  if (recognition.alias) candidates.push(String(recognition.alias).trim());
  if (recognition.piva) candidates.push(String(recognition.piva).trim());
  if (recognition.cf) candidates.push(String(recognition.cf).trim());

  const cleanCandidates = candidates
    .map(function(x) { return String(x || '').trim(); })
    .filter(function(x) { return x && x.length >= 3 && x.toUpperCase() !== 'DA VERIFICARE'; });
  if (cleanCandidates.length === 0) return;

  const ss = getMasterSpreadsheet_();
  initializeSheets_(ss);
  const sh = ss.getSheetByName(SHEETS.ALIAS);
  const existing = getDataRows_(sh).map(function(r) {
    return normalizeText_(String(r[0] || '') + '|' + String(r[1] || ''));
  });

  cleanCandidates.forEach(function(alias) {
    const key = normalizeText_(cliente + '|' + alias);
    if (existing.indexOf(key) < 0) {
      sh.appendRow([cliente, alias]);
      existing.push(key);
    }
  });
}

function extractCompanyName_(rawText) {
  const compact = String(rawText || '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\.(PDF|DOCX?|XLSX?|CSV|TXT|XML|P7M|ZIP|RAR|7Z)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';

  const labeled = extractCompanyFromLabels_(compact);
  if (labeled) return labeled;

  const legalForm = '(?:S\\.?\\s*R\\.?\\s*L\\.?|SRL|S\\.?\\s*P\\.?\\s*A\\.?|SPA|S\\.?\\s*A\\.?\\s*S\\.?|SAS|S\\.?\\s*N\\.?\\s*C\\.?|SNC|S\\.?\\s*S\\.?|COOP(?:ERATIVA)?|CONSORZIO|FONDAZIONE|ASSOCIAZIONE|IMPRESA\\s+INDIVIDUALE|DITTA\\s+INDIVIDUALE)';
  const re = new RegExp("([A-Z0-9À-ÖØ-Ýa-zà-öø-ÿ&'’., ]{2,90}?" + legalForm + ")", "gi");
  const candidates = [];
  let m;
  while ((m = re.exec(compact)) !== null) {
    const cleaned = cleanCompanyName_(m[1]);
    if (isGoodCompanyCandidate_(cleaned)) candidates.push(cleaned);
  }
  return chooseBestCompanyCandidate_(candidates);
}

function extractCompanyFromLabels_(text) {
  const labelRe = /(?:DENOMINAZIONE|RAGIONE\s+SOCIALE|SOCIETA'|SOCIETA|IMPRESA|AZIENDA|DITTA|CLIENTE|INTESTATARIO|TITOLARE|SPETT\.LE)\s*[:\-]?\s*([A-Z0-9À-ÖØ-Ýa-zà-öø-ÿ&'’., ]{3,110})/gi;
  const candidates = [];
  let m;
  while ((m = labelRe.exec(text)) !== null) {
    let candidate = String(m[1] || '')
      .split(/(?:\bOGGETTO\b|\bEMAIL\b|\bPEC\b|\bP\.IVA\b|\bPARTITA\s+IVA\b|\bCODICE\s+FISCALE\b|\bALLEGAT|\bBUONGIORNO\b|\bGENTILE\b|\bIN\s+ALLEGATO\b)/i)[0];
    candidate = cleanCompanyName_(candidate);
    if (isGoodCompanyCandidate_(candidate)) candidates.push(candidate);
  }
  return chooseBestCompanyCandidate_(candidates);
}

function cleanCompanyName_(s) {
  let out = String(s || '')
    .replace(/[\"“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, '')
    .trim();
  out = out.replace(/\b(S)\s*\.\s*(R)\s*\.\s*(L)\s*\.?\b/gi, 'S.R.L.');
  out = out.replace(/\b(S)\s*\.\s*(P)\s*\.\s*(A)\s*\.?\b/gi, 'S.P.A.');
  out = out.replace(/\b(S)\s*\.\s*(A)\s*\.\s*(S)\s*\.?\b/gi, 'S.A.S.');
  out = out.replace(/\b(S)\s*\.\s*(N)\s*\.\s*(C)\s*\.?\b/gi, 'S.N.C.');
  return out.toUpperCase();
}

function isGoodCompanyCandidate_(name) {
  const n = normalizeText_(name);
  if (!n || n.length < 4 || n.length > 100) return false;
  if (/^[0-9 ._-]+$/.test(n)) return false;
  const bad = [
    'BILANCIO', 'NOTA INTEGRATIVA', 'VERBALE', 'RICEVUTA', 'CENTRALE RISCHI', 'VISURA',
    'DOCUMENTO IDENTITA', 'CODICE FISCALE', 'PARTITA IVA', 'ALLEGATO', 'OGGETTO',
    'BUONGIORNO', 'CORDIALI SALUTI', 'REGISTRO IMPRESE', 'AGENZIA ENTRATE'
  ];
  for (let i = 0; i < bad.length; i++) {
    if (n === bad[i]) return false;
  }
  return true;
}

function chooseBestCompanyCandidate_(candidates) {
  if (!candidates || candidates.length === 0) return '';
  const counts = {};
  candidates.forEach(function(c) {
    const key = cleanCompanyName_(c);
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a, b) {
    return counts[b] - counts[a] || a.length - b.length;
  })[0] || '';
}

function getAliasRows_() {
  const rows = getDataRows_(getMasterSpreadsheet_().getSheetByName(SHEETS.ALIAS));
  return rows.map(function(r) { return { cliente: String(r[0] || '').trim(), alias: String(r[1] || '').trim() }; })
    .filter(function(x) { return x.cliente && x.alias; });
}


function extractTextFromAttachment_(blob) {
  if (!CONFIG.ENABLE_TEXT_EXTRACTION) return '';
  try {
    const name = blob.getName() || '';
    const ext = getExtension_(name).toLowerCase();

    if (['txt','csv','xml'].indexOf(ext) >= 0) {
      return truncate_(blob.getDataAsString(), CONFIG.OCR_TEXT_MAX_CHARS);
    }

    if (['pdf','jpg','jpeg','png','doc','docx'].indexOf(ext) < 0) return '';
    if (typeof Drive === 'undefined' || !Drive.Files) {
      log_('OCR', 'NON ATTIVO', 'Servizio Drive avanzato non disponibile. Allegato: ' + name);
      return '';
    }

    const resource = {
      title: 'OCR_TMP_' + Utilities.getUuid() + '_' + sanitizeFileName_(name),
      mimeType: MimeType.GOOGLE_DOCS
    };
    const temp = Drive.Files.insert(resource, blob, {
      ocr: true,
      ocrLanguage: CONFIG.OCR_LANGUAGE,
      convert: true
    });
    const doc = DocumentApp.openById(temp.id);
    const text = doc.getBody().getText() || '';
    DriveApp.getFileById(temp.id).setTrashed(true);
    return truncate_(text, CONFIG.OCR_TEXT_MAX_CHARS);
  } catch (err) {
    log_('OCR', 'ERRORE', String(err && err.message ? err.message : err));
    return '';
  }
}

function buildRowBase_(message, thread, recognition, originalName, ext, size, body, extractedText) {
  recognition = recognition || {};
  const d = message.getDate();
  const allText = [body || '', extractedText || '', message.getSubject() || '', originalName || ''].join(' ');
  return {
    rowId: Utilities.getUuid(),
    messageId: message.getId(),
    threadId: thread.getId(),
    date: Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy'),
    time: Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm:ss'),
    from: message.getFrom() || '',
    to: message.getTo() || '',
    subject: message.getSubject() || '',
    clientName: recognition.cliente || 'DA VERIFICARE',
    alias: recognition.alias || '',
    originalName: originalName,
    ext: ext,
    size: size,
    bodySnippet: truncate_(body, CONFIG.SNIPPET_MAX_CHARS),
    extractedText: truncate_(extractedText || '', CONFIG.OCR_TEXT_MAX_CHARS),
    piva: recognition.piva || findPartitaIva_(allText),
    cf: recognition.cf || findCodiceFiscale_(allText),
    pec: findPec_(allText),
    source: recognition.source || 'AUTO'
  };
}

function appendRegistroRow_(sheet, b, hash, status, folderUrl, fileUrl, note) {
  sheet.appendRow([
    b.rowId,
    b.messageId,
    b.threadId,
    b.date,
    b.time,
    b.from,
    b.to,
    b.subject,
    b.clientName,
    b.alias,
    b.originalName,
    b.ext,
    b.size,
    hash,
    status,
    folderUrl,
    fileUrl,
    b.bodySnippet,
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
    note || '',
    b.extractedText || '',
    b.piva || '',
    b.cf || '',
    b.pec || '',
    b.source || '',
    ''
  ]);
}

function appendHashRow_(sheet, hash, name, client, messageId, link) {
  sheet.appendRow([
    hash,
    name,
    client,
    messageId,
    link,
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
  ]);
}

function loadKnownHashes_(sheet) {
  const rows = getDataRows_(sheet);
  const map = {};
  rows.forEach(function(r) {
    const hash = String(r[0] || '');
    if (hash) map[hash] = { name: r[1], cliente: r[2], messageId: r[3], link: r[4] };
  });
  return map;
}

function calculateMd5_(blob) {
  const bytes = blob.getBytes();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes);
  return digest.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function addStatsTable_(body, stats) {
  body.appendParagraph('Riepilogo').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const table = body.appendTable([
    ['Voce', 'Valore'],
    ['Email distinte', String(stats.email)],
    ['Allegati scaricati', String(stats.scaricati)],
    ['Duplicati esclusi', String(stats.duplicati)],
    ['Errori', String(stats.errori)],
    ['Spazio documenti', formatBytes_(stats.spazio)],
    ['Periodo righe archivio', stats.periodo]
  ]);
  styleTable_(table);
}

function addRowsTable_(body, rows) {
  const data = [['Data','Ora','Mittente','Oggetto','Cliente','Allegato','Stato','Descrizione']];
  rows.forEach(function(r) {
    data.push([
      String(r[3] || ''),
      String(r[4] || ''),
      truncate_(String(r[5] || ''), 45),
      truncate_(String(r[7] || ''), 60),
      truncate_(String(r[8] || ''), 35),
      truncate_(String(r[10] || ''), 45),
      String(r[14] || ''),
      truncate_(String(r[17] || ''), 90)
    ]);
  });
  const table = body.appendTable(data);
  styleTable_(table);
}

function buildReportHeader_(body, reportType, title) {
  body.appendParagraph('FinancePlus').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('Mail Archive Enterprise').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(reportType).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(title).setBold(true);
  body.appendParagraph('Generato il ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'));
  body.appendHorizontalRule();
}

function summarizeRows_(rows) {
  const emailSet = {};
  let scaricati = 0;
  let duplicati = 0;
  let errori = 0;
  let spazio = 0;
  const dates = [];
  rows.forEach(function(r) {
    emailSet[String(r[1] || '')] = true;
    const s = String(r[14] || '').toUpperCase();
    scaricati += s === 'SCARICATO' ? 1 : 0;
    duplicati += s === 'DUPLICATO' ? 1 : 0;
    errori += s === 'ERRORE' ? 1 : 0;
    spazio += Number(r[12] || 0);
    if (r[3]) dates.push(String(r[3]));
  });
  return {
    email: Object.keys(emailSet).filter(Boolean).length,
    scaricati: scaricati,
    duplicati: duplicati,
    errori: errori,
    spazio: spazio,
    periodo: dates.length ? dates[0] + ' - ' + dates[dates.length - 1] : '-'
  };
}

function styleTable_(table) {
  for (let r = 0; r < table.getNumRows(); r++) {
    const row = table.getRow(r);
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.setPaddingTop(3).setPaddingBottom(3).setPaddingLeft(4).setPaddingRight(4);
      if (r === 0) cell.editAsText().setBold(true);
    }
  }
}

function rewriteSheet_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  try { sheet.autoResizeColumns(1, headers.length); } catch (e) {}
}

function getDataRows_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function log_(op, esito, dettaglio) {
  try {
    const ss = getMasterSpreadsheet_();
    initializeSheets_(ss);
    const now = new Date();
    ss.getSheetByName(SHEETS.LOG).appendRow([
      Utilities.formatDate(now, CONFIG.TIMEZONE, 'dd/MM/yyyy'),
      Utilities.formatDate(now, CONFIG.TIMEZONE, 'HH:mm:ss'),
      op,
      esito,
      String(dettaglio || '').slice(0, 4500)
    ]);
  } catch (e) {
    console.log('LOG ERROR: ' + e.message);
  }
}

function safePlainBody_(message) {
  try {
    return message.getPlainBody() || '';
  } catch (e) {
    try { return message.getBody().replace(/<[^>]+>/g, ' '); } catch (err) { return ''; }
  }
}

function normalizeDateForGmail_(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '/');
  return '';
}

function isDateInside_(date, startGmail, endGmail) {
  const start = new Date(startGmail.replace(/\//g, '-') + 'T00:00:00');
  const end = new Date(endGmail.replace(/\//g, '-') + 'T00:00:00');
  return date >= start && date < end;
}

function isAllowedFile_(name) {
  const ext = getExtension_(name);
  if (!ext) return true;
  return CONFIG.ALLOWED_EXTENSIONS.indexOf(ext.toLowerCase()) >= 0;
}

function getExtension_(name) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function uniqueFileName_(folder, name) {
  if (!folder.getFilesByName(name).hasNext()) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.substring(0, dot) : name;
  const ext = dot > 0 ? name.substring(dot) : '';
  return base + '_' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd_HHmmss') + ext;
}

function sanitizeFileName_(name) {
  return String(name || 'file')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'file';
}

function sanitizeFolderName_(name) {
  return sanitizeFileName_(name).replace(/\.+$/g, '').slice(0, 120) || 'Senza nome';
}

function normalizeText_(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9@._ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate_(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.substring(0, n - 3) + '...' : s;
}

function tomorrowGmailDate_() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy/MM/dd');
}

function findPartitaIva_(text) {
  const m = String(text || '').match(/(?:P\.?\s*IVA|PARTITA\s+IVA|PIVA)?\s*([0-9]{11})/i);
  return m ? m[1] : '';
}

function findCodiceFiscale_(text) {
  const m = String(text || '').match(/\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/i);
  return m ? m[0].toUpperCase() : '';
}

function findPec_(text) {
  const m = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]*PEC[A-Z0-9.-]*\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function extractEmail_(s) {
  const m = String(s || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : '';
}

function formatBytes_(bytes) {
  bytes = Number(bytes || 0);
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB','MB','GB','TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return value.toFixed(2).replace('.', ',') + ' ' + units[i];
}
