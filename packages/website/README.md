# Nouto Docs

Documentation website for [Nouto](https://github.com/frostybee/nouto), an open-source REST client and local-first alternative to Postman and Thunder Client.

Built with [Astro Starlight](https://starlight.astro.build). Runs as a static site.

## Development

```bash
pnpm install   # from the monorepo root
pnpm dev       # starts dev server at localhost:4321
pnpm build     # builds to ./dist/
pnpm preview   # preview the production build locally
```

## Structure

```
src/
  content/docs/   # all documentation pages (.md)
  components/     # custom Astro components (Hero, FeatureList, etc.)
  layouts/        # page layouts
  assets/         # images and icons
  styles/         # custom CSS
astro.config.mjs  # Starlight config and sidebar definition
```

Pages in `src/content/docs/` are auto-routed by filename. The sidebar is configured in `astro.config.mjs`.