import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, throwError, forkJoin, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import {
  Agent, Workflow, Tool, KnowledgeBase, Guardrail,
  ArtifactSummary, ArtifactType
} from '../models/artifact.models';

@Injectable({ providedIn: 'root' })
export class AavaApiService {
  private http   = inject(HttpClient);
  private auth   = inject(AuthService);
  private base   = environment.aavaBaseUrl;

  private headers(ct = true): HttpHeaders {
    let h = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.token()}`,
      'x-realm-id': this.auth.realm(),
    });
    if (ct) h = h.set('Content-Type', 'application/json');
    return h;
  }

  private unwrap<T>(obs: Observable<{ data: T; status?: string }>): Observable<T> {
    return obs.pipe(
      map(r => r?.data ?? (r as unknown as T)),
      catchError(err => throwError(() =>
        new Error(err?.error?.message ?? err?.message ?? 'API Error')
      ))
    );
  }

  // ── Current User ────────────────────────────────────────────
  getCurrentUser(): Observable<{ id: number; email: string; name: string; role: string }> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/api/auth/user/details/v2`, { headers: this.headers() }
    ));
  }

  // ── Agents ──────────────────────────────────────────────────
  listAgents(page = 1, records = 20, search = '', status = ''): Observable<{ agentDetails: Agent[]; totalNoOfRecords: number }> {
    let params = new HttpParams()
      .set('page', page).set('records', records).set('isDeleted', 'false');
    if (search) params = params.set('search', search);
    if (status && status !== 'ALL') params = params.set('status', status);
    return this.unwrap(this.http.get<any>(`${this.base}/agents`, { headers: this.headers(), params }));
  }

  listUserAgents(page = 1, records = 20, search = ''): Observable<{ agentDetails: Agent[]; totalNoOfRecords: number }> {
    let params = new HttpParams().set('page', page).set('records', records).set('isDeleted', 'false');
    if (search) params = params.set('search', search);
    return this.unwrap(this.http.get<any>(`${this.base}/agents/user`, { headers: this.headers(), params }));
  }

  createAgent(payload: Partial<Agent>): Observable<{ id: number; agentId?: number }> {
    return this.unwrap(this.http.post<any>(`${this.base}/agents`, payload, { headers: this.headers() }));
  }

  updateAgent(payload: Partial<Agent>): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/agents`, payload, { headers: this.headers() }));
  }

  submitAgentForReview(agentId: number): Observable<unknown> {
    return this.unwrap(this.http.put<any>(
      `${this.base}/agents/IN_REVIEW?agent-id=${agentId}`, {},
      { headers: this.headers() }
    ));
  }

  approveAgent(agentId: number, comment = 'Approved via AES'): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/agents/approval`, {
      id: agentId, status: 'APPROVED',
      comments: { whatWentGood: comment, whatWentWrong: '', improvements: '' }
    }, { headers: this.headers() }));
  }

  getAgentVersionHistory(agentId: number): Observable<Agent[]> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/agents/version-history?agentId=${agentId}`, { headers: this.headers() }
    ));
  }

  // ── Workflows ───────────────────────────────────────────────
  listUserWorkflows(page = 1, records = 20, search = ''): Observable<{ workFlowDetails: Workflow[]; totalNoOfRecords: number }> {
    let params = new HttpParams().set('page', page).set('records', records).set('isDeleted', 'false');
    if (search) params = params.set('search', search);
    return this.unwrap(this.http.get<any>(`${this.base}/workflows/user`, { headers: this.headers(), params }));
  }

  createWorkflow(payload: Partial<Workflow> & { workflowConfig?: Record<string,unknown>; workflowAgents?: { serial: number; agentId: number }[] }): Observable<{ id: number }> {
    return this.unwrap(this.http.post<any>(`${this.base}/workflows`, {
      workflowConfig: {}, ...payload
    }, { headers: this.headers() }));
  }

  submitWorkflowForReview(workflowId: number): Observable<unknown> {
    return this.unwrap(this.http.put<any>(
      `${this.base}/workflows/IN_REVIEW?workflow-id=${workflowId}`, {},
      { headers: this.headers() }
    ));
  }

  approveWorkflow(workflowId: number, comment = 'Approved via AES'): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/workflows/approval`, {
      id: workflowId, status: 'APPROVED',
      comments: { whatWentGood: comment, whatWentWrong: '', improvements: '' }
    }, { headers: this.headers() }));
  }

  // ── Workflow Execution ───────────────────────────────────────
  triggerWorkflow(workflowId: number, userInputs: Record<string,unknown> = {}, file?: File): Observable<{ workflowExecutionId: string }> {
    const formData = new FormData();
    formData.append('pipelineId', String(workflowId));
    formData.append('userInputs', JSON.stringify(userInputs));
    formData.append('priority', '1');
    if (file) formData.append('files', file, file.name);
    const hdrs = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.token()}`,
      'x-realm-id': this.auth.realm(),
    });
    return this.unwrap(this.http.post<any>(
      `${this.base}/workflows/workflow-executions`, formData, { headers: hdrs }
    ));
  }

  getExecutionResult(executionId: string): Observable<unknown> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/workflow-executions/${executionId}/result`,
      { headers: this.headers() }
    ));
  }

  getExecutionLogs(executionId: string): Observable<unknown> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/workflow-executions/${executionId}/logs`,
      { headers: this.headers() }
    ));
  }

  cancelExecution(executionId: string): Observable<unknown> {
    return this.unwrap(this.http.post<any>(
      `${this.base}/admin/execution/cancel`,
      { executionId, workflowExecutionId: executionId },
      { headers: this.headers() }
    ));
  }

  getWorkflowDetails(workflowId: number): Observable<any> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/${workflowId}`, { headers: this.headers() }
    ));
  }

  getExecutionStatus(executionId: string): Observable<any> {
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/workflow-executions/${executionId}`, { headers: this.headers() }
    ));
  }

  listWorkflowExecutions(pipelineId?: number, page = 1, records = 50): Observable<any> {
    let params = new HttpParams().set('page', page).set('records', records);
    if (pipelineId) params = params.set('pipelineId', pipelineId);
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/workflow-executions`, { headers: this.headers(), params }
    ));
  }

  listWorkflowExecutionsForRealm(realmId: string, page = 1, records = 50): Observable<any> {
    const hdrs = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.token()}`,
      'x-realm-id': realmId,
      'Content-Type': 'application/json',
    });
    let params = new HttpParams().set('page', page).set('records', records);
    return this.unwrap(this.http.get<any>(
      `${this.base}/workflows/workflow-executions`, { headers: hdrs, params }
    ));
  }

  // ── Tools ────────────────────────────────────────────────────
  listUserTools(page = 1, records = 20, search = ''): Observable<{ userToolDetails: Tool[]; totalNoOfRecords: number }> {
    let params = new HttpParams().set('page', page).set('records', records).set('isDeleted', 'false');
    if (search) params = params.set('search', search);
    return this.unwrap(this.http.get<any>(`${this.base}/tools/userTools`, { headers: this.headers(), params }));
  }

  submitToolForReview(toolId: number): Observable<unknown> {
    return this.unwrap(this.http.put<any>(
      `${this.base}/tools/userTools/IN_REVIEW?tool-id=${toolId}`, {},
      { headers: this.headers() }
    ));
  }

  approveTool(toolId: number, comment = 'Approved via AES'): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/tools/userTools/approval`, {
      id: toolId, status: 'APPROVED',
      comments: { whatWentGood: comment, whatWentWrong: '', improvements: '' }
    }, { headers: this.headers() }));
  }

  // ── Knowledge Bases ──────────────────────────────────────────
  listKnowledgeBases(page = 0, size = 20, search = ''): Observable<{ data: KnowledgeBase[]; totalElements: number }> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    return this.http.get<any>(`${this.base}/embedding/knowledge/v2`, { headers: this.headers(), params }).pipe(
      map(r => r?.data ?? r),
      catchError(err => throwError(() => new Error(err?.message ?? 'API Error')))
    );
  }

  createKnowledgeBase(name: string, description: string, content: string, filename: string): Observable<{ id: number }> {
    const formData = new FormData();
    formData.append('knowledgeBase', name);
    formData.append('description', description);
    formData.append('model-ref', '494');
    formData.append('splitSize', '5000');
    formData.append('practiceArea', '6');
    formData.append('functionType', 'Flat Files');
    formData.append('methodology', 'Quick Search');
    formData.append('files', new Blob([content], { type: 'text/markdown' }), filename);
    const hdrs = new HttpHeaders({
      'Authorization': `Bearer ${this.auth.token()}`,
      'x-realm-id': this.auth.realm(),
    });
    return this.unwrap(this.http.post<any>(`${this.base}/embedding/knowledge/v2`, formData, { headers: hdrs }));
  }

  submitKbForReview(collectionId: number): Observable<unknown> {
    return this.unwrap(this.http.put<any>(
      `${this.base}/embedding/knowledge/v2/IN_REVIEW?collection_id=${collectionId}`, {},
      { headers: this.headers() }
    ));
  }

  approveKb(collectionId: number, comment = 'Approved via AES'): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/embedding/knowledge/v2/approval`, {
      masterId: collectionId, status: 'APPROVED', comment
    }, { headers: this.headers() }));
  }

  // ── Guardrails ───────────────────────────────────────────────
  listGuardrails(page = 1, records = 20, search = ''): Observable<{ guardrails: Guardrail[]; totalNoOfRecords: number }> {
    let params = new HttpParams().set('page', page).set('records', records).set('isDeleted', 'false');
    if (search) params = params.set('search', search);
    return this.unwrap(this.http.get<any>(`${this.base}/guardrails`, { headers: this.headers(), params }));
  }

  createGuardrail(payload: Partial<Guardrail> & { teamId?: number; practiceAreaId?: number }): Observable<{ id: number }> {
    return this.unwrap(this.http.post<any>(`${this.base}/guardrails`, payload, { headers: this.headers() }));
  }

  submitGuardrailForReview(guardrailId: number): Observable<unknown> {
    return this.unwrap(this.http.put<any>(
      `${this.base}/guardrails/IN_REVIEW?guardrail-id=${guardrailId}`, {},
      { headers: this.headers() }
    ));
  }

  approveGuardrail(guardrailId: number, comment = 'Approved via AES'): Observable<unknown> {
    return this.unwrap(this.http.put<any>(`${this.base}/guardrails/approval`, {
      id: guardrailId, status: 'APPROVED', comment
    }, { headers: this.headers() }));
  }

  // ── Models ────────────────────────────────────────────────────
  listModels(): Observable<{ models: { id: number; name: string; model: string; aiEngine: string; type: string }[] }> {
    return this.unwrap(this.http.get<any>(`${this.base}/models`, { headers: this.headers() }));
  }

  // ── Unified Search ────────────────────────────────────────────
  searchMyArtifacts(status: 'APPROVED' | 'CREATED' | 'ALL' = 'ALL', page = 1, size = 20, search = ''):
    Observable<{ results: ArtifactSummary[]; total?: number }> {
    if (status === 'ALL') {
      return forkJoin([
        this.searchMyArtifacts('APPROVED', page, size, search),
        this.searchMyArtifacts('CREATED', page, size, search),
      ]).pipe(map(([a, b]) => ({
        results: [...a.results, ...b.results],
        total: (a.total ?? 0) + (b.total ?? 0),
      })));
    }
    let params = new HttpParams().set('status', status).set('page', page).set('size', size);
    if (search) params = params.set('name', search);
    return this.unwrap(this.http.get<any>(
      `${this.base}/search/unified/search/my-artifacts`, { headers: this.headers(), params }
    ));
  }

  getPendingApprovals(pageSize = 50, pageNumber = 0): Observable<{ results: ArtifactSummary[] }> {
    const params = new HttpParams().set('pageSize', pageSize).set('pageNumber', pageNumber);
    return this.unwrap(this.http.get<any>(
      `${this.base}/search/unified/search/approval`, { headers: this.headers(), params }
    ));
  }

  // ── Admin Lists (Projects persistence) ───────────────────────
  getAdminLists(): Observable<unknown[]> {
    return this.unwrap(this.http.get<any>(`${this.base}/admin/lists`, { headers: this.headers() }));
  }

  addToAdminList(listId: string, artifact: { id: number; type: string; name: string }): Observable<unknown> {
    return this.unwrap(this.http.post<any>(
      `${this.base}/admin/lists/${listId}/artifact`, artifact, { headers: this.headers() }
    ));
  }

  removeFromAdminList(listId: string, type: string, id: number): Observable<unknown> {
    return this.unwrap(this.http.delete<any>(
      `${this.base}/admin/lists/${listId}/artifacts/${type}/${id}`, { headers: this.headers() }
    ));
  }

  // ── Revelio (AI Agent Matching) ───────────────────────────────
  revelioSearch(query: string, mode: 'help' | 'find' | 'ask' = 'find'): Observable<unknown> {
    return this.unwrap(this.http.post<any>(`${this.base}/revelio`, {
      mode, query, signature: {}
    }, { headers: this.headers() }));
  }

  // ── Agent Chat ────────────────────────────────────────────────
  agentChat(agentName: string, message: string): Observable<unknown> {
    return this.unwrap(this.http.post<any>(`${this.base}/agents/smart-chat/chat`, {
      agentName, message
    }, { headers: this.headers() }));
  }

  // ── Config ────────────────────────────────────────────────────
  getPracticeAreas(): Observable<{ practiceAreaList: { id: number; name: string }[] }> {
    return this.unwrap(this.http.get<any>(`${this.base}/api/auth/practice-areas`, { headers: this.headers() }));
  }

  getGoodAtTags(): Observable<unknown[]> {
    return this.http.get<any>(`${this.base}/api/auth/goodAt-tags`, { headers: this.headers() }).pipe(
      map(r => r?.data?.goodAtTagList ?? r?.data ?? []),
    );
  }
}
