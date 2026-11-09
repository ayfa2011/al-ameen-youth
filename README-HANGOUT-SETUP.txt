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
  js/hangout/hangout-admin.repository.js  Quiz Admin writes for the approved Google account
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
3) Publish the database and Storage rules:
     firebase deploy --only database,storage --project al-ameen-website-e24d0
   or paste firebase/firebase-database.rules.json into Realtime Database -> Rules
   and firebase/storage.rules into Firebase Storage -> Rules.
   The Hangout rules accept the already verified Google Member session. A
   website upload alone does NOT publish rules (see DATA-SAFETY.md).
4) Before using quiz image/audio uploads, create the default bucket in Firebase
   Console -> Build -> Storage -> Get started, then verify its name matches
   `storageBucket` in `js/firebase-config.js`. The configured production bucket
   currently returns 404 because it does not exist. Cloud Storage requires the
   Blaze pay-as-you-go plan; review and approve any billing implications before
   enabling it.
5) Upload the website files to GitHub / hosting as usual.

HOW IT WORKS
------------
- Dashboard -> Hangout -> Online Quiz -> Quiz screen (when already signed in as a Member).
- Question Area has a fixed height. Only the area below it switches
  (Chat / Score Board / More / Profile). Chat keeps its messages when you switch.
- Quiz Admin Panel (gear icon) provides independent rooms, question drafts,
  editable questions, MCQ / True-False / Short Answer, time limits, points,
  explanations, and image/audio uploads. Questions remain private until
  published.
- Quiz Control has Start, Pause, Resume, Next, Previous, and End controls.
  The shared question timer pauses and resumes with the quiz; time expiry
  closes submissions and reveals the answer and explanation.
- Evaluation has separate pending and history sections for short answers.
  Correct answers award the configured points once; wrong answers award zero.
- Scoreboard Management is room-specific. Approved admins can inspect player
  totals and ranks, apply reason-required adjustments, and review immutable
  previous/new score history with editor and timestamp.
- Admins can publish or unpublish each room's results. Published snapshots are
  shown on the player Score Board; unpublished room results are not exposed
  there. Results can be published after the room is completed; adjustments and
  manual evaluations refresh an already published result.
- Chat messages have a "Hide" soft-delete action.
- Other Members and Admin & Incharges users can play, chat, and view scores,
  but cannot publish questions, change scores, or hide chat messages.
- Players cannot set their own score: Realtime Database rules validate the
  submitted correct answer and prevent duplicate automatic awards.
- Room score ledgers are stored separately from the all-time Hangout totals.
  Update the Realtime Database rules before using room score management; room
  results are published under the protected `hangout/publicResults` path.
- Players appear on the Score Board after their first Google login.

NOTES
-----
- Voice messages are stored inside the Realtime Database (max 45 seconds each).
- Question images and audio are stored in Firebase Storage under
  `/quiz-media/{roomId}/{questionId}/`; each upload is limited to 10 MB.
- On localhost Hangout stays off, same as the rest of the website
  (local testing needs the staging Firebase config described in DATA-SAFETY.md).
- If Google login opens in a new page on some phones (popup blocked), the site
  uses redirect sign-in; after returning, open Hangout again.
