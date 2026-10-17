# Published site snapshot

This is the built website from Netlify, not the TypeScript source.

- Site: https://onpar.site, formerly https://xstocks-tracker.netlify.app (Netlify project `xstocks-tracker`)
- Deploy: 6aced2a4bac172109cf9f9c3, published 14 October 2026 00:55 UTC. Framework: TanStack Start, server-rendered through one Netlify Function (the `@netlify/vite-plugin` server handler).
- Built by Grok Bot and deployed through its Netlify connector ("Deploy triggered by upload"). The page links `/__grok/manifest.webmanifest`.
- First snapshot taken 14 October 2026. Completed and re-checked against the live site on 17 October 2026.

Netlify's public API has no endpoint to download a deploy's uploaded source zip, and the server function code is not public. These files are the compiled pages and scripts, so they cannot be edited and redeployed as the desk. The source lives where it was built, in the Grok Bot project. The bot in the rest of this repo was not changed.

## Files

This folder holds every static file the live site serves for its two routes, `/` and `/portfolio`. On 17 Oct 2026 the `.js`, `.css`, `.jpg` and `.ico` files were byte-identical to the live site. The two `.html` files are server-rendered pages saved on 14 Oct, so they show that day's prices. `.gitattributes` marks this folder `-text`, so Git never changes the line endings here.

| sha256 | bytes | file |
|---|---|---|
| `200c409fa29c02d55870575e8e36063668e54c304b26fd74713ba5f8d6de33f0` | 74910 | `index.html` |
| `fd8c28bba3059a192161064de919e9be2d009c2d345bda0dc5b1286d0b9cd00c` | 9563 | `portfolio/index.html` |
| `fd30e044552c53701fbe87bfb65a0ae1eaf758fed57f793b9080b2a345aeb59b` | 437478 | `assets/index-DsbSsZHg.js` |
| `9161ed4357c7cc2517da1015e0bdcc79cc83acfe9d3aac14c30532b4ffe76073` | 411004 | `assets/routes-DFpPKySp.js` |
| `6a8b6989eaec50e6bc7c9fe31c74a76a4acdbded8a9b8e8eca782801ed2d8fa6` | 21035 | `assets/portfolio-B9e0s4hd.js` (missing until 17 Oct) |
| `9ed29dd441859d348f343899cfbf792fb822f439efb4a81350774a5aad7a1b2c` | 33549 | `assets/styles-BhqX348T.css` |
| `fcdaec2ba5bdabb8e298328716e68797d4d23fe0a23e8dec46a8ab457fa23a58` | 138312 | `logo.jpg` |
| `d029ee2f8b418ee988836acac9bb63b82be5e23d285c52d1f1afdfe3e546f4fe` | 15086 | `favicon.ico` (missing until 17 Oct) |

The server bundle is not public, so it is not in this folder. It is the `server` Netlify Function (about 2.6 MB) and holds the data loaders for quotes, offers and cryptos, which the pages call through `/_serverFn/…`.
