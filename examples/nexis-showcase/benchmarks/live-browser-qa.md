# Live browser QA

**Target:** https://5173-iy9pzx89dcpgt94u8wm8i-f0b5585c.sg1.manus.computer/

## Homepage

The temporary public homepage returned a rendered Nexil Showcase document with title `Nexil Showcase — HTML-first, resumable applications`. It exposed navigation links for Features, Labs, Docs, and Status, two CTA links, and the `#signal-button` interactive control. The document showed the SSR, no-hydration, resumability, media/CSS, server-policy, adapter, and SEO evidence sections.

## Features route

`/features` returned the title `Nexil Features — Runtime surface area`, rendered its nine-package inventory, and exposed the `Open evaluation lab` link. No button or form control was present on this route; the available controls were navigation links only. The route displayed the feature map and evidence counts without a browser error in the inspected state.

## Labs route and controls

`/labs` returned `Nexil Labs — Runtime evaluation surface` and exposed two buttons, one text input, one submit form, and navigation links. Clicking `Run a batched update` changed the button text from `Run a batched update` to `Batch flushed / 1`, confirming the lazy state interaction works on the public preview without navigation. The route also rendered the action endpoint contract, serialized payload, security headers/cookie evidence, and adapter status.

The Labs action form accepted the `Grace` input and the resumable submit boundary fired, but the public-origin request returned `Forbidden origin` in the live page. This is a real deployment/configuration gap: direct benchmark POSTs without a browser `Origin` passed, while the browser’s temporary public origin was not allowlisted by the development action middleware. The button therefore did not produce the expected success output on the public URL and should be fixed or documented as origin configuration dependent.

After restarting with `NEXIS_TRUST_PROXY=1`, the public Labs route again loaded normally. Clicking `Run a batched update` changed the label to `Batch flushed / 1`, so the live ScopeRef/reactivity control works through the public proxy.

With trusted proxy origin handling enabled, the same public-origin form submission succeeded. Entering `Grace` and clicking `Call the action` produced `Action result: queued:Grace` without navigation. The earlier `Forbidden origin` behavior is resolved for the configured temporary proxy.

## Dynamic documentation routes

`/docs/architecture` returned the route-specific architecture copy, title `Nexil Documentation — Architecture note`, dynamic path evidence, and links for the lab, showcase, and feature map. It contained no button or form control.

`/docs/resumability` returned the route-specific resumability copy with the same document title, dynamic static-path evidence, and the same navigation links. It contained no button or form control. Both routes rendered without visible browser errors.

## Remaining published routes

`/docs/performance` returned the route-specific performance copy, the dynamic static-path marker, and the expected lab/showcase/feature links. It contained no button or form control.

`/status` returned `Nexil Showcase Status — Runtime health`, showed healthy route graph and SSR indicators, a present security policy, a ready benchmark harness, and `Disabled by default: emitted telemetry script bytes 0`. It exposed navigation links only and no button or form control.

## Crawl endpoints

The live `/sitemap.xml` endpoint rendered valid XML with seven published `<url>` entries for the homepage, features, labs, status, and three dynamic documentation paths. The live `/robots.txt` endpoint rendered `User-agent: *` and a sitemap URL pointing to `https://nexis-showcase.example/sitemap.xml`. Both endpoints were reachable through the temporary public proxy.

## Unknown route and proxy stability

The live `/not-found-check` route returned a plain `Not Found` response as expected. When returning to the public homepage immediately afterward, the proxy displayed `This page is currently unavailable`, indicating that the temporary proxy or backing process had become unavailable during the browser session. The local server and proxy must be revalidated before delivery; this is a limitation of the temporary session-backed URL rather than a route assertion.

## Homepage signal retest after server repair

After repairing the stale workspace dependency and restarting the public server, the homepage returned normally. The `#signal-button` was clickable in the browser, but its visible text remained `Trigger the signal` after the click and after a subsequent page inspection; it did not reach the expected acknowledged state. This is a real live-browser failure requiring console/network diagnosis, despite the labs button and action form working.

The initial browser click inspection did not show an update immediately, but a controlled in-page click confirmed the emitted chunk resolved with HTTP 200 and changed the label to `Signal acknowledged / 1`; a subsequent real browser click changed it to `Signal acknowledged / 2` without navigation. The homepage control therefore works; the first observation was a timing/inspection artifact, not a reproducible application failure. Browser console inspection produced no error output.

## Navigation controls

The Features navigation link was present with the expected `/features` target. The browser overlay click did not change the page within the tool response, while invoking the same anchor from the page caused navigation and the evaluation ended with a target-navigated runtime notice; this indicates the link itself initiated navigation rather than an application error. The route had already been independently verified as a successful 200 page. Other unique navigation/CTA targets were independently opened and verified: `/features`, `/labs`, `/docs/architecture`, and `/status`.

After the local dependency repair and server restart, the Features-to-Labs navigation control successfully loaded `/labs`. On the restarted public server, `Run a batched update` changed to `Batch flushed / 1`; entering `Grace` and submitting `Call the action` produced `Action result: queued:Grace` without navigation. These controls remain verified as working through the temporary HTTPS proxy when `NEXIS_TRUST_PROXY=1` is enabled.

## Final HTTP revalidation

After the final rebuild, the temporary public proxy returned `200` for `/`, `/features`, `/labs`, all three documentation routes, `/status`, `/sitemap.xml`, and `/robots.txt`; `/not-found-check` returned `404`. A raw public POST to the Labs action with the temporary HTTPS `Origin` returned `200` and the JSON success envelope `{"ok":true,"data":"queued:FinalCheck2"}`. The local sandbox’s engine-proof fixture can leave `packages/css/node_modules/tailwind-merge` pointing at a removed temporary directory; restoring that ignored workspace link before a fresh build makes the repository checks pass, and this did not alter tracked source files.
