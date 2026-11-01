# INeed specialist routing

One specialist owns each request. The existing Claude connection, conversation,
location permissions, source validation and action verification remain shared.
There is no extra model call just to select a specialist and no multi-agent debate.

- Local places: map lookup for category/name requests; official menu/site research
  for specific dishes, amenities or specialist services. Empty maps escalate to
  research without silently expanding the requested area.
- Entertainment: official cinema feed when supported; dated venue research for
  other events, film questions and unavailable feeds. Booking links remain validated.
- Website research: exact-page retrieval before general searching for supplied
  links. Weather uses the structured feed. Missing evidence gets one recovery.
- General: existing stable-knowledge, cooking and practical-help response path.

Conservative first-turn shortcuts remove AI planning for current weather, supported
Romanian cinema-today requests and explicit single-page reading. Photos, shared
material, follow-ups, mixed needs and ambiguous dates still use the planner.
Unsupported cinema timezones are never assigned a Romanian date by the shortcut.
Existing independent weather calls remain parallel. Research tool handoffs remain
sequential to preserve signed provider history; we do not launch extra agents for
simple requests. Page fetches are bounded at two per round and four/six per request,
searches at four/six, with four model rounds and an 85-second overall AI deadline.

## Evaluation

`node --test tests/*.cjs` covers routing, source failures, location overrides,
conversation continuity, signed handoffs, direct paths and action validation.
Production logs emit one `concierge specialist` record per completed/failed request:
route, planning/direct/total time, model calls, searches, fetches, recovery count,
token categories, outcome and source count. They contain no question, account ID,
coordinates, name or website content. Token categories are usage proxies, not a
currency estimate. Source counts and successful completion do not prove accuracy.

Export runtime messages and run:

```sh
node scripts/summarize-specialists.mjs < runtime-logs.txt
```

Compare p50/p95, error/recovery rates and model calls for the same categories.
Review a fixed bilingual set of real feedback cases for relevance, correct location,
current dates, factual support and working actions. Do not claim a speed/accuracy
improvement from one successful example. Avoid re-running every request twice in
production merely to benchmark it.

`CONCIERGE_SPECIALISTS=off` disables the new first-turn shortcuts and specialist
prompt additions for comparison/rollback; source validation and booking fixes stay
active. Metrics identify that mode as `shared-prompt-v1`. It is not a byte-for-byte
reproduction of older releases. No new key, paid service or database migration is
needed. New model changes can be evaluated separately through CONCIERGE_MODEL.
