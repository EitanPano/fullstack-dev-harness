---
paths: ["frontend/**"]
---

# UI and styling

Applies to every frontend package.

- Design tokens are semantic CSS variables (a colour set that includes success, warning and
  info; spacing on a 4 px base; type; radius), generated from the brand. The package's
  `AGENTS.md › Styling` names the file and the utilities that expose them. A component uses
  those utilities only, never a literal colour or size.
- One toast library and one icon set per package, concise action-oriented toasts, the same
  icon for the same concept everywhere.
- No inline styles, and no stylesheet where the package's `AGENTS.md › Styling` puts none (its
  global tree; in an SPA also a sibling of its owner).
- Semantic HTML, labelled controls, keyboard reachability. Every route has a loading and an
  error state, its own or its group's; every data section has a skeleton that matches its
  layout.
- Status is shown by a Badge chosen by meaning, with words or an icon, never by colour alone.
  A toast comes from the awaiting handler, never an effect or an interceptor.
- The accessibility scan in the e2e suite passes.
- Mobile first: the package's base styles are the phone layout and its breakpoints widen it
  (named in `AGENTS.md › Styling`). A new route is checked on the phone viewport first (the
  package's e2e `phone` project). No horizontal overflow at any viewport.
- Touch targets: 44 px on touch only (`pointer-coarse:`); on a fine pointer the WCAG 2.2
  minimum of 24 px holds. The shell spec asserts it on the `@phone` tests.
- The package's control components (the directory its `AGENTS.md › Styling` names) are the one
  place for a control; a raw `button`, `input`, `select` or `textarea` elsewhere fails the gates.
- The template's shell is a skip link and the one `<main id="main">`. Header, navigation,
  footer and the places of the theme toggle and account menu are product code, built only as
  the plan's `shell` line says (`ui-design › Shell`). A page renders inside `main` and adds a
  nav entry, never a landmark set.
- The brief is `.doc/product-definition.md › Design`; a `figma:<url>` backlog marker overrides
  it for that task. The generator applies the brand values at the bootstrap; changing them
  later edits the tokens, by plan only.
