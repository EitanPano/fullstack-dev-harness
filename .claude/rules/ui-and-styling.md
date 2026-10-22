# UI and styling

Applies to every frontend package.

- Design tokens are CSS variables; the package's `AGENTS.md › Styling` names the file and the
  mechanism that exposes them to components.
- One toast library and one icon set per package, concise action-oriented toasts, the same
  icon for the same concept everywhere.
- No inline styles and no ad-hoc stylesheets beyond the package's token file.
- Semantic HTML, labelled controls, keyboard reachability, and a loading and an error state
  for every new route segment.
- The accessibility scan in the e2e suite passes.
