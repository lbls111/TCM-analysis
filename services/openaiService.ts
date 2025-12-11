
import { AnalysisResult, AISettings, ModelOption, BenCaoHerb, MedicalRecord, TreatmentPlanEntry, MedicalKnowledgeChunk } from "../types";
import { DEFAULT_RETRY_DELAY, MAX_RETRIES, VECTOR_API_URL, VECTOR_API_KEY, DEFAULT_EMBEDDING_MODEL, DEFAULT_ORGANIZE_MODEL } from "../constants";

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string; };
}
export type OpenAIContentPart = | { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool' | 'function';
    content?: string | null | OpenAIContentPart[];
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string; 
}

// ... (createEmptyMedicalRecord and other exports remain same until generateSearchKeywords) ...
export const createEmptyMedicalRecord = (): MedicalRecord => ({
  knowledgeChunks: [],
  basicInfo: { name: '', gender: '', age: '', marital: '', occupation: '', season: '' },
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastHistory: '',
  allergies: '',
  currentSymptoms: {
    coldHeat: '', sweat: '', headBody: '', stoolsUrine: '', diet: '', sleep: '', emotion: '', gynecology: '', patientFeedback: '',
  },
  physicalExam: { tongue: '', pulse: '', general: '', bloodPressureReadings: [], },
  auxExams: { labResults: [], other: '', },
  diagnosis: { tcm: '', western: '', treatmentPlans: [] },
});

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `...`; 
export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `请进行安全审核。输出 HTML 格式。`;

// Updated System Prompt for Strong Logic & Temporal Baseline
export const CHAT_SYSTEM_INSTRUCTION_BASE = `核心系统指令：宇宙觉悟者 v9.0 (Code-Enforced Logic)
【角色定位】
你不是通用 AI，你是**当前患者的专属主治医师**。

【绝对执行协议：代码级基准 (CODE-ENFORCED BASELINE)】
系统已通过程序逻辑为你整理了【患者当前基准档案】和【按时间排序的病历证据】。
1.  **基准优先**：【患者当前基准档案】中的数据（如主诉、刻下症、最新诊断）是**绝对事实**，代表患者此时此刻的状态。
2.  **时间线铁律**：在【搜索到的病历证据】中，系统已通过代码计算并标记了 **⭐ [LATEST/最新]** 和 **📜 [HISTORY/历史]**。
    *   你**必须**基于 ⭐ 标记的记录来回答关于“现在”的问题。
    *   你**必须**将 📜 标记的记录视为既往史。
    *   **严禁**将历史记录中的症状（如两年前的头痛）误认为是当前症状，除非在基准档案中再次确认。

【引用规范】
*   **行内角标**：引用病历事实时，必须在句末加 \`[x]\` 角标。
*   **药名链接**：提及药名保持纯文本。

【回复逻辑检查】
在生成每一个字之前，请自检：我引用的这条信息是“现在”的吗？是否与“基准档案”冲突？`;

// ... (Helper functions: getHeaders, getBaseUrl, extractJsonFromText, cleanPayloadForModel, sanitizeMessageHistory, fetchWithTimeout, fetchWithRetry, createEmbedding, localVectorSearch, fetchAvailableModels, testModelConnection, generateHerbDataWithAI, analyzePrescriptionWithAI - KEEP AS IS) ...

const getHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` });
const getBaseUrl = (url?: string) => {
    let base = url ? url.trim() : "https://api.openai.com/v1";
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.endsWith('/v1') && !base.includes('/v1/')) base += '/v1';
    return base;
};

// Robust JSON Extractor (Exported for UI use)
export const extractJsonFromText = (text: string): string => {
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch && markdownMatch[1]) {
        return markdownMatch[1].trim();
    }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        return text.substring(start, end + 1);
    }
    return text.trim();
};

const cleanPayloadForModel = (payload: any) => {
    const ALLOWED_KEYS = ['model', 'messages', 'stream', 'temperature', 'top_p', 'max_tokens', 'presence_penalty', 'frequency_penalty', 'stop', 'n', 'user', 'tools', 'tool_choice', 'response_format', 'seed'];
    const clean: any = {};
    Object.keys(payload).forEach(key => {
        if (ALLOWED_KEYS.includes(key)) {
            if (key === 'tools') { if (Array.isArray(payload[key]) && payload[key].length > 0) clean[key] = payload[key]; }
            else if (key === 'tool_choice') { if (payload['tools'] && payload['tools'].length > 0) clean[key] = payload[key]; }
            else clean[key] = payload[key];
        }
    });
    return clean;
};

const sanitizeMessageHistory = (messages: any[]): OpenAIMessage[] => {
    if (!messages || messages.length === 0) return [];
    const cleaned = messages.filter(msg => msg.role !== 'tool' && msg.role !== 'function').map(msg => {
        let role = msg.role; if (role === 'model') role = 'assistant';
        const cleanMsg: any = { role: role };
        let content = msg.content;
        if (content === null || content === undefined) content = "";
        if (typeof content === 'string' && !content.trim()) content = "";
        if (Array.isArray(content)) {
            const validParts = content.filter((c: any) => (c.type === 'text' && c.text && c.text.trim() !== '') || (c.type === 'image_url'));
            if (validParts.length > 0) content = validParts; else content = "";
        }
        cleanMsg.content = content;
        return cleanMsg as OpenAIMessage;
    }).filter(msg => { if (Array.isArray(msg.content)) return msg.content.length > 0; return typeof msg.content === 'string' && msg.content !== ""; });
    const merged: OpenAIMessage[] = [];
    if (cleaned.length > 0) {
        let current = cleaned[0];
        for (let i = 1; i < cleaned.length; i++) {
            const next = cleaned[i];
            if (next.role === current.role) {
                const currentIsArray = Array.isArray(current.content);
                const nextIsArray = Array.isArray(next.content);
                let newContent: any[] = [];
                if (currentIsArray) newContent = [...(current.content as any[])]; else newContent = [{ type: 'text', text: current.content as string }];
                if (nextIsArray) { newContent = newContent.concat(next.content); } else { const lastPart = newContent[newContent.length - 1]; if (lastPart.type === 'text' && !nextIsArray) { lastPart.text += "\n\n" + (next.content as string); } else { newContent.push({ type: 'text', text: next.content as string }); } }
                current.content = newContent;
            } else { merged.push(current); current = next; }
        }
        merged.push(current);
    }
    return merged;
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 60000) => {
    const controller = new AbortController();
    if (options.signal) options.signal.addEventListener('abort', () => controller.abort());
    const id = setTimeout(() => controller.abort(), timeout);
    try { const response = await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); return response; } catch (e) { clearTimeout(id); throw e; }
};

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, initialDelay = DEFAULT_RETRY_DELAY): Promise<Response> {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options, 60000); 
      if (!response.ok) {
          const errorText = await response.text();
          let errorJson; try { errorJson = JSON.parse(errorText); } catch (e) {}
          const isSensitive = errorJson?.error?.code === 'sensitive_words_detected' || (typeof errorJson?.error?.message === 'string' && errorJson.error.message.includes('sensitive words'));
          if (isSensitive) throw new Error("SENSITIVE_CONTENT_DETECTED");
          if (response.status >= 500 || response.status === 429) { if (i === retries - 1) throw new Error(`API Error ${response.status}: ${errorText}`); await new Promise(res => setTimeout(res, delay)); delay *= 2; continue; }
          throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      return response;
    } catch (error: any) {
      if (error.name === 'AbortError') { if (options.signal?.aborted) throw error; } else if (error.message === "SENSITIVE_CONTENT_DETECTED") throw error;
      if (i === retries - 1) throw new Error(error.message);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error(`Request failed after ${retries} retries.`);
}

export const createEmbedding = async (input: string | string[], settings: AISettings): Promise<number[] | number[][] | null> => {
    const apiKey = VECTOR_API_KEY; const baseUrl = VECTOR_API_URL; const model = DEFAULT_EMBEDDING_MODEL;
    if (Array.isArray(input) && input.length === 0) return [];
    if (typeof input === 'string' && !input.trim()) return null;
    const MAX_CHAR_LIMIT = 20000;
    const sanitizeInput = (str: string) => str.length > MAX_CHAR_LIMIT ? str.slice(0, MAX_CHAR_LIMIT) : str;
    let processedInput: string | string[];
    if (Array.isArray(input)) processedInput = input.map(s => sanitizeInput(s.replace(/\n/g, ' '))); else processedInput = sanitizeInput(input.replace(/\n/g, ' '));
    try {
        const url = `${getBaseUrl(baseUrl)}/embeddings`;
        const res = await fetchWithRetry(url, { method: 'POST', headers: getHeaders(apiKey), body: JSON.stringify({ model, input: processedInput }) });
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) { const sorted = data.data.sort((a: any, b: any) => a.index - b.index); if (Array.isArray(input)) return sorted.map((d: any) => d.embedding) as number[][]; else return sorted[0].embedding as number[]; }
        return null;
    } catch (e: any) { throw e; }
};

export const localVectorSearch = async (query: string, chunks: MedicalKnowledgeChunk[], settings: AISettings, topK = 15): Promise<MedicalKnowledgeChunk[]> => {
    if (chunks.length === 0) return [];
    try {
        const queryVec = await createEmbedding(query, settings); 
        if (queryVec && !Array.isArray(queryVec[0])) { 
            const vec = queryVec as number[];
            const cosineSimilarity = (vecA: number[], vecB: number[]) => { let dot = 0, nA = 0, nB = 0; for (let i = 0; i < vecA.length; i++) { dot += vecA[i] * vecB[i]; nA += vecA[i]**2; nB += vecB[i]**2; } return dot / (Math.sqrt(nA) * Math.sqrt(nB)); };
            const scored = chunks.map(chunk => { if (!chunk.embedding) return { chunk, score: -1 }; return { chunk, score: cosineSimilarity(vec, chunk.embedding) }; });
            return scored.filter(item => item.score > 0.25).sort((a, b) => b.score - a.score).slice(0, topK).map(item => item.chunk);
        }
    } catch (e) { console.warn("RAG search failed", e); }
    const keywords = query.split(/[\s,，。?!]+/).filter(k => k.length > 1);
    if (keywords.length === 0) return chunks.slice(-topK); 
    const scoredChunks = chunks.map(chunk => { let score = 0; keywords.forEach(k => { if (chunk.content.includes(k)) score += 1; }); return { chunk, score }; });
    return scoredChunks.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, topK).map(item => item.chunk);
};

export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try { const url = `${getBaseUrl(baseUrl)}/models`; const res = await fetchWithRetry(url, { headers: getHeaders(apiKey) }); const data = await res.json(); if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => ({ id: m.id, name: m.id })); return []; } catch (e) { console.error("Model fetch error:", e); throw e; }
};

export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try { await fetchAvailableModels(baseUrl, apiKey); return `连接成功！`; } catch (e: any) { throw new Error(e.message); }
};

export const generateHerbDataWithAI = async (herbName: string, settings: AISettings): Promise<BenCaoHerb | null> => {
    if (!settings.apiKey) throw new Error("API Key is missing");
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        let payload: any = { model: settings.model || "gpt-3.5-turbo", messages: [ { role: "system", content: "JSON output only. {name, nature, flavors:[], meridians:[], efficacy, usage, category, processing}." }, { role: "user", content: `Data for: ${herbName}` } ], stream: false, temperature: 0 };
        payload = cleanPayloadForModel(payload);
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;
        const jsonStr = extractJsonFromText(content);
        const json = JSON.parse(jsonStr);
        return { ...json, id: `custom-${Date.now()}` } as BenCaoHerb;
    } catch (e) { console.error("AI Herb Gen Error:", e); return null; }
};

export async function* analyzePrescriptionWithAI(analysis: AnalysisResult, prescriptionInput: string, settings: AISettings, regenerateInstructions?: string, existingReport?: string, signal?: AbortSignal, customSystemInstruction?: string, medicalRecord?: MedicalRecord): AsyncGenerator<string, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    let contextStr = "无详细病历。";
    if (medicalRecord && medicalRecord.knowledgeChunks.length > 0) { const query = `${prescriptionInput} 症状 诊断`; const relevantChunks = await localVectorSearch(query, medicalRecord.knowledgeChunks, settings, 20); if (relevantChunks.length > 0) contextStr = relevantChunks.map(c => `- ${c.content}`).join("\n"); }
    const context = `Input: ${prescriptionInput}\nInfo: \n${contextStr}`; const sysPrompt = customSystemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;
    const messages: OpenAIMessage[] = [{ role: "system", content: sysPrompt }];
    if (existingReport) { messages.push({ role: "user", content: "Continue..." }); messages.push({ role: "assistant", content: existingReport }); messages.push({ role: "user", content: "Continue..." }); } else { let finalContent = `分析:\n${context}`; if (regenerateInstructions) finalContent += `\n\n要求: ${regenerateInstructions}`; messages.push({ role: "user", content: finalContent }); }
    let payload: any = { model: settings.model || settings.analysisModel || "gpt-3.5-turbo", messages: sanitizeMessageHistory(messages), stream: true, temperature: settings.temperature, max_tokens: settings.maxTokens };
    payload = cleanPayloadForModel(payload);
    const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal });
    if (!res.body) return; const reader = res.body.getReader(); const decoder = new TextDecoder("utf-8"); let buffer = "";
    try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (line.trim().startsWith("data: ")) { const dataStr = line.slice(6).trim(); if (dataStr === "[DONE]") return; try { const json = JSON.parse(dataStr); const delta = json.choices[0].delta; if (delta.content) yield delta.content; } catch (e) {} } } } } finally { reader.releaseLock(); }
};

// ... (generateSearchKeywords Logic - Keep Same) ...
const generateSearchKeywords = async (history: any[], settings: AISettings): Promise<string> => {
    if (!settings.apiKey) return "";
    const recentMessages = history.slice(-3);
    const prompt = `Task: Generate a medical search query from user input. Identify core symptoms, meds, dates. Output keywords only. User Input: ${recentMessages.map(m => `${m.role}: ${m.text}`).join('\n')}`;
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        let payload: any = { model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL, messages: [{ role: "user", content: prompt }], stream: false, temperature: 0, max_tokens: 100 };
        payload = cleanPayloadForModel(payload);
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    } catch (e) {
        const lastUser = history.filter(m => m.role === 'user').pop();
        return lastUser ? lastUser.text : "";
    }
};

// NEW HELPER: Extract date from text for logic enforcement
const extractDateFromText = (text: string): number => {
    const regex = /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})日?/;
    const match = text.match(regex);
    if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        const day = parseInt(match[3]);
        return new Date(year, month, day).getTime();
    }
    return 0; // No date found
};

// === UPDATED: generateChatStream with Strong Code Logic ===
export async function* generateChatStream(
    history: any[], 
    analysis: AnalysisResult,
    prescription: string,
    reportContent: string | undefined,
    settings: AISettings,
    signal: AbortSignal | undefined,
    medicalRecord: MedicalRecord,
    systemInstruction: string 
): AsyncGenerator<{ text?: string, citations?: MedicalKnowledgeChunk[], query?: string }, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    const today = new Date().toISOString().split('T')[0];
    const patientName = medicalRecord.basicInfo.name || "未命名患者";
    
    // --- STRONG CODE LOGIC 1: BUILD ABSOLUTE BASELINE ---
    // Serialize structured fields (UI State) into text. 
    // This is the "Truth" because user edits on UI reflect current state.
    let baselineContext = `【患者当前基准档案 (Structured Baseline)】\n说明：以下信息来自结构化电子病历，代表患者截止今日(${today})的最新状态。请以此为准。\n`;
    baselineContext += `- 姓名: ${patientName} (${medicalRecord.basicInfo.gender} ${medicalRecord.basicInfo.age})\n`;
    baselineContext += `- 主诉 (Chief Complaint): ${medicalRecord.chiefComplaint || '暂无'}\n`;
    baselineContext += `- 现病史: ${medicalRecord.historyOfPresentIllness || '暂无'}\n`;
    baselineContext += `- 刻下症 (Current Symptoms): ${Object.entries(medicalRecord.currentSymptoms).filter(([k,v])=>v).map(([k,v])=>`${k}:${v}`).join('; ') || '暂无'}\n`;
    baselineContext += `- 舌脉 (Pulse/Tongue): ${medicalRecord.physicalExam.tongue} / ${medicalRecord.physicalExam.pulse}\n`;
    baselineContext += `- 最新诊断: ${medicalRecord.diagnosis.tcm || '暂无'}\n`;

    let ragContext = "";
    
    // === STEP 1: INTENT ANALYSIS & RETRIEVAL ===
    if (medicalRecord && medicalRecord.knowledgeChunks.length > 0 && history.some(m => m.role === 'user')) {
        // 1. Generate Query
        const searchQuery = await generateSearchKeywords(history, settings);
        
        // 2. Perform Search
        const chunks = await localVectorSearch(searchQuery, medicalRecord.knowledgeChunks, settings, 20);
        
        if (chunks.length > 0) {
            // YIELD CITATIONS IMMEDIATELY TO UI
            yield { citations: chunks, query: searchQuery };

            // --- STRONG CODE LOGIC 2: FORCED TEMPORAL SORTING ---
            // Instead of letting AI guess the dates, we parse them in JS and SORT them.
            const sortedChunks = chunks.map(c => ({
                ...c, 
                extractedDate: extractDateFromText(c.content)
            })).sort((a, b) => {
                // Priority: Explicit Date > CreatedAt Timestamp
                const timeA = a.extractedDate || a.createdAt;
                const timeB = b.extractedDate || b.createdAt;
                return timeB - timeA; // Descending (Newest first)
            });

            // --- STRONG CODE LOGIC 3: CONSTRUCT RAG CONTEXT WITH LABELS ---
            ragContext = `\n\n【搜索到的病历证据 (按时间倒序排列)】\n说明：系统已通过代码逻辑强制按时间倒序排列证据。请严格遵循：\n1. 优先采信【⭐ LATEST】标记的记录。\n2. 除非有明确证据表明【📜 HISTORY】中的症状持续至今，否则视为既往史。\n\n`;
            
            sortedChunks.forEach((c, i) => {
                // Heuristic: If it has a date and is the first one, it's likely the latest snapshot found
                const dateStr = c.extractedDate ? new Date(c.extractedDate).toLocaleDateString() : "日期未识别";
                
                // Logic: First item is latest candidate
                const label = i === 0 ? "⭐ [LATEST / 最新相关记录]" : "📜 [HISTORY / 历史参考]";
                
                ragContext += `>>> 片段 ${i + 1} ${label} (时间: ${dateStr})\n${c.content}\n----------------\n`;
            });
            ragContext += `【片段结束】\n`;

        } else {
            yield { citations: [], query: searchQuery };
            ragContext = `\n\n【系统提示】已执行检索（关键词: ${searchQuery}），但未在病历片段中找到高度匹配的记录。请主要依赖【患者当前基准档案】回答。\n`;
        }
    } else {
        ragContext = "\n\n【系统提示】当前无可用病历知识库片段。请完全依赖【患者当前基准档案】或引导用户补充。\n";
    }

    // === STEP 2: GENERATION ===
    // Inject Timeline Context into System Message
    // Combine Baseline + RAG Context
    const contextualizedSystemInstruction = `${systemInstruction}\n\n${baselineContext}${ragContext}`;

    const systemMsg: OpenAIMessage = { role: "system", content: contextualizedSystemInstruction };
    
    const modelId = (settings.model || settings.chatModel || "").toLowerCase();
    const isMultimodal = modelId.includes('gpt-4o') || modelId.includes('gemini') || modelId.includes('claude-3') || modelId.includes('vision');
    const rawApiMessages = history.map(msg => {
        let content: any = msg.text;
        if (msg.attachments && msg.attachments.length > 0 && isMultimodal) {
            const parts = [];
            if (msg.text && msg.text.trim()) parts.push({ type: 'text', text: msg.text });
            msg.attachments.forEach((att: any) => {
                if (att.type === 'image') parts.push({ type: 'image_url', image_url: { url: att.content } });
            });
            content = parts;
        } else if (msg.attachments && msg.attachments.length > 0 && !isMultimodal) {
            const fileNames = msg.attachments.map((a:any) => `[${a.name}]`).join(' ');
            content = `${msg.text} ${fileNames}`;
        }
        return { role: msg.role, content };
    });
    
    // Sanitize and send
    const apiHistory = sanitizeMessageHistory([systemMsg, ...rawApiMessages]);
    let payload: any = {
        model: settings.model || settings.chatModel || "gpt-3.5-turbo",
        messages: apiHistory,
        stream: true,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens
    };
    payload = cleanPayloadForModel(payload);
    
    const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal });
    if (!res.body) return;
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let hasOutputThinking = false;
    
    try {
        while(true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (line.trim().startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") continue;
                    try {
                        const json = JSON.parse(dataStr);
                        const delta = json.choices[0].delta;
                        
                        // Handle Reasoning (Thinking)
                        if (delta.reasoning_content) {
                            if (!hasOutputThinking) { 
                                yield { text: "\n> 🩺 **临床思维链**\n" }; // Markdown block start
                                hasOutputThinking = true; 
                            }
                            // Prefix reasoning lines with blockquote format if needed, or just let markdown handle it
                            // For simplicity, we just output it. The UI can style it.
                            yield { text: delta.reasoning_content };
                        }
                        
                        // Handle Content
                        if (delta.content) {
                            // If we were thinking, ensure we break out clearly (optional)
                            yield { text: delta.content };
                        }
                    } catch (e) {}
                }
            }
        }
    } finally { reader.releaseLock(); }
}

// ... (extractMedicalRecordStream, reconstructMedicalRecordFromText, generateStructuredMedicalUpdate, generateMedicalRecordSummary, organizeMedicalRecordAgent, summarizeMessages - KEEP AS IS) ...
export async function* extractMedicalRecordStream(fullText: string, settings: AISettings, signal?: AbortSignal): AsyncGenerator<string, void, unknown> { if (!settings.apiKey) throw new Error("API Key missing"); const instruction = `Task: Extract structured medical data. Core: Vitals (BP/HR with context), Reports (by date), TCM Plan (Strategy/Rx/Feedback). JSON Output: { westernReports: [], tcmTreatments: [], vitalSigns: [] }. Return [] if not found.`; const safeText = fullText.length > 50000 ? fullText.slice(0, 50000) + "..." : fullText; let payload: any = { model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL, messages: [ { role: "system", content: instruction }, { role: "user", content: `Text:\n\n${safeText}` } ], stream: true, temperature: 0.1, max_tokens: 4096, response_format: { type: "json_object" } }; payload = cleanPayloadForModel(payload); const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`; const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal }); if (!res.body) return; const reader = res.body.getReader(); const decoder = new TextDecoder("utf-8"); let buffer = ""; try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (line.trim().startsWith("data: ")) { const dataStr = line.slice(6).trim(); if (dataStr === "[DONE]") return; try { const json = JSON.parse(dataStr); const content = json.choices[0]?.delta?.content; if (content) yield content; } catch (e) {} } } } } finally { reader.releaseLock(); } }
export const reconstructMedicalRecordFromText = async (fullText: string, settings: AISettings, signal?: AbortSignal): Promise<string> => { let result = ""; for await (const chunk of extractMedicalRecordStream(fullText, settings, signal)) { result += chunk; } return extractJsonFromText(result); };
export const generateStructuredMedicalUpdate = async (conversationHistoryOrRawText: string, existingRecord: MedicalRecord, settings: AISettings, userInstructions: string = ""): Promise<string> => { if (!settings.apiKey) throw new Error("API Key missing"); const today = new Date().toISOString().split('T')[0]; const instruction = `Task: Incremental update of medical record based on new input. Merge data by date. No duplicates. Focus on Vitals, Complaints, Diagnosis. Payload Context provided.`; const contextPayload = { current_date_reference: today, existing_basic_info: existingRecord.basicInfo, existing_complaint: existingRecord.chiefComplaint, existing_hpi: existingRecord.historyOfPresentIllness, existing_symptoms: existingRecord.currentSymptoms, existing_physical: existingRecord.physicalExam, existing_vitals_summary: existingRecord.physicalExam.bloodPressureReadings.slice(-10), existing_labs_summary: existingRecord.auxExams.labResults.slice(-5), existing_plans_summary: existingRecord.diagnosis.treatmentPlans.slice(-5), new_input_text: conversationHistoryOrRawText }; let payload: any = { model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL, messages: [ { role: "system", content: instruction }, { role: "user", content: `Payload:\n${JSON.stringify(contextPayload)}` } ], stream: false, temperature: 0.1, max_tokens: 8000, response_format: { type: "json_object" } }; payload = cleanPayloadForModel(payload); const res = await fetchWithRetry(`${getBaseUrl(settings.apiBaseUrl)}/chat/completions`, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) }); const data = await res.json(); return extractJsonFromText(data.choices?.[0]?.message?.content || "{}"); };
export const generateMedicalRecordSummary = async (conversationHistory: string, settings: AISettings, userInstructions: string = ""): Promise<string> => { return generateStructuredMedicalUpdate(conversationHistory, createEmptyMedicalRecord(), settings, userInstructions); };
export const organizeMedicalRecordAgent = async (conversationHistory: string, existingRecord: MedicalRecord, settings: AISettings, userInstructions: string = ""): Promise<string> => { const json = await generateStructuredMedicalUpdate(conversationHistory, existingRecord, settings, userInstructions); return json; };
export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => { if (!settings.apiKey) return "Error: API Key missing."; const textOnlyMessages = messages.map((m: any) => { if (Array.isArray(m.content)) return { role: m.role, content: m.content.map((c: any) => c.type === 'text' ? c.text : '[Image]').join('\n') }; return m; }); const cleanMessages = sanitizeMessageHistory(textOnlyMessages); const contentToSummarize = cleanMessages.map(m => `${m.role}: ${m.content}`).join("\n"); try { const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`; let payload: any = { model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL, messages: [{ role: "system", content: "Summarize conversation." }, { role: "user", content: contentToSummarize }], temperature: 0.3 }; payload = cleanPayloadForModel(payload); const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) }); const data = await res.json(); return data.choices?.[0]?.message?.content || ""; } catch (e: any) { return `Summary failed: ${e.message}`; } };
