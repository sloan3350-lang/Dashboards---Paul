# Header artwork

The session header renders whichever of these exists. If the file is absent the
image element removes itself and the card falls back to plain type — no broken
icon, nothing to configure.

    img/hero-male.jpg      shown when Settings > Header figure = Male
    img/hero-female.jpg    shown when Settings > Header figure = Female

Both were made in Canva from the marble-statue-on-black brief: figure on the
left, crimson rim light, empty black across the right for the wordmark to sit
in. Roughly 1600x1000 is right; the hero crops with object-fit: cover and
anchors to the left, so the figure survives any aspect.

Keep them dark on the right-hand side. The overlay scrim is tuned for black
there, and a light background will wash out the session title.
