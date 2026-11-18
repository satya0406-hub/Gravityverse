# Dedicated Google Search Grounding for GravityVerse Chat Assistant

A comprehensive architectural plan to guarantee real-time Google Search grounding across all chat queries using Gemini with native search tools, eliminating outdated knowledge through resilient model routing and presenting interactive source cards below every grounded answer.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your clarifications, the chat assistant is being re-architected with the following confirmed choices:
> - **Always-On Google Search Grounding**: Every user query is automatically searched and grounded in live Google Search results without requiring manual toggling or query classification barriers.
> - **Interactive Source Cards**: Citations and web references are displayed as interactive, expandable source cards below assistant messages with source favicon/domain badges, titles, and direct URLs.
> - **Outdated Knowledge Elimination**: The model chain is updated to prioritize models with active search tool support (`gemini-2.5-flash` and `gemini-3.8-flash`), strictly instructing the model to ground factual claims in live search results and preventing fallback to unverified static training data.

---

## 1. Overview & Core Concept

### What It Does
Transforms the GravityVerse chat assistant into an authoritative, real-time research engine powered exclusively by Google Gemini and live Google Search data. Every message sent by the user leverages native Google Search grounding (`tools: [{ googleSearch: {} }]`), fetching real-time web facts, verified current events, dynamic leadership/office holders, live scores, campus updates, and academic references.

### Target Audience & Persona
Students, researchers, developers, and professionals who rely on GravityVerse for up-to-the-minute facts, university events (e.g. SRMIST updates, hackathons, exams), live world events, technical documentation, and dynamic data without hallucinations or stale knowledge cutoffs.

### Key Value
- **Zero Stale Information**: Guarantees that answers about 2025/2026 events, current officials, real-time status, and fast-changing facts reflect live web results.
- **Transparent Citations**: Every grounded fact is backed by clickable source cards directly referencing original web sources.
- **Rock-Solid Reliability**: Automatic failover across verified Gemini models ensures chat responses never fail even if a specific model tier experiences temporary quota limits.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Query Submission**: The user enters a question into the chat composer. The interface immediately signals live research with a pulsing cyan search status indicator ("Searching live Google sources...").
2. **Real-Time Streaming**: Gemini streams verified, grounded answers chunk by chunk into the conversation viewport.
3. **Interactive Source Cards**: Upon response completion, an interactive source section appears beneath the response containing:
   - A header with total verified Google Search sources count and a "Live Grounded" badge.
   - Clean, elevated card tiles displaying the publication domain, article title, and external link icon.
   - Hover and tap micro-interactions that elevate the card and provide immediate access to the original reference.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Gravityverse                                                          │
│  [Gemini 2.5 Flash]  [● Live Google Search Grounded]                   │
│                                                                        │
│  As of October 2026, C. Joseph Vijay is the Chief Minister of Tamil    │
│  Nadu, having taken office following the recent assembly elections...  │
│                                                                        │
│  ────────────────────────────────────────────────────────────────────  │
│  🌐 Google Search Sources (3)  [Live Grounded]                        │
│  ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────┐ │
│  │ ↗ thehindu.com        │ │ ↗ indianexpress.com   │ │ ↗ ndtv.com    │ │
│  │ Chief Minister Oath.. │ │ Election Results 2026 │ │ Cabinet List..│ │
│  └───────────────────────┘ └───────────────────────┘ └───────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Visual Identity & Theme
- **Color Palette**: Deep cosmic slate background (`#070b14`), vibrant electric cyan accents (`text-cyan-400`, `bg-cyan-500/15`, `border-cyan-500/30`), crisp typography in high-contrast neutral slate (`text-gray-100`, `text-gray-300`).
- **Interactive Source Cards**: Elevated glassmorphic container (`bg-white/[0.03]`, `border-white/10`, hover: `border-cyan-400/40`, hover: `bg-cyan-500/10`), rounded 12px corners, and smooth transitions.
- **Search Feedback**: Dynamic search pulse animation while Google Search is retrieving live data.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Always-On Search Tool vs. Selective Heuristic Search
- **Chosen Approach**: Pass `tools: [{ googleSearch: {} }]` on every chat request by default, instructing the model to always incorporate live search grounding for factual inquiries.
- **Why**: Selective regex/keyword intent classifiers can misclassify unconventional, localized, or nuanced queries (e.g., regional college events, recent appointments, niche tech updates), leading to outdated parametric answers.
- **Trade-off**: Slightly higher per-query latency (~400ms) in exchange for 100% current, grounded accuracy.

### Decision 2: Model Hierarchy & Resilient Quota Protection
- **Chosen Approach**: Prioritize `gemini-2.5-flash` with seamless fallback to `gemini-3.8-flash` and `gemini-flash-latest`.
- **Why**: `gemini-2.5-flash` provides immediate, verified Google Search tool execution with generous quota availability, while maintaining the same modern `@google/genai` architecture.
- **Trade-off**: Ensures zero disruption from 429 quota exhaustion on specific tiers while keeping search grounding fully operational.

### Decision 3: Source Card Presentation
- **Chosen Approach**: Interactive, responsive card grid below the markdown response body, extracting domain names cleanly and providing full titles with tooltip previews.
- **Why**: Inline citation superscripts alone can be difficult to tap on mobile; dedicated interactive cards provide prominent, credible proof of live grounding.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BROWSER CLIENT                                │
│                                                                        │
│  ┌──────────────────────┐              ┌───────────────────────────┐  │
│  │ ChatPage / Composer  │ ───────────> │ EventSource / SSE Reader  │  │
│  │ [Always Search ON]   │              │ Parsing stream & sources  │  │
│  └──────────────────────┘              └─────────────┬─────────────┘  │
│                                                      │                │
│                                                      ▼                │
│                                        ┌───────────────────────────┐  │
│                                        │ Interactive Source Cards  │  │
│                                        │ Rendered below text body  │  │
│                                        └───────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ POST /api/ai/chat (SSE Stream)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           EXPRESS BACKEND                              │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ server.ts (/api/ai/chat router)                                 │  │
│  │ - Validates API key and stream headers                           │  │
│  │ - Passes webSearch=true and user prompt                         │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ AIRouter -> GeminiAdapter                                        │  │
│  │ - Tools: [{ googleSearch: {} }] configured                       │  │
│  │ - Model chain: gemini-2.5-flash -> gemini-3.8-flash -> latest    │  │
│  │ - Extracts groundingMetadata (groundingChunks, webSearchQueries) │  │
│  │ - Emits SSE: search_status -> chunk -> done (with sources)       │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │ GoogleGenAI SDK
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        GOOGLE GEMINI API                               │
│                                                                        │
│    ai.models.generateContentStream({                                   │
│      model: 'gemini-2.5-flash',                                        │
│      config: { tools: [{ googleSearch: {} }] }                         │
│    })                                                                  │
│    -> Returns grounded stream + groundingMetadata with live web URLs   │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Execution Steps
1. **Backend Adapter Optimization (`server/ai/adapters/geminiAdapter.ts`)**:
   - Set `gemini-2.5-flash` as primary resilient model in the chain to avoid 429 quota locks, with `gemini-3.8-flash` and `gemini-flash-latest` available.
   - Enforce always-on Google Search tool configuration (`config.tools = [{ googleSearch: {} }]`).
   - Extract and normalize all `groundingChunks` (URLs, article titles) directly into `groundingSources`.
2. **Stream Protocol Synchronization (`server.ts` & `src/pages/ChatPage.tsx`)**:
   - Ensure `groundingSources` are forwarded in both intermediate chunks and the final `done` SSE event.
   - Stream search status indicator events so the user experiences live feedback.
3. **Interactive Source Cards Component (`src/pages/ChatPage.tsx`)**:
   - Upgrade the sources layout into interactive card components with clean domain badges, article titles, and hover animations.
   - Ensure full accessibility and mobile responsiveness.
