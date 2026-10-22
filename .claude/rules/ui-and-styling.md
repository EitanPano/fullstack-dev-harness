# UI and styling

Applies to `frontend/` and `templates/frontend/`.

- Tailwind utility classes only. No new `.css` files beyond `globals.css`, no inline
  styles.
- Design tokens are CSS variables declared in `:root` in `globals.css` and exposed to
  utilities through `@theme inline`.
- `sonner` for toasts, concise and action-oriented. `lucide-react` for icons, the same icon
  for the same concept everywhere.
- Semantic HTML, labelled controls, keyboard reachability, and `loading.tsx` plus
  `error.tsx` for every new route segment.
