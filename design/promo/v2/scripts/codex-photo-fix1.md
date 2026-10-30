Fix round 1 for scripts/photo.html and scripts/compose-photos.mjs (cwd design/promo/v2). Edit only these two files. Do not run a browser.

Problem: screen cards are cut in the middle of content (an item's tag row, calendar digits, a button row) because the crops were too tall and got shortened automatically. That looks careless. Also slide 6 leaves the bottom third empty.

1. Support a per-slide card width `width` (CSS px, default 920). scale = width / crop.w. Card stays horizontally centered.
2. Never shorten a crop silently any more: if crop.h × scale (+70 when overlay) does not fit above the 72px bottom margin, throw an error naming the slide. Remove the "윗부분 유지, 하단 축소" logic.
3. Replace the crop data with exactly:
   1 cover:  raw/04-tag-list.png  crop {x:0,y:118,w:390,h:286}  width 920
   2 school: raw/01-school-panel.png crop {x:0,y:178,w:390,h:372} width 840
   3 tags:   raw/03-tag-panel.png crop {x:0,y:118,w:390,h:296} width 920
   4 detail: raw/05-detail.png crop {x:0,y:108,w:390,h:358} width 860
   5 alert:  raw/07-calendar.png crop {x:0,y:128,w:390,h:290} width 920 (overlay unchanged)
4. Slide 6: make the white card fill the space better: padding 64px, URL 64px, steps text 38px weight 600, step circles 60px (28px number), 44px between steps. Put the app icon (../raw/app-icon-192.png, 112px, radius 26px) at the top of the card, 36px above the URL. Keep the footnote 72px above the bottom edge.
5. Keep everything else (colors, fonts, brand row, title/subtitle styles, overflow warnings).
