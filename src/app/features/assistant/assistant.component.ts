import { Component, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { catchError, forkJoin, of, timer } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { MarkdownToHtmlPipe } from '../../shared/pipes/markdown-to-html.pipe';

const STORAGE_KEY = 'aes-chat-messages';
const MAX_STORED  = 50;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  loading?: boolean;
}

@Component({
  selector: 'app-assistant',
  standalone: true,
  imports: [
    FormsModule, CommonModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatProgressSpinnerModule, MatChipsModule, MatTooltipModule,
    MarkdownToHtmlPipe,
  ],
  templateUrl: './assistant.component.html',
  styleUrl: './assistant.component.scss',
})
export class AssistantComponent implements AfterViewChecked {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

  private api = inject(AavaApiService);

  messages = signal<Message[]>(this.loadMessages());
  input    = signal('');
  thinking = signal(false);

  suggestions = [
    'What workflows are best for code modernization?',
    'How do I execute a workflow in AES?',
    'What models are available in AAVA?',
    'How do guardrails work in AAVA?',
    'How do I build a compliance review pipeline?',
  ];

  private scrollPending = false;

  ngAfterViewChecked(): void {
    if (this.scrollPending) {
      this.scrollToBottom();
      this.scrollPending = false;
    }
  }

  private scrollToBottom(): void {
    this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Chat history persistence ──────────────────────────────────────────────

  private buildWelcome(): Message {
    return {
      role: 'assistant',
      content: `Hello! I'm the **AES Assistant** — your AI guide to the AAVA platform.\n\nI can help you:\n• **Find** the right agent or workflow for your use case\n• **Explain** what an artifact does and how to use it\n• **Recommend** pipeline patterns for your industry\n• **Troubleshoot** execution issues\n\nWhat would you like to know?`,
      timestamp: new Date(),
    };
  }

  private loadMessages(): Message[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [this.buildWelcome()];
      const parsed = JSON.parse(raw) as { role: string; content: string; timestamp: string }[];
      if (!Array.isArray(parsed) || parsed.length === 0) return [this.buildWelcome()];
      return parsed.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
    } catch {
      return [this.buildWelcome()];
    }
  }

  private saveMessages(msgs: Message[]): void {
    try {
      const toStore = msgs.filter(m => !m.loading).slice(-MAX_STORED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch { /* storage full or unavailable — fail silently */ }
  }

  clearHistory(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.messages.set([this.buildWelcome()]);
  }

  // ── Message send ──────────────────────────────────────────────────────────

  send(overrideText?: string): void {
    const text = (overrideText ?? this.input()).trim();
    if (!text || this.thinking()) return;

    this.messages.update(msgs => [...msgs, { role: 'user', content: text, timestamp: new Date() }]);
    this.input.set('');
    this.thinking.set(true);
    this.scrollPending = true;

    this.messages.update(msgs => [...msgs, { role: 'assistant', content: '', timestamp: new Date(), loading: true }]);
    this.scrollPending = true;

    // L1: /agents/smart-chat/chat  — returns 400 today (endpoint exists, payload under negotiation)
    // L2: /revelio                 — returns 405 today (nginx, endpoint not yet deployed)
    // L3: Local knowledge base     — always works
    // forkJoin with timer(400ms) ensures typing indicator is always visible >= 400ms
    const apiCall = this.api.agentChat('AAVA Assistant', text).pipe(
      catchError(() =>
        this.api.revelioSearch(text, 'find').pipe(catchError(() => of(null)))
      )
    );

    forkJoin([apiCall, timer(400)]).subscribe(([res]) => {
      const response = this.buildResponse(text, res);
      this.messages.update(msgs => {
        const updated = [...msgs];
        updated[updated.length - 1] = { role: 'assistant', content: response, timestamp: new Date() };
        return updated;
      });
      this.thinking.set(false);
      this.scrollPending = true;
      this.saveMessages(this.messages());
    });
  }

  // ── Response builder (local knowledge base) ───────────────────────────────

  private buildResponse(query: string, apiResult: any): string {
    const q = query.toLowerCase();

    // Use live API result when available
    if (apiResult?.data) {
      const data = apiResult.data;
      if (typeof data === 'string' && data.length > 10) return data;
      if (data.response) return data.response;
      if (data.message) return data.message;
      if (data.agents?.length) {
        const names = data.agents.slice(0, 3).map((a: any) => `• **${a.name}** (ID: ${a.id})`).join('\n');
        return `I found ${data.agents.length} relevant agents:\n\n${names}\n\nHead to **Artifact Search** to explore them in detail.`;
      }
    }

    // ── Local knowledge — ordered from most specific to most general ──────

    // Models — checked before 'financial' to prevent "model" keyword collision (Bug #13)
    if (q.includes('model') && !q.includes('financial')) {
      return `AAVA supports these AI models:\n\n• **Claude 4.5 Sonnet** (Bedrock, ID: 493) — best for code, architecture, complex reasoning\n• **Claude 4 Sonnet** (Bedrock, ID: 495) — solid alternative for code and analysis\n• **GPT-4o** (Azure, ID: 53) — best for structured financial output and text generation\n• **GPT-4.1** (Azure, ID: 52) — reasoning and coding tasks\n• **Gemini 2.5 Pro** (Google, ID: 490) — complex reasoning, cost-efficient\n\n**Rule of thumb:** Technical/code agents → Claude on Bedrock. Financial/quantitative agents → GPT-4o on Azure.`;
    }

    if (q.includes('moderniz') || q.includes('ruby') || q.includes('spring boot') || q.includes('migrat')) {
      return `For **code modernization**, the flagship AAVA pipeline is **Ruby to Spring Boot** (Workflow ID: 15613), a 6-agent sequential pipeline:\n\n1. **Ruby Dependency Analyzer** — maps all gems and identifies risks\n2. **Technical Document Creator** — generates architecture docs\n3. **User Stories Creator** — converts code to user stories\n4. **Low Level Design Creator** — designs Spring Boot architecture\n5. **API Code Generator** — writes all Java classes\n6. **JUnit Test Generator** — creates test suite with 80%+ coverage\n\n**Input:** Upload a \`ruby_inventory.zip\` file in Execute & Watch.\nUse **Pipeline Builder** to create your own variation for other tech stacks.`;
    }

    if (q.includes('compliance') || q.includes('regulat')) {
      return `For **compliance review**, build a pipeline with:\n\n1. **Requirements Analyzer** (Claude 4.5 Bedrock) — extracts regulatory requirements\n2. **Document Reviewer** (Claude 4.5 Bedrock) — checks documents against requirements\n3. **Gap Analyzer** (GPT-4o Azure) — identifies compliance gaps\n4. **Remediation Planner** (Claude 4.5 Bedrock) — recommends fixes\n5. **Executive Reporter** (GPT-4o Azure) — generates board-ready report\n\nAdd a **Compliance Guardrail** with HARD_ENFORCEMENT to ensure outputs meet regulatory language standards. Use the **Pipeline Builder** to scaffold this automatically.`;
    }

    if (q.includes('guardrail')) {
      return `**Guardrails** in AAVA constrain agent outputs using NeMo Guardrails with Colang syntax.\n\n**Enforcement types:**\n• **HARD_ENFORCEMENT** — blocks non-compliant output (regulated content)\n• **SOFT_GUIDANCE** — warns but passes through (brand voice)\n\n**When to use:**\n• Financial/legal content → Compliance guardrail (HARD)\n• Brand communications → Voice guardrail (SOFT)\n• Code generation → Safety guardrail (SOFT)\n\nCreate guardrails via **Pipeline Builder** (auto-generates based on industry) or manually in the AAVA Admin UI. Super Admins can self-approve guardrails.`;
    }

    if (q.includes('knowledge base') || q.includes('kb') || q.includes('rag')) {
      return `**Knowledge Bases (KBs)** give agents access to your documents via RAG (Retrieval-Augmented Generation).\n\n**How it works:**\n1. Upload docs (PDF, Markdown, text) → AAVA chunks & embeds using Titan Embed (model ID: 494)\n2. Attach a KB to an agent via \`kbIds: [collectionId]\`\n3. Agent retrieves relevant chunks before generating each response\n\n**Best practices:**\n• Keep KBs focused — one domain per KB\n• Use \`splitSize: 5000\` for most documents\n• Endpoint: \`POST /embedding/knowledge/v2\`\n\nUse **Pipeline Builder** to auto-create KBs matched to your use case.`;
    }

    if (q.includes('financial') || q.includes('roi')) {
      return `For **financial analysis pipelines**, use **GPT-4o (Azure, modelId: 53)** for quantitative agents — it outperforms Claude on structured financial modeling.\n\n**Recommended 4-agent pattern:**\n1. Data Collector (Claude 4.5 Bedrock) — gathers and normalizes data\n2. Financial Modeler (GPT-4o Azure) — runs DCF, IRR, NPV models\n3. Risk Analyzer (GPT-4o Azure) — stress tests scenarios\n4. Executive Reporter (GPT-4o Azure) — formats as board presentation\n\nSee the **Vista PostAcq pipeline** in Example Runs for a reference implementation.`;
    }

    if (q.includes('execute') || q.includes('run') || q.includes('trigger')) {
      return `To **execute a workflow**:\n\n1. Go to **Execute & Watch** in the sidebar\n2. Click **Load Workflows** to fetch available pipelines from AAVA\n3. Select your workflow from the dropdown\n4. Optionally add input text or upload a file (.zip, .pdf, .txt, .md)\n5. Click **Execute Workflow**\n\nYou'll see real-time progress as each agent runs. The pipeline unlocks agents one at a time. Results appear when all agents complete. You can cancel a running execution with the **Cancel** button.`;
    }

    if (q.includes('create') || q.includes('build') || q.includes('pipeline builder')) {
      return `To **create a multi-agent pipeline**:\n\n1. Go to **Pipeline Builder** in the sidebar\n2. Describe your use case in plain English\n   (e.g., *"Analyze Ruby codebase and generate Spring Boot code"*)\n3. Optionally specify your industry for domain-specific agents\n4. You can also specify agent count (e.g., *"5-agent pipeline"*)\n5. Click **Generate Pipeline Plan** — AES auto-designs the agents\n6. Review and edit agent names, roles, goals, and model selection\n7. Click **Build Pipeline** — agents are created in AAVA and auto-approved\n\nThe pipeline is immediately available in Execute & Watch once built.`;
    }

    if (q.includes('search') || q.includes('find artifact') || q.includes('artifact search')) {
      return `To **search artifacts** in AAVA:\n\n1. Go to **Artifact Search** in the sidebar\n2. Filter by **type**: All / Agent / Workflow / Tool / KB / Guardrail\n3. Filter by **status**: All / Approved / Created / In Review\n4. Type in the search bar to filter by name\n5. Click any artifact card to see details\n\nYou can ⭐ **favorite** any artifact — favorites persist in localStorage across sessions. Use the filter tabs at the top of the sidebar to switch to your Favorites view.`;
    }

    if (q.includes('realm')) {
      return `**Realms** are organizational boundaries in AAVA — similar to workspaces or tenants.\n\n**Your realms:**\n• **Realm 32** (platformengineeringallteam) — primary; all your artifacts live here\n• **Realm 59** (Executive)\n• **Realm 75** (asc-markets-all)\n• **Realm 1** (Ascendion root — used as bootstrap for the realm list API)\n\nSwitch realms via the dropdown in the AES header. Select **"All Realms"** to see data across all realms simultaneously. Add custom realms via the header realm picker.`;
    }

    if (q.includes('tool')) {
      return `**Tools** in AAVA are Python functions that agents can invoke during execution.\n\n**Key tool IDs for Realm 32:**\n• **ID 4521** — AzureBlobReaderTool — reads a specific file from Azure Blob by path\n• **ID 5964** — AzureBlobWriterTool — writes content to Azure Blob storage\n• **ID 686** — AzureBlobListFilesTool — lists files by extension in a folder\n\n⚠️ **Critical:** Always add tool 686 to agents that discover files at runtime. Without it, agents fail when they don't know exact filenames — this is the most common pipeline failure cause.`;
    }

    if (q.includes('approve') || q.includes('approval') || q.includes('review')) {
      return `**Artifact approval lifecycle:**\n\n\`CREATED → IN_REVIEW → APPROVED\`\n\nAs a **Super Admin**, you can self-approve. AES Pipeline Builder auto-approves when "Auto-approve" is checked.\n\n**API pattern:**\n1. \`PUT /agents/IN_REVIEW?agent-id={id}\` — submit for review\n2. \`PUT /agents/approval\` with \`{ "id": N, "status": "APPROVED" }\` — approve\n\n⚠️ Use **\`"id"\`** not \`"agentId"\` in the approval body — wrong field name causes 500 NPE errors on the backend.`;
    }

    if (q.includes('dashboard')) {
      return `The **Dashboard** gives you a quick snapshot of your AAVA workspace:\n\n• Stat cards for Agents, Workflows, Tools, Knowledge Bases, and Guardrails\n• Click any stat card to jump to that artifact type in **Artifact Search**\n• Quick-action buttons for **Pipeline Builder** and **Execute & Watch**\n• Counts are loaded from the artifact cache (preloaded at login)\n\nThe dashboard is the default landing page after login.`;
    }

    if (q.includes('history') || q.includes('example run') || q.includes('past run')) {
      return `**Execution History** (the Examples page) shows all your past workflow runs:\n\n• Filter by ALL / COMPLETED / FAILED\n• Expand any run card to see per-agent outputs and final result\n• Click **Re-run** (↩) to jump to Execute & Watch with the original input pre-filled\n• The **My Lists** tab shows curated artifact collections from the AAVA UI\n\nHistory is fetched from all your realms in parallel. Status \`"SUCCESS"\` from the API is normalized to \`"COMPLETED"\` in the filter tabs.`;
    }

    if (q.includes('project')) {
      return `**Projects** in AES let you group and organize your work locally.\n\n• Projects live in **localStorage** (not in AAVA) — they're client-side only\n• Group agents, workflows, and KBs under a project with notes\n• Persist across browser sessions in the same browser\n• Won't appear in the AAVA Console UI\n\nGo to the **Projects** page in the sidebar to create and manage them. Projects are ideal for tracking multi-artifact use cases like the Vista PostAcq pipeline or Ruby modernization work.`;
    }

    if (q.includes('what is aava') || q.includes('about aava') || q.includes('what does aava') || q.includes('explain aava')) {
      return `**AAVA** is a CrewAI-based agentic AI platform for enterprise automation.\n\n**Five artifact types:**\n• **Agents** — LLMs with roles, goals, instructions, and tools\n• **Workflows** — sequential pipelines where each agent's output feeds the next\n• **Tools** — Python functions agents can call (file I/O, web search, APIs)\n• **Knowledge Bases** — document collections for RAG retrieval\n• **Guardrails** — output constraints using NeMo/Colang\n\n**Realms** provide organizational boundaries (team/project scope).\n\nAES (this UI) wraps the AAVA API to make it easier to build, run, and monitor multi-agent pipelines without touching code.`;
    }

    if (q.includes('delete') || q.includes('remove')) {
      return `AES itself doesn't support deleting AAVA artifacts — deletion is done in the **AAVA Admin Console UI**.\n\nIf you need to remove an agent or workflow:\n1. Log in to the AAVA Console at \`int-ai.aava.ai\`\n2. Navigate to the artifact type\n3. Use the delete option on the artifact card\n\nNote: Agents created by other users require an admin or the original creator to delete.`;
    }

    // Detect project-specific named entities (all-caps abbreviations not related to AAVA terms)
    if (/\b[A-Z]{2,}\b/.test(query) && !q.includes('aava') && !q.includes('kb') && !q.includes('llm') && !q.includes('roi')) {
      return `I don't have project-specific information about that — I'm a general AAVA platform assistant, not connected to your live workspace data.\n\nFor project-specific queries, try:\n• **Artifact Search** — find agents or workflows by name\n• **Execution History** — see what's been run recently\n• The **AAVA Console UI** — for full artifact inspection\n\nWhat else can I help you with?`;
    }

    return `I can help with AAVA platform questions! Things I know well:\n\n• **Agents, Workflows, Tools, KBs, Guardrails** — ask me to explain any of these\n• **Code modernization** — Ruby → Spring Boot 6-agent pipeline\n• **Compliance pipelines** — 5-agent regulatory review patterns\n• **Model selection** — Claude vs GPT-4o vs Gemini for different tasks\n• **Execution** — how to run workflows and read results\n• **Pipeline Builder** — how to create pipelines from a description\n\nTry: *"How do I execute a workflow?"* or *"What models are available?"*`;
  }
}
