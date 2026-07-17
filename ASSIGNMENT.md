# Technical Exercise: Compensation Data Normalizer

## Context

Pave's products are powered by compensation data. We pull compensation data from our customers' HR systems, normalize it into a standard schema, and that normalized data is what drives everything we do: benchmarking, market pricing, compensation planning, and total rewards.

We integrate with dozens of HR systems (Workday, BambooHR, Rippling, Gusto, and many more). Each system exports data in its own format, with its own field names, structures, and quirks. But even within the same system, companies structure their data very differently: custom fields, different naming conventions, different ways of representing the same compensation concepts.

We need a way to onboard new customers without writing custom logic for each one. Instead, the system should be driven by configuration: field mappings, value transformations, and structural rules that describe how a given company's data maps to Pave's standard schema. An integrations specialist (not an engineer) should be able to look at a company's raw data, define those mappings, and start normalizing without writing code or waiting for a deploy.

---

## The Problem

Build an **integration mapper**: a tool where a non-technical user can load a company's raw HR data, define how its fields map to Pave's standard schema, and preview the normalized output.

The mappings they create should be saved as a configuration that can be applied to that company's data going forward. Onboarding a new company means creating a new config, not writing new code.

---

## What We Provide

**Raw data files.** In `src/data/raw/` you'll find exports from three companies, each using a different HR system. Each file has ~20 employee records:

- `acme_corp.json`
- `globex_inc.json`
- `initech_llc.csv`

The data is synthetic but realistic. Spend some time reading through it before you start building.

---

## What You Build

Everything else. Specifically:

### A Standard Schema

Design the target schema your normalizer produces. What fields matter for a compensation data platform? What's required vs optional? How do you represent compensation when different sources structure it completely differently?

### A Configuration Format

Design the config that describes how to map a given company's raw data to your standard schema. This is the core design decision. The config needs to be expressive enough to handle the real differences between these sources, but simple enough that the mapper UI can produce it and a non-engineer can understand it.

### The Mapper UI

This is the primary interface. An integrations specialist using this tool should be able to look at a company's raw data, understand its structure, define how each field maps to the standard schema, and preview the normalized output, all without editing config by hand or writing custom code.

### The Normalization Engine

The backend that reads raw data, applies the config the UI produces, and outputs normalized records. Not every record will map cleanly. Part of the exercise is deciding what to do when they don't.

### Tests

Write tests that give you confidence the system works. What you test and how is up to you.

---

## What We're Evaluating

We're not looking for production polish. We're looking for:

**Product thinking.** The mapper tool is a product for a non-technical user. What does that user need to see? How do you help them understand the raw data, define mappings, and trust the result?

**Config design.** Is it expressive enough to handle the real differences between these sources? Is the mapper UI a natural interface for creating it? Is it the right level of abstraction?

**Schema design.** What you chose to standardize on, what you left flexible, and why.

**Edge case reasoning.** The data has real problems in it. We want to see how you handle them. Not that you catch every one, but that you notice them and make deliberate choices.

**Tradeoff awareness.** Two hours isn't enough to build everything well. Build the important things well, cut the less important things cleanly, and be explicit about what you cut and why.

---

## Time and Tools

**Budget about 2 hours.** Use AI tools (Claude Code, Cursor, etc.) however you want. We expect it. We've included a Claude API key in the `.env` file, feel free to use it for LLM needs.

Use **any language, framework, or stack.** Pick what makes you most productive.

**Persistence can be anything.** SQLite, flat files, in-memory. Just make a deliberate choice and be ready to explain it.

---

## What to Submit

1. Your code (zipped or as a repo link)
2. A `README.md` with setup and run instructions
3. A `DECISIONS.md` covering:
   - **Schema design** — What does your standard schema look like and why? What tradeoffs did you make?
   - **Config design** — What format did you choose? What can it express? What can't it?
   - **Integration Mapper** — What product decisions did you make? What does the user see? What did you leave out?
   - **Error handling** — How does your system handle bad data, missing fields, and records that don't map cleanly?
   - **AI usage** — Where did you use AI tools and where didn't you? What worked well and what required your own judgment?

---

## What Happens Next

You'll book a 45-minute session with one of our engineers. We'll:

- **Demo** — Walk through the mapper UI. Load a raw file, create a config, show the normalized output.
- **Discuss design** — Talk through your schema, config format, and how the UI and pipeline share the same config. We'll probe the edges of your design decisions.
- **Extend** -- Ask you to add a capability live.
- **Scale** — Discuss how this would evolve toward production: schema versioning, validation, observability, incremental syncs, handling hundreds of companies.
