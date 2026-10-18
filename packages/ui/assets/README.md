# Brand assets

`logo.png` is the owner-supplied Lyra portrait (`IMG_20261018_113422.png`). `favicons/` contains the supplied `favicon_lyra` set. Preserve the original artwork and icon files; each app copies the relevant assets into its public directory and customizes its web manifest identity and theme.

`welcome-artwork.png` is the original owner-supplied background (`IMG_20261018_113158.png`). Lyra serves a compressed WebP derivative at `/welcome-artwork.webp`, displayed at 20% opacity across the empty conversation view, including the header and bottom area. The sidebar, navigation drawer, and composer have opaque backgrounds. It is decorative and does not appear behind chat messages.

Lyra displays its portrait with a circular crop. Versioned icon URLs and the offline cache version ensure the replacement branding can refresh on installed clients; the manifest ID remains stable.
