# Forest Disturbance Game - backend setup (Google Sheet + Apps Script)

The game (`../index.html`, `../game.js`, ...) is a static page on GitHub Pages. Everything that
needs a server lives in **one Google Apps Script bound to a Google Sheet** (`Code.gs` here):

| What | How |
| --- | --- |
| Store each finished game | one row in the Sheet's **results** tab |
| Email the result | to the student, instructor (`TEACHER_EMAIL` in `Code.gs`) on BCC |
| Class ranking page | `GET <web app>?action=class&group=<id>` (names + scores, never emails) |
| Groups ("+ Add group") | stored in the **groups** tab; `GET ?action=groups`, `POST {action:"addGroup", label, instructor}` |
| Close / re-open a group | on its results page with the group's manage key: `POST {action:"setStatus", group, key, closed}` |
| Manage links by email | `POST {action:"emailManageLinks"}`, sent to `TEACHER_EMAIL` only |
| Clean up / fix | menu **Disturbance game** inside the Sheet (owner only), see below |

No cost: Apps Script on a personal Google account has no billing.

## Recreate from scratch (~10 min)

1. **Sheet.** Create a new Google Sheet (any name, e.g. "Disturbance game results"). The
   `results` and `groups` tabs and their headers are created automatically on first use.
2. **Script.** In the Sheet: **Extensions > Apps Script**. Delete the sample code, paste all
   of `Code.gs`, check `TEACHER_EMAIL` and `GAME_URL` at the top, and save.
3. **Deploy.** **Deploy > New deployment**, type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click **Deploy**, then **Authorize access** and allow sending email and editing the Sheet
   (Google warns because the script is unverified: *Advanced > Go to project (unsafe)*).
4. **Connect the page.** Copy the web-app URL (ends in `/exec`) into `../config.js` as
   `submitUrl`, commit and push the website.
5. **Check.** Open the URL in a browser: it must show `{"ok":true,"service":"disturbance-game"}`.
   `<URL>?action=groups` must show `{"ok":true,"groups":[]}`. Then play one game with your
   own email and check the email and the new row.
6. **Menu.** Reload the Sheet: a **Disturbance game** menu appears (first use asks for
   authorization once).

## After editing `Code.gs`

Paste the new code, save, then **Deploy > Manage deployments > (pencil) > Version: New version
> Deploy**. The URL stays the same. Without a new version the web app keeps running the old
code (the Sheet menu, `onOpen`, uses the saved code directly, so a change that only touches
the menu works after Save + reloading the Sheet; anything in `doGet`/`doPost` needs the new
version). Always paste the **whole** file: the latest copy is this folder's `Code.gs`
(raw: https://raw.githubusercontent.com/ricds/ricds.github.io/main/disturbance/backend/Code.gs).

## Sheet menu "Disturbance game"

Appears when the Sheet is opened (owner only; the first use asks for authorization).

- **Limpar "Sem turma" (practice)** - deletes all results with no group, after confirming.
- **Limpar uma turma...** - asks for a group id (column `id` of **groups**) and deletes its
  results, after confirming.
- **Mover "Sem turma" de hoje para um grupo...** - for students who forgot to pick the group:
  asks for a group name, creates that group with exactly that name if it does not exist
  (no date added, no instructor - fill the `instructor` cell by hand), lists today's "no
  group" results and, after confirming, moves them into the group. Shows the group link and
  ranking link at the end. "Today" is the script's time zone (File > Project settings).
## Closing / re-opening a group (on the website)

Every group has a secret **manage key** (column `key` of **groups**; filled in automatically
for groups made before keys existed). Whoever has a group's **manage link**
(`.../disturbance/?view=class&class=<id>&key=<key>`) sees, on that group's results page, a
dashed bar with **Close group** / **Re-open group**. Nobody else sees it, and the server
refuses a wrong key.

- **Getting the manage link:** the instructor who creates a group on the page sees it in the
  "group created" popup, and that browser remembers it. For any group, the hidden **Manage**
  link (background colour, bottom of the class results page, next to **Review**) emails the
  manage links of all groups to `TEACHER_EMAIL` only (at most once per 5 minutes).
- Opening a manage link stores the key in that browser and removes it from the address bar,
  so the ranking link copied from the address bar never carries the key.
- Keep manage links private: anyone with one can close or re-open that group.

A closed group (`status` = `closed`):
- is no longer offered on the start page, and its link (`?class=<id>`) explains it is closed;
- keeps its ranking page, marked "Closed for new entries";
- takes no new results: a game finished through an old link or an open tab is still saved
  and emailed, but under "no class", so the closed ranking does not change.

Typing `closed` in the `status` cell by hand also works.

## Sheet layout

- **results**: `received, group, name, email, org, lang, score, total, seconds, started,
  finished, answers_json` (+ any column added later is appended to the header automatically;
  rows are written by column name). `group` is empty for "no class (just practising)".
  `answers_json` holds all 30 answers (site id, place, lat/lon, right answer, chosen answer,
  correct, sure/guessing).
- **groups**: `created, id, label, instructor, status, key` (read by column name, any order; a missing
  column is added to the header automatically). Rows come from "+ Add group" on the page,
  which asks for the group name and the instructor's name; the label gets the creation date;
  the id looks like `2026-10-23-sensoriamento-remoto-ab12`. The instructor is shown on the
  class results page ("Instructor: ..."); "no class" has none. Edit a cell to fix a name;
  delete a row to remove a group from the list (its results stay in **results**).

## Using it in class

- Create the group on the page (**+ Add group**, under the start form: group name +
  instructor) and share the link it gives (`.../disturbance/?class=<id>`), which opens the
  game with the group preselected. The start page otherwise defaults to "no class".
- Project the ranking: `.../disturbance/?view=class&class=<id>` (refreshes itself every 30 s).
  On the class page the address bar always shows this link, ready to copy. A hidden
  **Review** link (background colour, centred at the very bottom) opens review mode.
- Only each email's **first** finished game in a group counts in the ranking.
- Clean test games: Sheet menu **Disturbance game > Limpar "Sem turma"** or **Limpar uma
  turma...** (asks for the group id, column B of **groups**).

## Keeping the emails out of spam

Results are sent from the Google account that deployed the script. In Outlook/Hotmail open
the message in Junk, choose **Not junk** and add that address to **Safe senders**; in Gmail
**Report not spam**. Tell students which address sends the result and to check Spam once.

## Limits (free Google account)

- ~100 email recipients/day; each game uses 2 (student + BCC) -> ~50 games/day.
- ~30 simultaneous script runs; the class page asks once per 30 s per open copy.
- Max 300 groups (`MAX_GROUPS` in `Code.gs`).

## Local testing (optional)

The analysis repo (`deep_forest_monitoring`, folder `disturbance_game/`) has `serve.py`, a
local stand-in for this script: open `http://localhost:8765/disturbance/?local=1` and results
and groups are stored in `E:/disturbance_game/` with no email. The image chips and site list
are made there too (`chips.py`, `sites.json`, `publish.py`; see its README).

## Review mode

`.../disturbance/?review=1` (optionally `&img=18`): arrow keys move between images without
answering, **A** shows the answer; nothing is recorded or sent. Do not share it with students.
