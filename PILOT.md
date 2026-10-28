# INeed concierge pilot

The home page is the general concierge. Existing security-product support is at `/manuals`; `/admin` still manages its approved manuals. Existing invite-only authentication is retained.

## Runtime

Uses existing Supabase variables and `ANTHROPIC_API_KEY` on the server. `CONCIERGE_MODEL` optionally overrides the existing manuals model. No database migration is required for the concierge. No secrets belong in Git.

Clear first-turn local requests with a selected area and simple ingredient-only recipes skip the separate AI planning call. Other requests and follow-ups are interpreted into a task brief. Answers use Claude with web search when needed. Local/current recommendations require returned source citations. Search failure without citations returns an honest error instead of unverified recommendations. Search is limited to two uses per API round and two rounds; answer output is limited to 4,000 tokens per round with an 85-second overall abort signal and no automatic retries. The model prompt requests short answers; it is not a guarantee of factual correctness.

Authentication is verified inside the server action. Input lengths are validated server-side. A best-effort per-instance guard allows 15 concierge requests per account per hour and one concurrent request. This is NOT a distributed quota or hard spending cap: serverless instances/restarts reset it. Keep the pilot small and configure provider spending controls before inviting a wider audience. Existing manuals actions have their existing limits.

Request, selected city, and up to four prior turns go to Claude. Search may send derived queries to the provider's search service. Conversation state stays in browser memory; the app does not add a conversation database. Provider retention still applies. The feedback download is a local text file containing the request and response; the tester chooses whether to share it.

## Verification

Run `node --test tests/concierge.cjs`, `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`.

The test harness replaces external API calls, not application logic. It covers input limits, citation URL filtering, clarification, mandatory local-search evidence, search failures, direct recipe answers, paused search, and truncated/refused output. Live response quality requires the deployed tests below.

## First tester session

Use an existing invited account. Share the invitation code privately, never the administrator password.

1. Ask for a rice-and-chickpea recipe. Expect quantities and steps, not web claims.
2. Ask for a plumber in Bucharest. Expect real sources or an explicit inability to verify; no invented booking or availability.
3. Ask for a quiet restaurant. Open each source and check name, area and relevance.
4. Clear the city and ask for a nearby service. Expect a location clarification.
5. Switch to Romanian and repeat. Ask a follow-up, then start a new request and verify old context is cleared.
6. Open Manuals, select an existing product, and ask a normal operating question. Check the cited page.
7. Test on a phone. Confirm the input, answer and source links remain usable.
8. Download the response for feedback; add whether it solved the need and any incorrect facts. Do not include private personal information.

Pilot limitations: web search is not a complete local-business directory; no precise-distance ranking, confirmed availability, booking, payment or provider vetting. Source links are evidence to inspect, not endorsements. Keep the first trial to a few invited testers before expanding.

## Optional device location

Use my location requests a single browser position only on click. The browser sends rounded coordinates (3 decimals) directly to BigDataCloud; that provider also receives the IP and uses these signals to improve its location data. Only the resulting editable area name enters the concierge request. No coordinates are stored by INeed or sent to Claude. There is no IP fallback when permission is denied, no background tracking, and no default city. Changing the area clears old conversation context. Permission denial, timeout, poor accuracy and lookup failure keep manual area entry available.

## Response latency

The fast path removes one sequential model call for supported requests; it does not remove source validation. Answers target 100–150 words and three options. Search starts with a targeted query and may make a second when evidence is insufficient. The UI displays elapsed time, not invented completion percentages. Provider and search latency remain variable; no fixed response-time guarantee. Logs record planning and answer timing without request text.

## Photo questions

Add a photo or Take a photo attaches one image, with a preview and remove button. JPEG, PNG and WebP inputs up to 15 MB are resized to 1280 px and re-encoded as JPEG locally, stripping original metadata. Unsupported formats show an error. The encoded payload is capped at 650,000 characters, leaving room under the existing 1 MB action limit. Server validation rejects oversized/non-JPEG payloads.

Nothing is uploaded until a question is submitted. The photo is sent to Claude as an image block for planning and answering, not as base64 text. Photos skip text-only fast routing. The visible attachment remains for follow-up questions until removed or a new request is started. New/replaced/removed photos clear old context. INeed adds no photo storage; provider retention still applies. Feedback exports omit the image. Device camera behavior depends on the browser.
