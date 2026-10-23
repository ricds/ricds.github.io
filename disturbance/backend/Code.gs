/**
 * Forest Disturbance Game - results receiver and class ranking (Google Apps Script web app).
 *
 * Bound to a Google Sheet.
 *  POST  (a finished game)  -> appends a row to the "results" sheet and emails the result to
 *        the student, with the instructor on BCC.
 *  GET ?action=class&group=<id>  -> the class ranking for the game page: names, scores,
 *        times and per-image answers of everyone in that class. Emails are never returned.
 *        Only each email's FIRST finished game in a class counts, so replaying cannot
 *        climb the ranking.
 *  POST {action: "addGroup", label, instructor}  -> creates a group (class session) in the
 *        "groups" sheet and returns its secret manage key to the creator only; GET
 *        ?action=groups lists the groups (never the keys), so the page offers them to everyone.
 *  POST {action: "setStatus", group, key, closed}  -> closes / re-opens a group; needs the
 *        group's key, which only its instructor has.
 *  POST {action: "emailManageLinks"}  -> emails the manage links of all groups to
 *        TEACHER_EMAIL only (so the owner never needs to open the Sheet); at most once per 5 min.
 * The instructor address lives here, not in the public page. Setup: see SETUP.md.
 */
const TEACHER_EMAIL = 'ricds@hotmail.com';
const GAME_URL = 'https://ricds.github.io/disturbance/';
const SHEET_NAME = 'results';
const GROUP_SHEET = 'groups';
const MAX_ANSWERS = 60;
const MAX_GROUPS = 300;
const HEAD = ['received', 'group', 'name', 'email', 'org', 'lang', 'score', 'total', 'seconds', 'started', 'finished', 'answers_json'];
// status: '' open, 'closed'; key: secret that lets the instructor close / re-open on the page
const GROUP_HEAD = ['created', 'id', 'label', 'instructor', 'status', 'key'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'addGroup') {
      lock.waitLock(20000);
      const g = addGroup(clean(d.label, 60), clean(d.instructor, 80));
      lock.releaseLock();
      return json({ ok: true, group: g });
    }
    if (d.action === 'setStatus') {
      lock.waitLock(20000);
      const closed = setStatus_(clean(d.group, 60), clean(d.key, 40), d.closed === true);
      lock.releaseLock();
      return json({ ok: true, closed: closed });
    }
    if (d.action === 'emailManageLinks') return json(emailManageLinks_());
    const name = clean(d.name, 80);
    const email = clean(d.email, 120).toLowerCase();
    if (!name) throw new Error('missing name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalid email');
    let group = clean(d.group, 40);
    // a closed group takes no new entries: the game is still saved and emailed, under "no class"
    let note = '';
    if (group && isClosed_(group)) { group = ''; note = 'closed'; }
    const answers = (Array.isArray(d.answers) ? d.answers : []).slice(0, MAX_ANSWERS).map(function (a) {
      return {
        id: clean(a.id, 40), place: clean(a.place, 120), lat: Number(a.lat), lon: Number(a.lon),
        answerId: clean(a.answerId, 20), choiceId: clean(a.choiceId, 20),
        answer: clean(a.answer, 60), choice: clean(a.choice, 60), correct: a.correct === true, sure: a.sure === true,
      };
    });
    const score = answers.filter(function (a) { return a.correct; }).length;
    const lang = d.lang === 'pt' ? 'pt' : 'en';
    const t0 = Date.parse(d.startedAt), t1 = Date.parse(d.finishedAt);
    const seconds = isFinite(t0) && isFinite(t1) && t1 > t0 ? Math.round((t1 - t0) / 1000) : '';

    const org = clean(d.org, 120);

    lock.waitLock(20000);
    // written by column name, so a Sheet made before a column existed keeps working
    const sh = getSheet();
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const rec = { received: new Date(), group: group, name: name, email: email, org: org, lang: lang, score: score,
      total: answers.length, seconds: seconds, started: clean(d.startedAt, 40), finished: clean(d.finishedAt, 40),
      answers_json: JSON.stringify(answers) };
    sh.appendRow(head.map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ''; }));
    lock.releaseLock();

    const mail = emailContent({ name: name, org: org, group: group, groupLabel: clean(d.groupLabel, 80), score: score,
      answers: answers, lang: lang, seconds: seconds });
    MailApp.sendEmail({
      to: email,
      bcc: TEACHER_EMAIL,
      replyTo: TEACHER_EMAIL,
      // a person's name as sender, plain subject, and a text part beside the HTML all lower
      // the spam score; the rest is the recipient marking the sender as safe (see SETUP.md)
      name: 'Ricardo Dalagnol (Forest Disturbance Game)',
      subject: (lang === 'pt' ? 'Jogo dos Distúrbios Florestais - resultado de ' : 'Forest Disturbance Game - results for ') +
        name + ': ' + score + '/' + answers.length,
      body: mail.text,
      htmlBody: mail.html,
    });
    return json({ ok: true, score: score, groupClosed: note === 'closed' });
  } catch (err) {
    try { lock.releaseLock(); } catch (e2) { /* not held */ }
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'class') return json(classResults(clean(p.group, 40)));
  if (p.action === 'groups') return json({ ok: true, groups: listGroups() });
  return json({ ok: true, service: 'disturbance-game' });
}

function getGroupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GROUP_SHEET);
  if (!sh) {
    sh = ss.insertSheet(GROUP_SHEET);
    sh.appendRow(GROUP_HEAD);
    sh.setFrozenRows(1);
    return sh;
  }
  // a column added later (e.g. 'instructor') goes to the end of the header if missing
  const head = groupHeader_(sh);
  const missing = GROUP_HEAD.filter(function (h) { return head.indexOf(h) < 0; });
  if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
  return sh;
}

/** Header names of the groups tab, trimmed and lower-case (columns can be in any order). */
function groupHeader_(sh) {
  return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
}

/** Append one group row, writing each value under its column name. */
function appendGroupRow_(rec) {
  const sh = getGroupSheet();
  sh.appendRow(groupHeader_(sh).map(function (h) { return rec.hasOwnProperty(h) ? rec[h] : ''; }));
}

/** Groups in creation order (oldest first). */
function listGroups() {
  const sh = getGroupSheet();
  const head = groupHeader_(sh);
  const values = sh.getDataRange().getValues();
  const c = { id: head.indexOf('id'), label: head.indexOf('label'), instructor: head.indexOf('instructor'),
    status: head.indexOf('status') };
  const out = [];
  for (let r = 1; r < values.length; r++) {
    const id = values[r][c.id];
    if (!id) continue;
    out.push({ id: String(id), label: String((c.label >= 0 && values[r][c.label]) || id),
      instructor: c.instructor >= 0 ? String(values[r][c.instructor] || '') : '',
      closed: c.status >= 0 && String(values[r][c.status]).trim().toLowerCase() === 'closed' });
  }
  return out;
}

/** New group: label gets the creation date, id = date + short slug + random tail (unique). */
function addGroup(label, instructor) {
  if (label.length < 3) throw new Error('name too short');
  if (instructor.length < 2) throw new Error('missing instructor');
  if (getGroupSheet().getLastRow() - 1 >= MAX_GROUPS) throw new Error('too many groups');
  const tz = Session.getScriptTimeZone();
  const id = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + '-' + slug_(label) + '-' +
    Math.random().toString(36).slice(2, 6);
  const full = label + ' (' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy') + ')';
  const key = newKey_();
  appendGroupRow_({ created: new Date(), id: id, label: full, instructor: instructor, key: key });
  return { id: id, label: full, instructor: instructor, key: key };  // the key goes to the creator only
}

function slug_(label) {
  return label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'grupo';
}

function classResults(group) {
  const values = getSheet().getDataRange().getValues();
  const col = {};
  values[0].forEach(function (h, i) { col[h] = i; });
  const seen = {};
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    if (String(v[col.group]) !== group) continue;
    const key = String(v[col.email]).toLowerCase();
    if (seen[key]) continue;  // first finished game per student only
    seen[key] = true;
    let answers = [];
    try {
      answers = JSON.parse(v[col.answers_json] || '[]').map(function (a) {
        return { id: a.id, answerId: a.answerId, choiceId: a.choiceId, correct: a.correct };
      });
    } catch (err) { /* malformed row: keep the score, skip the details */ }
    rows.push({ name: String(v[col.name]), score: Number(v[col.score]), total: Number(v[col.total]),
      seconds: Number(v[col.seconds]) || null, answers: answers });
  }
  return { ok: true, group: group, rows: rows };
}

/**
 * Menu in the Sheet (owner only, never exposed through the web app) to delete the results
 * of one class, e.g. test games under "no class" before a real session.
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Disturbance game')
    .addItem('Limpar "Sem turma" (practice)', 'clearPractice')
    .addItem('Limpar uma turma... (clear a class)', 'clearClassPrompt')
    .addSeparator()
    .addToUi();
}

// ---------- closing / re-opening groups from the website ----------

function isClosed_(id) {
  return listGroups().some(function (g) { return g.id === id && g.closed; });
}

function newKey_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }

/** Row number (1-based) and key of a group; fills in a missing key (groups made before keys). */
function groupRow_(id) {
  const sh = getGroupSheet();
  const head = groupHeader_(sh);
  const values = sh.getDataRange().getValues();
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][head.indexOf('id')]) !== id) continue;
    let key = String(values[r][head.indexOf('key')] || '');
    if (!key) { key = newKey_(); sh.getRange(r + 1, head.indexOf('key') + 1).setValue(key); }
    return { row: r + 1, key: key, sh: sh, head: head, label: String(values[r][head.indexOf('label')] || id) };
  }
  return null;
}

/** Close or re-open a group; only with the group's key. Returns the new closed state. */
function setStatus_(id, key, closed) {
  const g = groupRow_(id);
  if (!g) throw new Error('unknown group');
  if (!key || key !== g.key) throw new Error('wrong key');
  g.sh.getRange(g.row, g.head.indexOf('status') + 1).setValue(closed ? 'closed' : '');
  return closed;
}

const manageLink_ = function (id, key) {
  return GAME_URL + '?view=class&class=' + encodeURIComponent(id) + '&key=' + encodeURIComponent(key);
};

/** Emails the manage link of every group to the owner only; rate-limited. */
function emailManageLinks_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('manageLinksSent')) return { ok: true, sent: false, reason: 'recently sent' };
  const lines = listGroups().map(function (g) {
    const r = groupRow_(g.id);
    return g.label + (g.closed ? ' [closed]' : '') + '\n' + manageLink_(g.id, r.key);
  });
  MailApp.sendEmail({
    to: TEACHER_EMAIL,
    name: 'Ricardo Dalagnol (Forest Disturbance Game)',
    subject: 'Forest Disturbance Game - manage links for your groups',
    body: 'Open a link to close or re-open that group on the website. Keep these links private: ' +
      'anyone with a link can close or re-open its group.\n\n' + (lines.join('\n\n') || '(no groups yet)'),
  });
  cache.put('manageLinksSent', '1', 300);
  return { ok: true, sent: true };
}

/**
 * Students who played today without picking a group (they landed in "Sem turma") are moved
 * into a group, created with exactly the name typed if it does not exist yet. Shows the
 * names and asks before changing anything.
 */
function moveTodayPracticePrompt() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Mover "Sem turma" de hoje', 'Nome do grupo (é criado se não existir):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const label = clean(r.getResponseText(), 80);
  if (label.length < 3) { ui.alert('Nome muito curto.'); return; }

  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const sh = getSheet();
  const values = sh.getDataRange().getValues();
  const col = {};
  values[0].forEach(function (h, i) { col[h] = i; });
  const rows = [];
  const names = [];
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    const day = v[col.received] instanceof Date ? Utilities.formatDate(v[col.received], tz, 'yyyy-MM-dd') : '';
    if (String(v[col.group]) === '' && day === today) { rows.push(i + 1); names.push(String(v[col.name])); }
  }
  if (!rows.length) { ui.alert('Nenhum resultado em "Sem turma" hoje (' + today + ').'); return; }
  const ok = ui.alert('Mover ' + rows.length + ' resultado(s) de hoje para "' + label + '"?\n\n' + names.join('\n'),
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;

  const g = findOrCreateGroup_(label);
  rows.forEach(function (row) { sh.getRange(row, col.group + 1).setValue(g.id); });
  ui.alert(rows.length + ' resultado(s) movido(s) para "' + g.label + '".\n\nLink do grupo:\n' + GAME_URL + '?class=' +
    encodeURIComponent(g.id) + '\n\nRanking:\n' + GAME_URL + '?view=class&class=' + encodeURIComponent(g.id));
}

/** Group with exactly this label (no date added); created if missing. */
function findOrCreateGroup_(label) {
  const found = listGroups().filter(function (g) { return g.label === label; })[0];
  if (found) return found;
  const tz = Session.getScriptTimeZone();
  const slug = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  const id = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + '-' + (slug || 'grupo') + '-' +
    Math.random().toString(36).slice(2, 6);
  appendGroupRow_({ created: new Date(), id: id, label: label, instructor: '', key: newKey_() });
  return { id: id, label: label, instructor: '' };
}

function clearPractice() { clearGroup_(''); }
// groups created on the page are listed (and can be deleted by hand) in the "groups" tab;
// the id to use in "Limpar uma turma..." is in its column B

function clearClassPrompt() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Limpar turma', 'Id da turma (ex.: 2026-10-23):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() === ui.Button.OK) clearGroup_(clean(r.getResponseText(), 40));
}

function clearGroup_(group) {
  const ui = SpreadsheetApp.getUi();
  const sh = getSheet();
  const values = sh.getDataRange().getValues();
  const col = values[0].indexOf('group');
  const rows = [];
  for (let r = 1; r < values.length; r++) if (String(values[r][col]) === group) rows.push(r + 1);
  const label = group || 'Sem turma';
  if (!rows.length) { ui.alert('Nada para apagar em "' + label + '".'); return; }
  const ok = ui.alert('Apagar ' + rows.length + ' resultado(s) de "' + label + '"?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  rows.reverse().forEach(function (r) { sh.deleteRow(r); });  // bottom-up keeps row numbers valid
  ui.alert(rows.length + ' resultado(s) apagado(s) de "' + label + '".');
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    return sh;
  }
  // a column added after the Sheet was made (e.g. 'org') goes to the end of the header
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const missing = HEAD.filter(function (h) { return head.indexOf(h) < 0; });
  if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]);
  return sh;
}

/**
 * One short block per image instead of a wide table: it reads well in the HTML view and
 * still lines up when a mail client (e.g. Outlook's junk folder) flattens it to plain text.
 * Returns {html, text}.
 */
function emailContent(m) {
  const pt = m.lang === 'pt';
  const L = pt ? {
    title: 'Jogo dos Distúrbios Florestais', score: 'Pontuação', cls: 'Turma', practice: 'Sem turma (só praticando)',
    org: 'Organização',
    time: 'Tempo', byType: 'Acertos por tipo de distúrbio', answers: 'Suas respostas', you: 'Sua resposta',
    right: 'Resposta correta', sure: 'tenho certeza', guess: 'chute', play: 'Jogar de novo',
    ranking: 'Ranking da turma', wrong: 'Para revisar', all: 'Todas as respostas',
  } : {
    title: 'Forest Disturbance Game', score: 'Score', cls: 'Class', practice: 'No class (just practising)',
    org: 'Organisation',
    time: 'Time', byType: 'Correct by type of disturbance', answers: 'Your answers', you: 'Your answer',
    right: 'Right answer', sure: 'sure', guess: 'guessing', play: 'Play again',
    ranking: 'Class ranking', wrong: 'To review', all: 'All answers',
  };
  const n = m.answers.length;
  const clsName = m.group ? (m.groupLabel || m.group) : L.practice;
  const mins = m.seconds ? Math.floor(m.seconds / 60) + ' min ' + (m.seconds % 60) + ' s' : '';
  const rankUrl = GAME_URL + '?view=class&class=' + encodeURIComponent(m.group || '') + (pt ? '&lang=pt' : '');
  const playUrl = GAME_URL + (pt ? '?lang=pt' : '');

  // correct by type, in the order the types first appear
  const types = [];
  const byType = {};
  m.answers.forEach(function (a) {
    if (!byType[a.answer]) { byType[a.answer] = { ok: 0, n: 0 }; types.push(a.answer); }
    byType[a.answer].n++;
    if (a.correct) byType[a.answer].ok++;
  });

  const line = function (a, i) {
    return {
      head: (i + 1) + '. ' + (a.correct ? '✓' : '✗') + ' ' + a.place,
      detail: a.lat.toFixed(5) + ', ' + a.lon.toFixed(5) + ' · ' + L.you + ': ' + a.choice +
        (a.correct ? '' : ' · ' + L.right + ': ' + a.answer) + ' · ' + (a.sure ? L.sure : L.guess),
    };
  };
  const wrong = [];
  m.answers.forEach(function (a, i) { if (!a.correct) wrong.push(line(a, i)); });
  const all = m.answers.map(line);

  // plain text
  const t = [L.title, '', m.name + (m.org ? ' - ' + m.org : ''), L.score + ': ' + m.score + ' / ' + n, L.cls + ': ' + clsName];
  if (mins) t.push(L.time + ': ' + mins);
  t.push('', L.byType + ':');
  types.forEach(function (k) { t.push('  ' + k + ': ' + byType[k].ok + ' / ' + byType[k].n); });
  if (wrong.length) {
    t.push('', L.wrong + ':');
    wrong.forEach(function (w) { t.push(w.head, '   ' + w.detail); });
  }
  t.push('', L.all + ':');
  all.forEach(function (w) { t.push(w.head, '   ' + w.detail); });
  t.push('', L.play + ': ' + playUrl, L.ranking + ': ' + rankUrl);

  // html
  const block = function (w, ok) {
    return '<div style="margin:0 0 8px 0">' +
      '<div style="font-weight:bold;color:' + (ok ? '#1c7a4a' : '#b3361f') + '">' + esc(w.head) + '</div>' +
      '<div style="color:#4a4f54;font-size:13px;padding-left:18px">' + esc(w.detail) + '</div></div>';
  };
  let h = '<div style="font-family:Arial,Helvetica,sans-serif;color:#0b0d0f;max-width:640px">' +
    '<h2 style="margin:0 0 6px 0;color:#1c5b4a">' + esc(L.title) + '</h2>' +
    '<p style="margin:0 0 4px 0;font-size:15px"><b>' + esc(m.name) + '</b>' +
    (m.org ? ' <span style="color:#4a4f54">· ' + esc(m.org) + '</span>' : '') + '</p>' +
    '<p style="margin:0 0 4px 0;font-size:22px"><b>' + m.score + ' / ' + n + '</b></p>' +
    '<p style="margin:0 0 12px 0;color:#4a4f54">' + esc(L.cls) + ': ' + esc(clsName) + (mins ? ' · ' + esc(L.time) + ': ' + mins : '') + '</p>' +
    '<p style="margin:0 0 16px 0"><a href="' + playUrl + '">' + esc(L.play) + '</a> · <a href="' + rankUrl + '">' + esc(L.ranking) + '</a></p>' +
    '<h3 style="margin:0 0 6px 0">' + esc(L.byType) + '</h3><div style="margin:0 0 16px 0">';
  types.forEach(function (k) {
    h += '<div>' + esc(k) + ': <b>' + byType[k].ok + ' / ' + byType[k].n + '</b></div>';
  });
  h += '</div>';
  if (wrong.length) {
    h += '<h3 style="margin:0 0 6px 0">' + esc(L.wrong) + '</h3>';
    m.answers.forEach(function (a, i) { if (!a.correct) h += block(line(a, i), false); });
  }
  h += '<h3 style="margin:16px 0 6px 0">' + esc(L.all) + '</h3>';
  m.answers.forEach(function (a, i) { h += block(line(a, i), a.correct); });
  h += '<p style="margin-top:16px;color:#4a4f54;font-size:12px">' + GAME_URL + '</p></div>';
  return { html: h, text: t.join('\n') };
}

function clean(s, n) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
function esc(s) { return clean(s, 200).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
