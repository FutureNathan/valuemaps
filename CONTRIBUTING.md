# Contributing to Value Maps

Thanks for your interest — contributions and ideas are very welcome! 🌍

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # please run this before opening a PR
```

No configuration is required to run it locally — community responses fall back
to demo mode and the reference data + planet images are committed.

## Where things live

| You want to… | Edit |
| --- | --- |
| Add/rephrase a "want" or a tension pair | `lib/values.ts` |
| Add a data source or metric / colors | `lib/sources.ts` |
| Add or tweak a translation (EN/ES) | `lib/i18n.ts` |
| Add a world or named regions | `lib/worlds.ts` |
| Refresh reference data | `npm run build:data` |
| Regenerate the share image / planet textures | `npm run build:images` / `npm run build:bodies` |

## Guidelines

- Keep it simple and fast — the globe is plain `<canvas>` + `d3-geo` on purpose.
- Match the surrounding code style; TypeScript should pass `npm run build`.
- Be respectful and assume good faith. This project is about showing that people
  can hold many hopes at once — please keep that spirit in discussions too.

## Reporting issues

Open a GitHub issue with steps to reproduce (and a screenshot if it's visual).
Feature ideas are great too.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
