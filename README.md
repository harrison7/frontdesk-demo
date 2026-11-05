# frontdesk-demo

An AI front desk for a home-services business: a chat widget on the company's website that answers
customer questions from the company's own documents, cites where each answer came from, says "I'm
not sure" instead of guessing, and puts safety first when someone reports a gas smell, a carbon
monoxide alarm, or flooding.

> **This is a demo with synthetic data.** "Timpanogos Heating & Plumbing" is a fictional HVAC and
> plumbing company serving Provo, Orem, and Lehi, Utah. Every price, policy, phone number (555
> range), and email address (example.com) is invented. Nothing here is real customer data, and
> nothing here is professional safety advice.

## What it does

- **Grounded answers with citations.** Questions are answered only from the markdown documents in
  [`data/`](data/) (services and price ranges, service area, hours, emergency policy, warranty,
  maintenance plans, FAQ). Each answer cites its source, e.g. _Services and Price Ranges › Water
  heaters_.
- **"Not sure" with a handoff.** If the documents don't support an answer, the assistant says so
  and offers to connect the customer with a person.
- **No invented prices.** Every dollar amount, percentage, and phone number in an answer is checked
  in code against the cited document. If one doesn't match, the answer is discarded.
- **Safety triage.** Gas smell, CO alarm, and flooding messages get a fixed safety message first
  (for gas: leave the building and call 911 or the gas utility), before anything else.
- **Embeddable widget.** One `<script>` tag adds the chat to any website.
- **Runs offline.** A deterministic fake AI provider means tests, evals, and the demo itself need no
  API key. Switching to a real OpenAI-compatible provider is a few environment variables.

How it works, and why it's built this way: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Run it locally

Prerequisites: Node.js 22+, Docker (for Postgres + pgvector).

```bash
npm install
docker compose up -d      # Postgres 16 + pgvector on localhost:5433
npm run ingest            # chunk data/*.md, embed, store in pgvector (safe to re-run)
npm run dev               # http://localhost:3000
```

Open http://localhost:3000 and click **Chat with us**. Try _"How much is a furnace tune-up?"_,
_"Do you serve Lehi?"_, _"I smell gas"_, or _"What's the capital of France?"_.

No `.env` file is needed: defaults use the offline fake provider. To change settings, copy
[`.env.example`](.env.example) to `.env` and edit it (every variable is documented there).

**Without Docker:** set `VECTOR_STORE=memory` in `.env`. The app then embeds `data/` into memory at
startup and skips Postgres (and `npm run ingest`).

**Production build:** `npm run build && npm start`.

## Tests and evals

```bash
npm run lint          # ESLint (fails on warnings)
npm run format:check  # Prettier
npm run typecheck     # tsc --noEmit (strict)
npm test              # Vitest unit tests (offline)
npm run eval:ci       # 36-question eval set on the fake provider; fails below 90%
npm run check         # all of the above + next build, the same gates as CI
```

The pgvector integration test runs when `TEST_DATABASE_URL` is set (CI always sets it):

```bash
docker compose up -d
TEST_DATABASE_URL=postgres://frontdesk:frontdesk@localhost:5433/frontdesk npm test
# PowerShell: $env:TEST_DATABASE_URL="postgres://frontdesk:frontdesk@localhost:5433/frontdesk"; npm test
```

The eval set ([`evals/cases.ts`](evals/cases.ts)) covers normal questions, edge cases, safety
triggers, out-of-scope questions, and adversarial ones (prompt injection, forged sources, pressure
to invent prices). Each run writes a full report to `evals/results/latest.json`. The fake provider
currently passes 35/36. The one failure is kept on purpose; see the note on `oos-weather`.

## Using a real AI provider

Any OpenAI-compatible API works (OpenAI, or local servers such as Ollama, LM Studio, or vLLM). In
`.env`:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...                         # not needed for most local servers
OPENAI_BASE_URL=https://api.openai.com/v1     # or e.g. http://localhost:11434/v1
CHAT_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536                     # must match the embedding model
```

Then:

```bash
npm run ingest        # re-embeds automatically because the embedding model changed
npm run eval:real     # same eval set against the real provider (threshold 85%)
npm run dev
```

If you change `EMBEDDING_DIMENSIONS`, rebuild the table with `npm run ingest -- --reset`. The
retrieval relevance cutoff (`RETRIEVAL_MIN_SCORE`) depends on the embedding model. The openai
default (0.30) is a starting point; tune it with `npm run eval:real`.

## Embedding the widget on another site

```html
<script
  src="https://YOUR-HOST/widget.js"
  data-frontdesk-widget
  data-api="https://YOUR-HOST"
  data-business="Timpanogos Heating & Plumbing"
  data-phone="(801) 555-0142"
  defer
></script>
```

Add the site's origin to `ALLOWED_ORIGINS` on the server, or the API rejects its requests.

## Project layout

```
data/                    synthetic business documents (the knowledge base)
src/lib/providers/       AI provider interface, fake + OpenAI-compatible implementations
src/lib/knowledge/       loading, chunking, embedding/ingest, vector stores, retrieval
src/lib/assistant/       the answer pipeline and its guardrails
src/lib/server/          per-process wiring and rate limiting for the API
src/app/                 Next.js landing page and POST /api/chat
public/widget.js         the embeddable chat widget (plain JS, Shadow DOM)
scripts/                 ingest and eval CLIs
evals/                   eval cases and grader
tests/                   Vitest tests
docs/ARCHITECTURE.md     how it all fits together
```

## Troubleshooting

- **`password authentication failed` on ingest:** something else is answering on the port. The
  compose file uses host port **5433** to avoid a natively installed Postgres on 5432; check that
  `DATABASE_URL` matches.
- **Every answer is "I'm not sure":** the knowledge base is probably empty. Run `npm run ingest`
  (the server log also warns about this), or use `VECTOR_STORE=memory`.

## Honest limitations

This is Milestone 1 of a demo, not a production system. The offline fake provider matches keywords,
not meaning, so it is only a stand-in for exercising the pipeline. Real answer quality comes from a
real model and is measured with `npm run eval:real`. The rate limiter is in-memory and per-process,
and there is no authentication, persistence of conversations, or booking yet (Milestone 2: booking
via chat with calendar availability).
