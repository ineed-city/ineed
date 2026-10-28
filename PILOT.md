# INeed concierge pilot

The home page is the general concierge. Existing security-product support is at `/manuals`; `/admin` still manages its approved manuals. Existing invite-only authentication is retained.

## Runtime

Uses existing Supabase variables and `ANTHROPIC_API_KEY` on the server. `CONCIERGE_MODEL` optionally overrides the existing manuals model. No database migration is required for the concierge. No secrets belong in Git.

Requests are interpreted into a task brief, then answered directly or with Claude web search. Local/current recommendations require returned source citations. Search failure without citations returns an honest error instead of unverified recommendations. Search is limited to two uses per API round and two rounds; answer output is limited to 1,500 tokens per round with an 85-second overall abort signal and no automatic retries. The model prompt requests short answers; it is not a guarantee of factual correctness.

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

Pilot limitations: web search is not a complete local-business directory; no GPS, confirmed availability, booking, payment or provider vetting. Source links are evidence to inspect, not endorsements. Keep the first trial to a few invited testers before expanding.
