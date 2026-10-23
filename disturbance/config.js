/* Deployment settings.
   submitUrl = the Google Apps Script web app that stores results in the instructor's Google
   Sheet, emails them, and serves the class rankings (disturbance_game/apps_script/ in the
   analysis repo). Empty = sending and class rankings are off.
   Add ?local=1 to the page address on this computer to use the local test server instead
   (disturbance_game/serve.py: stores in E:/disturbance_game/local_results.jsonl, no email).
   classes = fixed groups always offered on the start page (results are grouped by id).
   Normally empty: groups are created on the page with "+ Add group" and stored in the
   "groups" tab of the results Sheet. */
window.GAME_CONFIG = {
  submitUrl: "https://script.google.com/macros/s/AKfycbx94og1TT8PTarF5ZabjzhO_Xyk37QrnMhp7TnMa1Aykk2dMWUSNn9obdcMa8UUimgy/exec",
  classes: [],
};
if (new URLSearchParams(location.search).get("local") === "1") window.GAME_CONFIG.submitUrl = "/api/results";
