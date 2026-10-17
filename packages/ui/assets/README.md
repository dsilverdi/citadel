# Citadel brand assets

`logo.png` and the files in `favicons/` are the original assets supplied by the owner. Preserve their geometry and cyan coloring. Each app copies these into its public directory; its web manifest may customize the app name, start URL, and theme colors.

Lyra serves its logo at `/logo.png` and the favicon set at the public root. The transparent PNG is displayed with `object-fit: contain` so its aspect ratio stays intact.
