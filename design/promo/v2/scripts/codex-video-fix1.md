Fix round 1 for scripts/video.html (cwd design/promo/v2). Edit only scripts/video.html (and compose-video.mjs only if required). Do not run a browser or ffmpeg.

1. HOOK scene: the text+pills block sits at top 560 and leaves the lower half of the 1920 frame empty. Vertically center the whole block (text + pills, measured with all 4 pills laid out) so its center is at y=900. Keep frame 0 showing the main text. Make the text 100px (still 2 lines within 920px — check) and pills 44px text.
2. END scene: everything is too small for a phone. Scale up: icon 216px (radius 48px), "캠퍼스모아" 88px, tagline 44px, URL card text 66px with padding 40px 60px, last line 40px. Center the column vertically at y=900. Keep staggered fade-in and the 1.2 s still hold at the end.
3. Keep everything else unchanged (timeline, captions, screen card, taps, notification).
