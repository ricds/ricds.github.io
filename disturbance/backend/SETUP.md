# Forest Disturbance Game - backend setup (Google Sheet + Apps Script)

The game (`../index.html`, `../game.js`, ...) is a static page on GitHub Pages. Everything that
needs a server lives in **one Google Apps Script bound to a Google Sheet** (`Code.gs` here):

| What | How |
| --- | --- |
| Store each finished game | one row in the Sheet's **results** tab |
| Email the result | to the student, instructor (`TEACHER_EMAIL` in `Code.gs`) on BCC |
| Class ranking page | `GET <web app>?action=class&group=<id>` (names + scores, never emails) |
| Groups ("+ Add group") | stored in the **groups** tab; `GET ?action=groups`, `POST {action:"addGroup"}` |
| Clean up | menu **Disturbance game** inside the Sheet (owner only) |

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
code (the Sheet menu, `onOpen`, uses the saved code directly).

## Sheet layout

- **results**: `received, group, name, email, org, lang, score, total, seconds, started,
  finished, answers_json` (+ any column added later is appended to the header automatically;
  rows are written by column name). `group` is empty for "no class (just practising)".
  `answers_json` holds all 30 answers (site id, place, lat/lon, right answer, chosen answer,
  correct, sure/guessing).
- **groups**: `created, id, label`. Rows come from "+ Add group" on the page; the label gets
  the creation date; the id looks like `2026-10-23-sensoriamento-remoto-ab12`. Delete a row to
  remove a group from the list (its results stay in **results**).

## Using it in class

- Create the group on the page (**+ Add group**, under the start form) and share the link it
  gives (`.../disturbance/?class=<id>`), which opens the game with the group preselected.
- Project the ranking: `.../disturbance/?view=class&class=<id>` (refreshes itself every 30 s).
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
