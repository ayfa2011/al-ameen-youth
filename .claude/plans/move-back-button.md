# Plan to move and fix Back button

## Context
The "Back" button is currently located in the top bar near the logo. It is meant to be a navigation button but currently behaves like a "Home" button in some contexts. The user wants it moved to the bottom of the page and fixed to function as a genuine "Back" button that navigates to the previous view.

## Critical Files
- `index.html`: Contains the UI structure for the top header and different view containers.
- `js/script.js`: Manages application state, view navigation, and top bar updates.
- `css/style.css`: Defines styles for the top bar and buttons.

## Recommended Approach
1. **Remove top header Back button**: Locate the existing back button in the `<header>` element within `index.html` and remove it. Update `js/script.js`'s `updateAppTopBar` to stop managing this element's visibility.
2. **Add bottom Back button**: Add a new Back button component to the bottom of the necessary `view-section` containers in `index.html`.
3. **Fix functionality**: Create a `goBack()` function in `js/script.js` that calls `history.back()` or simulates view navigation history. Link the new bottom buttons to this function.
4. **Style the button**: Update `css/style.css` to define the styling for the new bottom Back button, ensuring it's visually appropriate for its new position.
5. **Verify**: Use the app (skill `run`) to navigate between views and confirm the Back button works as expected, returning the user to the previous view.
