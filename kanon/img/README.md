# Header artwork

The session header renders whichever of these exists. If the file is absent the
image element removes itself and the card falls back to plain type — no broken
icon, nothing to configure.

    img/hero-male.jpg      shown when Settings > Header figure = Male
    img/hero-female.jpg    shown when Settings > Header figure = Female

Both are 1600x900 marble-on-black: figure weighted to the left, crimson rim
light down its right edge, empty black across the right half for the session
title to sit in. The hero crops with object-fit: cover anchored left, so the
figure survives any aspect the card ends up at.

Keep the right-hand side dark. The overlay scrim is tuned for black there, and
a light background washes out the session title.

Current files:

  hero-male.jpg    Canva, retouched to remove a rendering artifact on the
                   right deltoid. Framing reference for the pair: figure
                   spans x 110-721, y 104-889.
  hero-female.jpg  Interim. The supplied 1600x900 nude torso, shifted right
                   100px and feathered into the black on its cut left edge so
                   the figure emerges from shadow instead of ending at a
                   straight slice. Pending replacement with the chosen draped
                   candidate once it can be moved out of Canva.

Canva source designs for the female candidates (export is currently refused
for designs created in that batch, so these have to be downloaded by hand):

  DAHVTS_PHaM  chosen    https://www.canva.com/d/Wd2-0i51D07O6Fz
  DAHVTQsQWvw  draped    https://www.canva.com/d/mHzYKpCDkh1RH-b
  DAHVTU8rCNQ  alternate https://www.canva.com/d/_tWlT0xebvm_dXm
