# SynThesis: GPT-5.6 and Codex collaboration record

## Inspiration and purpose

SynThesis was inspired by a common student problem: choosing a thesis topic, finding related studies, and identifying a suitable mentor can be difficult when valuable research is stored in static or archived files. Although previous thesis and faculty research may already exist, it is often difficult to search, compare, and use when making research decisions.

SynThesis turns those archived records into a repository-grounded research assistant. The application combines a React/Vite frontend, a FastAPI backend, local embedding retrieval, cited Brain responses, a searchable Catalog, methodology and adviser reports, and an interactive research constellation. Its aim is to help students discover patterns, gaps, and possible thesis directions from the institution's available research records.

This document records how GPT-5.6, used through Codex, helped the team improve the project. It is a development record, not a claim that GPT-5.6 independently designed, approved, or deployed the application.

## What SynThesis does

Users can explore thesis and faculty-research records by topic. Rather than relying only on exact keyword matches, the system retrieves semantically related studies and uses the retrieved archive context to provide structured research guidance, including:

- what relevant repository studies have already explored;
- possible gaps or underrepresented angles in the retrieved records;
- applicable methods, tools, and datasets; and
- related thesis records, faculty or adviser recommendations, methodology reports, and a knowledge map of research domains and connections.

## GPT-5.6's role in the project

GPT-5.6 supported the team through Codex as an engineering and documentation assistant. It helped inspect existing code, trace data flows, translate confirmed requirements into focused changes, diagnose defects, review implementation details, and run or interpret verification checks. It did not determine the research corpus, make product decisions, control credentials, or release changes without human review.

- **Development work:** GPT-5.6, through Codex, assisted with analysis, implementation, debugging, verification, and documentation.
- **Active Brain workflow:** The current frontend uses `POST /api/brain`. Its model is configured through `SYNTHESIS_CHAT_MODEL`; the checked-in `.env.example` uses `gpt-5.6-sol`. That endpoint retrieves repository records, requests structured JSON, validates citations, and returns a deterministic fallback if the model call fails.

## Technical approach and safeguards

The backend loads a structured JSON corpus and builds searchable text from research fields such as title, abstract, domain, adviser, proponents, keywords, methodology, and datasets. It uses `text-embedding-3-small` to create vector representations for the records and user query, then compares them using local in-memory cosine similarity to retrieve relevant research.

The retrieved records become the model context for a repository-grounded response. The prompts instruct the model to make claims only from that context and to cite the matching source numbers. The backend also calculates repository confidence from deterministic signals, including citation validity and query fit, rather than treating the model's wording as evidence.

The system remains usable when external AI services or index data are unavailable. Keyword ranking provides a retrieval fallback when semantic search cannot run, and the response layer returns a contract-valid fallback that directs users to the retrieved records for manual review. This resilience, together with consistent data fields for advisers, proponents, methodologies, domains, and related records, helps the application produce useful and inspectable results under partial failure.

## Project improvements supported by Codex

### 1. Repository constellation interaction and stability

The team reported that highlighted constellation nodes could not consistently be hovered or opened. Codex traced the active `SynthesisPage` to `BrainConstellation` data flow, reproduced the interaction against the local application, and supported targeted improvements to the interaction layer:

- preserved the selected repository record when a connected study is clicked, including studies not cited in the current answer;
- enlarged the invisible pointer target for connected-study nodes;
- removed a recursive zoom-end recentering path that caused browser stack-overflow errors; and
- guarded the resize observer when the graph container is detached.

The resulting map shows a study preview on hover and opens the full repository-record panel on click.

### 2. Catalog browsing and record review

The team wanted users to browse the complete repository without first submitting a Brain query, while retaining a separate view for studies cited by the latest Brain response. Codex examined the existing frontend state and API conventions, then supported a frontend-focused implementation that:

- reuses `GET /api/catalog` for full-repository browsing, with debounced search and domain/year filters;
- retains **Brain-related** as the default view and limits it to source IDs cited in the latest Brain answer;
- paginates the catalog at five records per page and wraps fixed-width columns to avoid horizontal scrolling;
- opens a focused record-detail view with the complete abstract and available metadata; and
- aligns the Catalog detail hierarchy with the established Brain study-detail design.

The human team set the interaction expectations, including title-based detail navigation, visible tags, the back action, and the decision not to add a Tools column to the Catalog table.

### 3. Build, deployment, and documentation readiness

Codex helped convert the local two-service setup into documentation that reflects the active codebase rather than retired prototype assumptions. The work covered:

- the public API base URL and `VITE_API_BASE` build-time behavior;
- CORS origins, the `/api/health` deployment check, and the static frontend build;
- the corpus, embedding index, and manifest files required by the backend; and
- embedding-index maintenance after corpus or embedding-model changes.

The current documentation explains that normal operation uses local JSON records and a prebuilt embedding index; it does not require Qdrant, Docker, or a separate vector database.

## Human decisions and controls

The team retained ownership of all product and release decisions. Human contributors:

- defined the repository-grounded research-assistant goal and selected the research corpus;
- chose the Brain, Catalog, and Reports experience, including constellation and Catalog interactions;
- reported observed interface behavior and reviewed each proposed change;
- controlled API keys, `.env` files, Git actions, deployment settings, and external-service access;
- confirmed deployment health and the frontend-to-backend configuration; and
- approved the documentation scope, release readiness, and user-facing behavior.

These controls make the work human-reviewed engineering, rather than unattended model output.

## Validation performed

The implementation sessions used the following checks before handoff:

1. Reproduced reported issues against a local frontend and FastAPI backend.
2. Submitted real Brain queries and confirmed that repository sources, citations, and constellation connections were returned.
3. Verified constellation hover previews and connected-study detail selection.
4. Inspected the browser console and confirmed the recursive zoom stack-overflow path was removed.
5. Exercised both Catalog modes, filtering, pagination, and return-to-catalog behavior.
6. Ran `npm.cmd run build` after implementation groups to verify the production frontend bundle.
7. Checked the backend health endpoint and reviewed the public frontend URL, backend URL, CORS origin, and deployment environment variables.
8. Reviewed changed files to keep credentials, corpus data, and unrelated work outside the intended scope.

## Responsible-use boundaries

- The repository remains the source of truth. The application grounds synthesis in retrieved records and presents citations for inspection.
- Model-generated prose requires review against the visible repository sources; it does not replace academic validation.
- Confidence is repository-support metadata, not a statement that a generated claim is academically verified or complete.
- Credentials remain server-side. The static frontend receives only the public backend URL.
- Maintainers remain responsible for corpus quality, privacy, deployment security, availability, cost control, and final acceptance.

## Result

GPT-5.6 and Codex accelerated implementation, debugging, verification, and technical documentation for SynThesis. The delivered workflow remains repository-grounded, inspectable, and human-governed: the team supplied the research intent, made the product decisions, validated the behavior, and controlled the deployed system.
