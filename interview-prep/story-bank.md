# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

---

## From Report #001 — Mistral AI — Applied AI, Forward Deployed ML Engineer - EMEA

### [Enterprise AI Adoption] Pre-Sales AI Advisory to Regulated Enterprise Client
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** A large regulated enterprise client at Odigo was skeptical about implementing AI-powered conversation summarization due to GDPR and data residency concerns.
**T (Task):** Serve as technical advisor — architect a compliant solution, present to DPO and CISO, and secure sign-off within the sales cycle.
**A (Action):** Mapped data flows, proposed on-premise LLM inference to avoid data export, built a proof-of-concept demonstrating anonymization + summary quality, presented trade-off analysis to C-suite.
**R (Result):** Client approved; POC moved to production in 7 weeks. Deal closed, added to renewal base.
**Reflection:** Complex AI compliance questions require a technical advisor who can speak legal and engineering simultaneously — a rare and highly valued hybrid skill.
**Best for questions about:** Technical advisory, AI compliance, enterprise sales, stakeholder management, GDPR

---

### [Pilot to Production] Voice Callbot End-to-End Deployment
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** Enterprise client wanted to automate 30% of inbound call volume using an AI callbot but had no internal AI team.
**T (Task):** Lead the full lifecycle: define use case, select vendor, architect integration, oversee testing, deploy to production.
**A (Action):** Ran a 6-week POC with clear success metrics (containment rate, CSAT). Identified failure modes. Rebuilt intent taxonomy with client SMEs. Managed stakeholders through 2 go-live delays.
**R (Result):** Deployed to production. 28% call containment in month 3. Client cited as flagship AI success story internally.
**Reflection:** Production AI is 20% model, 80% integration, change management, and failure recovery. Set realistic expectations early.
**Best for questions about:** Pilot to production, project delivery, AI deployment, client management, handling setbacks

---

### [Communication] Explaining AI Trade-offs to Non-Technical C-Level
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** Odigo client's CFO questioned ROI of an agentic FAQ system after seeing mixed early results in UAT.
**T (Task):** Prevent project cancellation by reframing evaluation criteria honestly.
**A (Action):** Built a simple visual comparison — decision tree vs. LLM routing — showing where LLMs outperformed and where they didn't. Proposed a phased rollout that de-risked exposure.
**R (Result):** Project continued. Phase 1 metrics exceeded targets. CFO became an internal champion.
**Reflection:** Non-technical stakeholders need a decision framework, not a tech explanation. Show trade-offs, not capabilities.
**Best for questions about:** Communication, stakeholder management, difficult conversations, AI limitations

---

### [Building from Zero] Technical Practice at SQLI
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** Joined SQLI to launch a technology practice in banking/insurance with zero established clients.
**T (Task):** Build pipeline, hire team, open accounts — profitable within 18 months.
**A (Action):** Leveraged Microsoft MVP network for credibility. Ran free workshops at BNP Paribas and BPCE. Hired 3 senior profiles on outcome-based compensation. Built EBIT discipline from day one.
**R (Result):** EBIT 12.3%, utilization 86%, accounts at BNP Paribas, BPCE, Amundi, Orange Bank.
**Reflection:** Technical credibility opens doors that commercial pitches can't. In AI deployment, demos beat decks.
**Best for questions about:** Building from scratch, entrepreneurship, enterprise sales, leadership

---

### [Hands-On AI] Local-First Meeting Assistant (Ministral-8B)
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** Existing meeting AI tools had privacy concerns for enterprise use and real-time latency issues.
**T (Task):** Design and build a local-first meeting assistant with zero data leaving the device.
**A (Action):** Chose faster-whisper for VAD + transcription. Integrated Ministral-8B via llama.cpp (GGUF q4 quantization) for real-time summarization. Built FastAPI streaming backend.
**R (Result):** Functional prototype in testing. Active experimentation with latency/quality trade-offs on quantized Mistral model.
**Reflection:** Working at the inference layer gives a completely different perspective than calling an API — you understand the model's actual constraints and optimization levers.
**Best for questions about:** Hands-on AI projects, local AI, model inference, privacy-first architecture, self-directed learning

---

### [Client Retention] 100% Renewal Rate Under Churn Pressure
**Source:** Report #001 — Mistral AI — Applied AI Forward Deployed ML Engineer - EMEA
**S (Situation):** Strategic Odigo client (~€3M contract) evaluating competitors after a platform performance issue causing a customer-facing outage.
**T (Task):** Retain the account while being honest about what went wrong.
**A (Action):** Ran internal RCA, presented findings to client's IT director within 48 hours (including Odigo's responsibility), proposed remediation plan with SLA credits, established monthly technical review cadence.
**R (Result):** Client renewed and escalated to partnership status with expanded scope. 100% renewal rate maintained.
**Reflection:** Clients don't expect perfection. They expect honesty and responsiveness. The same applies in AI deployments — failed models need clear post-mortems, not spin.
**Best for questions about:** Difficult client situations, trust building, accountability, client retention
