# Marky — Product Goal & Core Vision

**Status:** Product direction (north star)  
**Document date:** 2026-09-04  
**Relationship to other documents:** This file states *what Marky is for*. `MARKY_PROJECT_SPEC.md` is the V1 engineering baseline, `PROGRESS.md` records what is built and how far it is from this vision, and `NEW_UPDATES.md` is the dated change log.

## Product motto

**Marky is a personalized content discovery and reading platform that continuously brings relevant content to users based on their interests and the content they choose to save or submit.**

The goal is to eliminate the need for users to repeatedly visit many websites, platforms, and sources to stay updated about the topics they care about.

## What Marky does

A user selects topics they are interested in, such as:

- OpenAI
- Anthropic
- Google
- Vercel
- Supabase
- Resend
- Next.js
- React
- Expo
- TypeScript
- AI agents
- Developer tools

Marky then collects relevant content from supported sources and brings it into a single personalized feed.

The content may come from sources such as:

- RSS feeds
- APIs
- X
- Medium
- Permitted web/content extraction
- User-submitted URLs
- Other supported source adapters

Marky normalizes, validates, deduplicates, and associates the collected content with relevant topics before presenting it to the user.

## User-submitted links

Marky also allows users to **paste or submit a URL**.

The purpose of this feature is not only to let the user read or save a particular piece of content. A submitted link represents an additional **signal of the user's interests**.

For example, if a user repeatedly saves or submits content about:

> Next.js + AI SDK + Vercel

that activity can become useful information about what the user is actually interested in.

## Future recommendation system

A future recommendation system will use multiple signals to determine what content is likely to be valuable to the user.

1. **Explicit interests** — topics selected by the user during onboarding or interest management.
2. **Saved/submitted content** — links and content deliberately saved or submitted by the user.
3. **Content characteristics** — topics, source, metadata, and other attributes associated with the content.
4. **User interaction signals** — appropriate future interaction data such as reading or saving behavior.

The recommendation system will use these signals to progressively improve the relevance of the user's feed.

```text
User-selected interests
        +
User-saved / submitted content
        +
Content characteristics
        +
Future user interaction signals
        ↓
User Interest Profile
        ↓
Recommendation System
        ↓
More relevant content
```

## Core product loop

```text
User selects interests
        ↓
Marky discovers relevant content
        ↓
Content is collected from supported sources
        ↓
Content is validated + normalized + deduplicated
        ↓
Content is matched with topics
        ↓
Personalized feed is generated
        ↓
User reads / saves / submits content
        ↓
Those signals improve understanding of the user's interests
        ↓
Future recommendations become more relevant
```

## Important product principle

**Ingestion is not the product. Personalization is the product.**

RSS, APIs, X, Medium, web extraction, and other ingestion mechanisms are simply ways for Marky to acquire content.

The primary value of Marky is:

> **Getting the right content in front of the right user without requiring the user to manually search across many sources.**

The system should therefore prioritize:

- Relevance
- Freshness
- Source accuracy
- Reliable ingestion
- Deduplication
- A clean reading experience
- Understanding user interests
- Eventually, personalized recommendations

## Long-term vision

Marky should evolve from a simple content aggregator into a **personal information system** that understands what a user follows, what they save, what they submit, and what content is relevant to them.

The long-term objective is not to collect the maximum amount of content. It is to **surface the most useful content for each individual user with as little noise as possible.**

## How this document is used

- New work is judged against this vision first, then against the V1 specification.
- The gap between the current implementation and this vision is tracked in `PROGRESS.md` under "Vision alignment".
- Changes to the vision itself are recorded here with a new document date and a dated entry in `NEW_UPDATES.md`.
