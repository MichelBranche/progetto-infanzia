# Branchefy v0.2.15

## Performance e fluidità

- **Homepage più reattiva**: keep-alive della home, virtualizzazione delle row orizzontali e delle griglie Film/Serie, ricerca deferred, prefetch dettaglio al passaggio del mouse, poster progressivi con shimmer.
- **Boot reale dopo l'intro**: il loading resta finché catalogo e homepage sono pronti (hero + slider), così non si apre su skeleton; aurora di preparing in CSS (non si congela più).
- **Top 10 di nuovo in home**: solo titoli Streaming Community (ricostruito da trending se manca lo slider SC).

## Manga

- **Libro 3D ripristinato su desktop**: sfoglio fronte/retro con `rotateY`; su mobile resta lo swipe Kindle.

## Piattaforme

- **Windows**: aggiornamento automatico in-app dalla release GitHub
- **Web app**: deploy su Vercel — ricarica quando compare il banner aggiornamento
- **macOS**: scarica il nuovo `.dmg` dalla release GitHub
