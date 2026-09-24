# Quiz initial setup

The website's quiz entry page and login flow are ready. To publish the initial question bank and the two requested member accounts into the live quiz spreadsheet:

1. Open the Google Apps Script project currently deployed at the URL in `js/quiz-config.js`.
2. Update it with `quiz-backend.gs` and save.
3. In Apps Script project settings, set `QUIZ_SPREADSHEET_ID` to the quiz spreadsheet ID (or bind the script to that spreadsheet).
4. Run `seedInitialQuizContent()` once and authorize it. It creates the quiz tabs, inserts 20 editable question rows, and adds Safwan (8105027723) and Nasir Paladka (8296793691), both with initial password `ayfa`.
5. Deploy the saved Apps Script as a new web app version so the website uses the update.

The seeding function is safe to rerun: it skips question numbers and mobile numbers that already exist. It stores salted password hashes in the sheet, never plaintext passwords. Both members should change the temporary password after signing in.

Question edits are available through the quiz Admin page, and direct edits in `QuizQuestions` are also picked up by the live quiz.
