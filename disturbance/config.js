/* Deployment settings.
   submitUrl = the Google Apps Script web app that stores results in the instructor's Google
   Sheet, emails them, and serves the class rankings (disturbance_game/apps_script/ in the
   analysis repo). Empty = sending and class rankings are off.
   Add ?local=1 to the page address on this computer to use the local test server instead
   (disturbance_game/serve.py: stores in E:/disturbance_game/local_results.jsonl, no email).
   classes = what students can pick on the start page; results are grouped by id. Add one
   line per class session; the newest first. */
window.GAME_CONFIG = {
  submitUrl: "https://script.google.com/macros/s/AKfycbx94og1TT8PTarF5ZabjzhO_Xyk37QrnMhp7TnMa1Aykk2dMWUSNn9obdcMa8UUimgy/exec",
  classes: [
    { id: "2026-10-23", label: { en: "Class of 23 October 2026", pt: "Aula de 23 de outubro de 2026" } },
  ],
};
if (new URLSearchParams(location.search).get("local") === "1") window.GAME_CONFIG.submitUrl = "/api/results";
