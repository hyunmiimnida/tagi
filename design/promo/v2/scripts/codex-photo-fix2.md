Fix round 2 for scripts/photo.html (and compose-photos.mjs only if needed). cwd design/promo/v2. Edit only those two files. Do not run a browser.

Problem: on slides 1–5 the screen card sits right under the subtitle and leaves a large empty band at the bottom (up to 500px), which looks unbalanced.

Change: for slides 1–5, vertically center the "visual group" (screen card, plus the notification overlay on slide 5 which sticks out 40px above the card and pushes it down 70px — treat overlay+card as one group) inside the free area between (subtitle bottom + 48px) and (canvas bottom − 72px). Never let the group start higher than subtitle bottom + 48px. Keep horizontal centering, widths, crops and all styles as they are. Keep the fit check (throw if it does not fit).
