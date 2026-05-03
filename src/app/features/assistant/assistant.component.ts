import { Component, inject, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { CommonModule } from '@angular/common';
import { catchError, of } from 'rxjs';
import { AavaApiService } from '../../core/services/aava-api.service';
import { MarkdownToHtmlPipe } from '../../shared/pipes/markdown-to-html.pipe';

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
    MatIconModule, MatProgressSpinnerModule, MatChipsModule,
    MarkdownToHtmlPipe,
  ],
  templateUrl: './assistant.component.html',
  styleUrl: './assistant.component.scss',
})
export class AssistantComponent implements AfterViewChecked {
  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

  private api    = inject(AavaApiService);

  messages  = signal<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm the **AES Assistant** — your AI guide to the AAVA platform.\n\nI can help you:\n• **Find** the right agent or workflow for your use case\n• **Explain** what an artifact does and how to use it\n• **Recommend** pipeline patterns for your industry\n• **Troubleshoot** execution issues\n\nWhat would you like to know?`,
      timestamp: new Date(),
    },
  ]);

  input     = signal('');
  thinking  = signal(false);

  suggestions = [
    'What workflows are best for code modernization?',
    'How do I build a compliance review pipeline?',
    'Find agents that can analyze financial data',
    'What is a Knowledge Base and when should I use one?',
    'How do guardrails work in AAVA?',
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

  send(overrideText?: string): void {
    const text = (overrideText ?? this.input()).trim();
    if (!text || this.thinking()) return;

    this.messages.update(msgs => [...msgs, {
      role: 'user', content: text, timestamp: new Date(),
    }]);

    this.input.set('');
    this.thinking.set(true);
    this.scrollPending = true;

    const thinkingMsg: Message = { role: 'assistant', content: '', timestamp: new Date(), loading: true };
    this.messages.update(msgs => [...msgs, thinkingMsg]);
    this.scrollPending = true;

    this.api.revelioSearch(text, 'find').pipe(
      catchError(() => of(null))
    ).subscribe(res => {
      const response = this.buildResponse(text, res);
      this.messages.update(msgs => {
        const updated = [...msgs];
        updated[updated.length - 1] = { role: 'assistant', content: response, timestamp: new Date() };
        return updated;
      });
      this.thinking.set(false);
      this.scrollPending = true;
    });
  }

  private buildResponse(query: string, apiResult: any): string {
    const q = query.toLowerCase();

    // Try to use Revelio result
    if (apiResult?.data) {
      const data = apiResult.data;
      if (typeof data === 'string') return data;
      if (data.response) return data.response;
      if (data.agents?.length) {
        const names = data.agents.slice(0, 3).map((a: any) => `• **${a.name}** (ID: ${a.id})`).join('\n');
        return `I found ${data.agents.length} relevant agents:\n\n${names}\n\nHead to **Artifact Search** to explore them in detail.`;
      }
    }

    // Local knowledge fallback
    if (q.includes('moderniz') || q.includes('ruby') || q.includes('spring boot') || q.includes('migrat')) {
      return `For **code modernization**, the best AAVA pipeline is the **Ruby to Spring Boot** 6-agent workflow (ID: 15613):\n\n1. **Ruby Dependency Analyzer** — maps all gems and identifies risks\n2. **Technical Document Creator** — generates architecture docs\n3. **User Stories Creator** — converts code to user stories\n4. **Low Level Design Creator** — designs Spring Boot architecture\n5. **API Code Generator** — writes all Java classes\n6. **JUnit Test Generator** — creates test suite with 80%+ coverage\n\nUse the **Pipeline Builder** to create your own variation for different tech stacks.`;
    }

    if (q.includes('compliance') || q.includes('regulat')) {
      return `For **compliance review**, build a pipeline with:\n\n1. **Requirements Analyzer** (Claude 4.5 Bedrock) — extracts regulatory requirements\n2. **Document Reviewer** (Claude 4.5 Bedrock) — checks documents against requirements\n3. **Gap Analyzer** (GPT-4o Azure) — identifies compliance gaps\n4. **Remediation Planner** (Claude 4.5 Bedrock) — recommends fixes\n5. **Executive Reporter** (GPT-4o Azure) — generates board-ready report\n\nAdd a **Compliance Guardrail** with HARD_ENFORCEMENT to ensure all outputs meet regulatory language standards. Use the **Pipeline Builder** to scaffold this automatically.`;
    }

    if (q.includes('guardrail')) {
      return `**Guardrails** in AAVA are constraints applied to agent outputs. They use NeMo Guardrails with Colang syntax.\n\n**Types:**\n• **HARD_ENFORCEMENT** — blocks non-compliant output (use for regulated content)\n• **SOFT_GUIDANCE** — warns but passes through (use for brand voice)\n\n**When to use:**\n• Financial/legal content → Compliance guardrail (HARD)\n• Brand communications → Voice guardrail (SOFT)\n• Code generation → Safety guardrail (SOFT)\n\nCreate guardrails via the **Pipeline Builder** or manually via the AAVA Admin UI.`;
    }

    if (q.includes('knowledge base') || q.includes('kb') || q.includes('rag')) {
      return `**Knowledge Bases (KBs)** give your agents access to your documents via RAG (Retrieval-Augmented Generation).\n\n**How it works:**\n1. Upload docs (PDF, Markdown, text) → AAVA chunks & embeds with Titan Embed\n2. Attach a KB to an agent via \`kbIds: [collectionId]\`\n3. Agent automatically retrieves relevant chunks before generating responses\n\n**Best practices:**\n• Keep KBs focused (one domain per KB)\n• Use \`splitSize: 5000\` for most documents\n• Add AzureBlobListFilesTool to any agent discovering files at runtime\n\nUse the **Pipeline Builder** to auto-create KBs for your use case.`;
    }

    if (q.includes('financial') || q.includes('roi') || q.includes('model')) {
      return `For **financial analysis pipelines**, use **GPT-4o (Azure, modelId: 53)** for quantitative agents — it outperforms Claude on structured financial modeling.\n\n**Recommended pattern:**\n1. Data Collector (Claude 4.5 Bedrock) — gathers and normalizes data\n2. Financial Modeler (GPT-4o Azure) — runs DCF, IRR, NPV models\n3. Risk Analyzer (GPT-4o Azure) — stress tests scenarios\n4. Executive Reporter (GPT-4o Azure) — formats as board presentation\n\nSee the **Vista PostAcq pipeline** in Example Runs for a reference implementation with $127M NPV modeling.`;
    }

    return `Great question! Here's what I know about "${query}":\n\nBased on AAVA's capabilities, I'd recommend exploring:\n\n• **Artifact Search** — find existing agents/workflows that match your needs\n• **Pipeline Builder** — describe your problem and auto-generate a custom pipeline\n• **Example Runs** — see similar pipelines that have already been executed\n\nFor more specific guidance, try asking about a particular industry, technology, or task type.`;
  }
}
