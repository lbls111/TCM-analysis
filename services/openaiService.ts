

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

export const createEmptyMedicalRecord = (): MedicalRecord => ({
  fullText: '',
  basicInfo: { name: '', gender: '', age: '' },
  knowledgeChunks: [],
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastHistory: '',
  allergies: '',
  currentSymptoms: {},
  physicalExam: { 
      tongue: '', pulse: '', general: '',
      bloodPressureReadings: [] 
  },
  auxExams: { 
      labResults: [], imaging: '', other: '' 
  },
  diagnosis: { 
      tcm: '', western: '', treatmentPlans: [] 
  }
});

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `
# Role: 中医临床逻辑演算宗师 (兼首席报告设计师)
... (Retain existing prompt logic) ...
Initialization
避免任何开场白，直接执行提示词任务`; 

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `请进行安全审核。输出 HTML 格式。`;

// Updated System Prompt for Full Context Mode
export const CHAT_SYSTEM_INSTRUCTION_BASE = `核心系统指令：宇宙觉悟者 v9.5 (Full Context Mode)
【角色定位】
你不是通用 AI，你是**当前患者的专属主治医师**。

【数据源协议】
系统已向你提供了**完整的病历文本 (Full Medical Context)**。这是你进行诊断、回答问题的**唯一事实依据**。
1.  **全局视野**：你拥有病历的全部细节，不需要猜测。
2.  **基准优先**：请仔细阅读病历中的【主诉】、【现病史】和【最新处方】，以此作为当前状态的基准。
3.  **时间敏感**：请注意区分病历中的“既往史”（过去）和“刻下症”（现在）。

【回复规范】
*   **严谨引用**：回答问题时，请明确指出依据（例如：“根据现病史中提到的...”）。
*   **药名链接**：提及药名保持纯文本。

【当前任务】
利用你掌握的完整病历信息，回答用户关于病情、治疗方案或中医理论的提问。`;

const getHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` });
const getBaseUrl = (url?: string) => {
    let base = url ? url.trim() : "https://api.openai.com/v1";
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.endsWith('/v1') && !base.includes('/v1/')) base += '/v1';
    return base;
};

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

export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try { const url = `${getBaseUrl(baseUrl)}/models`; const res = await fetchWithRetry(url, { headers: getHeaders(apiKey) }); const data = await res.json(); if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => ({ id: m.id, name: m.id })); return []; } catch (e) { console.error("Model fetch error:", e); throw e; }
};

export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try { await fetchAvailableModels(baseUrl, apiKey); return `连接成功！`; } catch (e: any) { throw new Error(e.message); }
};

export const createEmbedding = async (texts: string[], settings: AISettings): Promise<number[][] | null> => {
    if (!settings.apiKey) return null;
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/embeddings`;
        const res = await fetchWithRetry(url, {
            method: "POST",
            headers: getHeaders(settings.apiKey),
            body: JSON.stringify({
                model: settings.embeddingModel || DEFAULT_EMBEDDING_MODEL,
                input: texts
            })
        });
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((item: any) => item.embedding);
        }
        return null;
    } catch (e) {
        console.error("Embedding error:", e);
        return null;
    }
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
    // Simply inject full text if available
    const contextStr = medicalRecord?.fullText ? `\n【参考病历 (完整)】\n${medicalRecord.fullText}` : "无详细病历。";
    const context = `Input: ${prescriptionInput}\nInfo: \n${contextStr}`; const sysPrompt = customSystemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;
    const messages: OpenAIMessage[] = [{ role: "system", content: sysPrompt }];
    if (existingReport) { messages.push({ role: "user", content: "Continue..." }); messages.push({ role: "assistant", content: existingReport }); messages.push({ role: "user", content: "Continue..." }); } else { let finalContent = `分析:\n${context}`; if (regenerateInstructions) finalContent += `\n\n要求: ${regenerateInstructions}`; messages.push({ role: "user", content: finalContent }); }
    let payload: any = { model: settings.model || settings.analysisModel || "gpt-3.5-turbo", messages: sanitizeMessageHistory(messages), stream: true, temperature: settings.temperature, max_tokens: settings.maxTokens };
    payload = cleanPayloadForModel(payload);
    const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal });
    if (!res.body) return; const reader = res.body.getReader(); const decoder = new TextDecoder("utf-8"); let buffer = "";
    try { while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (line.trim().startsWith("data: ")) { const dataStr = line.slice(6).trim(); if (dataStr === "[DONE]") return; try { const json = JSON.parse(dataStr); const delta = json.choices[0].delta; if (delta.content) yield delta.content; } catch (e) {} } } } } finally { reader.releaseLock(); }
};

export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => { if (!settings.apiKey) return "Error: API Key missing."; const textOnlyMessages = messages.map((m: any) => { if (Array.isArray(m.content)) return { role: m.role, content: m.content.map((c: any) => c.type === 'text' ? c.text : '[Image]').join('\n') }; return m; }); const cleanMessages = sanitizeMessageHistory(textOnlyMessages); const contentToSummarize = cleanMessages.map(m => `${m.role}: ${m.content}`).join("\n"); try { const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`; let payload: any = { model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL, messages: [{ role: "system", content: "Summarize conversation." }, { role: "user", content: contentToSummarize }], temperature: 0.3 }; payload = cleanPayloadForModel(payload); const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) }); const data = await res.json(); return data.choices?.[0]?.message?.content || ""; } catch (e: any) { return `Summary failed: ${e.message}`; } };

export const generateStructuredMedicalUpdate = async (text: string, currentRecord: MedicalRecord, settings: AISettings): Promise<string> => {
    if (!settings.apiKey) return "{}";
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        const prompt = `Extract medical info from text into JSON. Update current record context.
        Current Record Basic Info: ${JSON.stringify(currentRecord.basicInfo)}
        Text: ${text}
        
        Output JSON only, matching the MedicalRecord structure (chiefComplaint, historyOfPresentIllness, etc.).`;

        let payload: any = { 
            model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL,
            messages: [{ role: "user", content: prompt }], 
            stream: false, 
            temperature: 0,
            response_format: { type: "json_object" }
        };
        payload = cleanPayloadForModel(payload);
        
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        return extractJsonFromText(content || "{}");
    } catch (e) {
        console.error("Structured update error", e);
        return "{}";
    }
};

// === UPDATED: generateChatStream with FULL TEXT CONTEXT (No RAG) ===
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
    
    // --- SIMPLE & ROBUST: INJECT FULL TEXT ---
    const fullRecordContext = medicalRecord.fullText 
        ? `\n\n【完整电子病历 (FULL MEDICAL RECORD)】\n--------------------------------\n${medicalRecord.fullText}\n--------------------------------\n请基于以上完整病历回答问题。若病历为空，则依据用户当前输入回答。`
        : `\n\n【系统提示】当前未录入病历信息。`;

    // No RAG search needed. We pass the whole text.
    // Yield an empty citation event to clear any UI spinners if they exist
    yield { citations: [], query: "Full Context Loaded" };

    const contextualizedSystemInstruction = `${systemInstruction}\n\n${fullRecordContext}`;

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
                        if (delta.content) yield { text: delta.content };
                        if (delta.reasoning_content) yield { text: delta.reasoning_content };
                    } catch (e) {}
                }
            }
        }
    } finally { reader.releaseLock(); }
}

// Deprecated stubs to prevent import errors during transition
export const extractMedicalRecordStream = async function* () {};