# Synthetic knowledge base

Everything in this folder is **invented for a demo**. "Timpanogos Heating &
Plumbing" is a fictional company. Prices, policies, phone numbers (555 range),
and email addresses (example.com) are made up and must not be relied on.

Each `*.md` file (except this README) is ingested by `npm run ingest`:

- the first `# Heading` is the document title,
- every `## Heading` starts a section, and sections become retrieval chunks,
- HTML comments (`<!-- ... -->`) are stripped before chunking, which is where
  each file keeps its synthetic-data notice.
