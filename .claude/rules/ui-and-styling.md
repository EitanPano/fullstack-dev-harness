# UI and styling

Applies to every frontend package.

- Design tokens are CSS variables in four scales: colour, spacing on a 4 px base, type, radius.
  The package's `AGENTS.md › Styling` names the file, the token names and the mechanism that
  exposes them to components. A component uses a token, never a literal size or colour.
- One toast library and one icon set per package, concise action-oriented toasts, the same
  icon for the same concept everywhere.
- No inline styles and no ad-hoc stylesheets beyond the package's token file.
- Semantic HTML, labelled controls, keyboard reachability, and a loading and an error state
  for every new route segment.
- The accessibility scan in the e2e suite passes.
- Mobile first: the package's base styles are the phone layout and its breakpoints widen it
  (named in `AGENTS.md › Styling`). A new route is checked on the phone viewport first (the
  package's e2e `phone` project, where it has one). No horizontal overflow at any viewport.
- Touch targets: buttons, nav links and form controls are at least 44 × 44 px; the package's
  shell spec asserts it on the phone project where it has one.
- The shell (`shared/ui` in the package) owns `<header>`, `<nav aria-label>`, the one `<main>`
  with a skip link, and `<footer>`; a feature adds its nav entry and renders inside `main`, never
  a second landmark set.
- The brief is `.doc/product-definition.md › Design`; a `figma:<url>` backlog marker overrides
  it for that task.
