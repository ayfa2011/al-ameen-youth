---
name: move-back-button
description: Move back button from top bar to bottom of view
metadata:
  type: project
---
The user wants to move the "Back" button from the top header to the bottom of the page for better usability. Additionally, the back button currently functions as a home button, it should be changed to perform a proper "back" navigation action.

Critical files:
- `index.html`: Update the HTML structure of the top header to remove the back button and add it to the view containers.
- `js/script.js`: Update the `updateAppTopBar` function (currently responsible for showing/hiding the back button in the header) and implement/update the back button functionality.

Plan:
1. Identify all instances of the back button in `index.html`.
2. Remove the top back button from `appTopBar` in `index.html`.
3. Create a new back button component for the bottom of the views in `index.html`.
4. Update `js/script.js` to change the back button's functionality to use `history.back()`.
5. Update `css/style.css` to style the new bottom back button.
6. Verify navigation works as expected.
