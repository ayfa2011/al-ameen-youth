AL AMEEN HANGOUT (ONLINE QUIZ) - SETUP
======================================

WHAT WAS ADDED (nothing else was changed)
-----------------------------------------
Edited (small additions only):
  index.html                              -> 1 css link, 1 "Hangout" dashboard button, 9 script tags
  firebase/firebase-database.rules.json   -> new "hangout" block added; every existing rule is untouched

New files:
  css/hangout.css                         DESIGN only
  js/hangout/hangout-firebase.js          Main member session + standalone Hangout Firebase connection
  js/hangout/hangout-auth.js              Google account login only
  js/hangout/hangout.repository.js        Database reads/writes for Google users
  js/hangout/hangout-admin.repository.js  Database writes for officials (audited, same helpers as other features)
  js/hangout/hangout.service.js           Logic only (ranking, validation, formatting)
  js/hangout/hangout-hub.view.js          Hangout menu + full-screen shell
  js/hangout/quiz.view.js                 Quiz screen: question area, scoreboard, profile, more
  js/hangout/quiz-chat.view.js            Live chat, emoji, voice messages
  js/hangout/quiz-admin.view.js           Admin controls

The main website uses Google sign-in for Members and password sign-in for
Admin & Incharges. Hangout reuses a signed-in Member's website Google session,
so Members do not need to sign in again.

ONE-TIME SETUP (do these BEFORE opening Hangout)
------------------------------------------------
1) Firebase Console -> Authentication -> Sign-in method -> turn ON "Google".
2) Firebase Console -> Authentication -> Settings -> Authorized domains ->
   make sure your website domain is listed (e.g. yourname.github.io or your own domain).
3) Publish the new rules (same way you published rules before):
     firebase deploy --only database --project al-ameen-website-e24d0
   or paste firebase/firebase-database.rules.json into Realtime Database -> Rules.
   The Hangout rules accept the already verified Google Member session. A
   website upload alone does NOT publish rules (see DATA-SAFETY.md).
4) Upload the website files to GitHub / hosting as usual.

HOW IT WORKS
------------
- Dashboard -> Hangout -> Online Quiz -> Quiz screen (when already signed in as a Member).
- Question Area has a fixed height. Only the area below it switches
  (Chat / Score Board / More / Profile). Chat keeps its messages when you switch.
- Admin controls (gear icon, top right of the quiz header) appear only when an
  Admin & Incharges account is logged in on the main website:
    * Question tab : month label, title, text, picture (link or upload), publish / clear
    * Scores tab   : add or subtract points for a player (with a note)
    * Chat         : "Hide" link on each message (soft delete, like the rest of the site)
- Scores are given by the admin only; players cannot change them.
- Players appear on the Score Board after their first Google login.

NOTES
-----
- Voice messages are stored inside the Realtime Database (max 45 seconds each).
- Picture uploaded by admin is shrunk and stored with the question.
- On localhost Hangout stays off, same as the rest of the website
  (local testing needs the staging Firebase config described in DATA-SAFETY.md).
- If Google login opens in a new page on some phones (popup blocked), the site
  uses redirect sign-in; after returning, open Hangout again.
