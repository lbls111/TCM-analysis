
import { AnalysisResult, AISettings, ModelOption, BenCaoHerb, MedicalRecord, TreatmentPlanEntry, MedicalKnowledgeChunk } from "../types";
import { DEFAULT_RETRY_DELAY, MAX_RETRIES, VECTOR_API_URL, VECTOR_API_KEY, DEFAULT_EMBEDDING_MODEL } from "../constants";

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

// ==========================================
// 1. System Prompt Definitions
// ==========================================

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

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `你是一个即时分析助手。请根据用户输入的内容，输出结构化的 HTML 格式报告。
输出要求：
- 使用 HTML 标签进行排版（如 <h3>, <ul>, <li>, <strong>）。
- 不要使用 Markdown 代码块。
- 直接输出 HTML 内容。`;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `请进行安全审核。输出 HTML 格式。`;

// Updated: Ask for Markdown explicitly for chat
export const CHAT_SYSTEM_INSTRUCTION_BASE = `你是一个智能中医助手。请使用 Markdown 格式回答用户的问题，以获得最佳的显示效果。
- 重点使用加粗、列表、引用等 Markdown 语法来组织信息。
- 如果涉及代码或处方，请使用代码块。
- 回答要专业、严谨且富有同理心。`;

const getHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` });
const getBaseUrl = (url?: string) => {
    let base = url ? url.trim() : "https://api.openai.com/v1";
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.endsWith('/v1') && !base.includes('/v1/')) base += '/v1';
    return base;
};

// Robust JSON Extractor
const extractJsonFromText = (text: string): string => {
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

// === STRICT PAYLOAD CLEANING (Universal / OneAPI Standard) ===
const cleanPayloadForModel = (payload: any) => {
    const ALLOWED_KEYS = [
        'model', 
        'messages', 
        'stream', 
        'temperature', 
        'top_p', 
        'max_tokens',        
        'presence_penalty', 
        'frequency_penalty', 
        'stop', 
        'n', 
        'user',
        'tools',             
        'tool_choice',       
        'response_format',
        'seed'
    ];

    const clean: any = {};

    Object.keys(payload).forEach(key => {
        if (ALLOWED_KEYS.includes(key)) {
            if (key === 'tools') {
                if (Array.isArray(payload[key]) && payload[key].length > 0) {
                    clean[key] = payload[key];
                }
            } else if (key === 'tool_choice') {
                if (payload['tools'] && payload['tools'].length > 0) {
                    clean[key] = payload[key];
                }
            } else {
                clean[key] = payload[key];
            }
        }
    });

    return clean;
};

// === SANITIZATION & MERGING (Multimodal Support) ===
const sanitizeMessageHistory = (messages: any[]): OpenAIMessage[] => {
    if (!messages || messages.length === 0) return [];
    
    const cleaned = messages
        .filter(msg => msg.role !== 'tool' && msg.role !== 'function')
        .map(msg => {
            // Map 'model' to 'assistant' for API compatibility
            let role = msg.role;
            if (role === 'model') role = 'assistant';

            const cleanMsg: any = { role: role };
            let content = msg.content;

            if (content === null || content === undefined) content = "";
            if (typeof content === 'string' && !content.trim()) content = "";

            if (Array.isArray(content)) {
                const validParts = content.filter((c: any) => 
                    (c.type === 'text' && c.text && c.text.trim() !== '') ||
                    (c.type === 'image_url')
                );
                if (validParts.length > 0) content = validParts;
                else content = "";
            }

            cleanMsg.content = content;
            return cleanMsg as OpenAIMessage;
        })
        .filter(msg => {
            if (Array.isArray(msg.content)) return msg.content.length > 0;
            return typeof msg.content === 'string' && msg.content !== "";
        });

    // Merge Consecutive Messages
    const merged: OpenAIMessage[] = [];
    if (cleaned.length > 0) {
        let current = cleaned[0];
        for (let i = 1; i < cleaned.length; i++) {
            const next = cleaned[i];
            if (next.role === current.role) {
                const currentIsArray = Array.isArray(current.content);
                const nextIsArray = Array.isArray(next.content);
                let newContent: any[] = [];

                if (currentIsArray) newContent = [...(current.content as any[])];
                else newContent = [{ type: 'text', text: current.content as string }];

                if (nextIsArray) {
                    newContent = newContent.concat(next.content);
                } else {
                    const lastPart = newContent[newContent.length - 1];
                    if (lastPart.type === 'text' && !nextIsArray) {
                        lastPart.text += "\n\n" + (next.content as string);
                    } else {
                        newContent.push({ type: 'text', text: next.content as string });
                    }
                }
                current.content = newContent;
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
    }
    return merged;
};

// Timeout Helper
const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 60000) => {
    const controller = new AbortController();
    if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort());
    }
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
};

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, initialDelay = DEFAULT_RETRY_DELAY): Promise<Response> {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetchWithTimeout(url, options, 60000); 
      
      if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) {}
          
          console.warn(`API Error (${response.status}):`, errorText);

          const isSensitive = errorJson?.error?.code === 'sensitive_words_detected' || 
                              (typeof errorJson?.error?.message === 'string' && errorJson.error.message.includes('sensitive words'));

          if (isSensitive) {
               throw new Error("SENSITIVE_CONTENT_DETECTED");
          }
          
          if (response.status === 401 || response.status === 400 || response.status === 403 || response.status === 404) {
              throw new Error(`Request failed: API Error ${response.status}: ${errorText}`);
          }
          if (response.status === 429 || response.status >= 500) {
              if (i === retries - 1) throw new Error(`API Error ${response.status} (Max Retries): ${errorText}`);
              await new Promise(res => setTimeout(res, delay));
              delay *= 2;
              continue; 
          }
          throw new Error(`API Error ${response.status}: ${errorText}`);
      }
      return response;
    } catch (error: any) {
      if (error.name === 'AbortError') {
          if (options.signal?.aborted) throw error;
          console.warn(`Request timed out, retrying (${i+1}/${retries})...`);
      } else if (error.message === "SENSITIVE_CONTENT_DETECTED") {
          throw error;
      }
      if (i === retries - 1) throw new Error(error.message);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error(`Request failed after ${retries} retries.`);
}

export const createEmbedding = async (input: string | string[], settings: AISettings): Promise<number[] | number[][] | null> => {
    const apiKey = VECTOR_API_KEY;
    const baseUrl = VECTOR_API_URL;
    const model = DEFAULT_EMBEDDING_MODEL;
    if (Array.isArray(input) && input.length === 0) return [];
    if (typeof input === 'string' && !input.trim()) return null;
    const MAX_CHAR_LIMIT = 20000;
    const sanitizeInput = (str: string) => str.length > MAX_CHAR_LIMIT ? str.slice(0, MAX_CHAR_LIMIT) : str;
    let processedInput: string | string[];
    if (Array.isArray(input)) processedInput = input.map(s => sanitizeInput(s.replace(/\n/g, ' ')));
    else processedInput = sanitizeInput(input.replace(/\n/g, ' '));
    try {
        const url = `${getBaseUrl(baseUrl)}/embeddings`;
        const res = await fetchWithRetry(url, { method: 'POST', headers: getHeaders(apiKey), body: JSON.stringify({ model, input: processedInput }) });
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
            const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
            if (Array.isArray(input)) return sorted.map((d: any) => d.embedding) as number[][];
            else return sorted[0].embedding as number[];
        }
        return null;
    } catch (e: any) { throw e; }
};

export const localVectorSearch = async (query: string, chunks: MedicalKnowledgeChunk[], settings: AISettings, topK = 8): Promise<MedicalKnowledgeChunk[]> => {
    if (chunks.length === 0) return [];
    try {
        const queryVec = await createEmbedding(query, settings); 
        if (queryVec && !Array.isArray(queryVec[0])) { 
            const vec = queryVec as number[];
            const cosineSimilarity = (vecA: number[], vecB: number[]) => {
                let dot = 0, nA = 0, nB = 0;
                for (let i = 0; i < vecA.length; i++) { dot += vecA[i] * vecB[i]; nA += vecA[i]**2; nB += vecB[i]**2; }
                return dot / (Math.sqrt(nA) * Math.sqrt(nB));
            };
            const scored = chunks.map(chunk => {
                if (!chunk.embedding) return { chunk, score: -1 };
                return { chunk, score: cosineSimilarity(vec, chunk.embedding) };
            });
            return scored.filter(item => item.score > 0.3).sort((a, b) => b.score - a.score).slice(0, topK).map(item => item.chunk);
        }
    } catch (e) { console.warn("RAG search failed", e); }
    const keywords = query.split(/[\s,，。?!]+/).filter(k => k.length > 1);
    if (keywords.length === 0) return chunks.slice(-topK); 
    const scoredChunks = chunks.map(chunk => {
        let score = 0;
        keywords.forEach(k => { if (chunk.content.includes(k)) score += 1; });
        return { chunk, score };
    });
    return scoredChunks.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, topK).map(item => item.chunk);
};

export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try {
        const url = `${getBaseUrl(baseUrl)}/models`;
        const res = await fetchWithRetry(url, { headers: getHeaders(apiKey) });
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => ({ id: m.id, name: m.id }));
        return [];
    } catch (e) { console.error("Model fetch error:", e); throw e; }
};

export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try { await fetchAvailableModels(baseUrl, apiKey); return `连接成功！`; } catch (e: any) { throw new Error(e.message); }
};

export const generateHerbDataWithAI = async (herbName: string, settings: AISettings): Promise<BenCaoHerb | null> => {
    if (!settings.apiKey) throw new Error("API Key is missing");
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        let payload: any = {
            model: settings.model || "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "JSON output only. {name, nature, flavors:[], meridians:[], efficacy, usage, category, processing}." }, 
                { role: "user", content: `Data for: ${herbName}` }
            ],
            stream: false,
            temperature: 0
        };
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

export async function* analyzePrescriptionWithAI(
    analysis: AnalysisResult,
    prescriptionInput: string,
    settings: AISettings,
    regenerateInstructions?: string,
    existingReport?: string,
    signal?: AbortSignal,
    customSystemInstruction?: string,
    medicalRecord?: MedicalRecord
): AsyncGenerator<string, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    let contextStr = "无详细病历。";
    if (medicalRecord && medicalRecord.knowledgeChunks.length > 0) {
        const query = `${prescriptionInput} 症状 诊断`;
        const relevantChunks = await localVectorSearch(query, medicalRecord.knowledgeChunks, settings, 10);
        if (relevantChunks.length > 0) contextStr = relevantChunks.map(c => `- ${c.content}`).join("\n");
    }
    const context = `Input: ${prescriptionInput}\nInfo: \n${contextStr}`; 
    const sysPrompt = customSystemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;
    const messages: OpenAIMessage[] = [{ role: "system", content: sysPrompt }];
    if (existingReport) {
        messages.push({ role: "user", content: "Continue..." }); 
        messages.push({ role: "assistant", content: existingReport });
        messages.push({ role: "user", content: "Continue..." });
    } else {
        let finalContent = `分析:\n${context}`;
        if (regenerateInstructions) finalContent += `\n\n要求: ${regenerateInstructions}`;
        messages.push({ role: "user", content: finalContent });
    }
    let payload: any = {
        model: settings.model || settings.analysisModel || "gpt-3.5-turbo",
        messages: sanitizeMessageHistory(messages), 
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
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                if (line.trim().startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") return;
                    try {
                        const json = JSON.parse(dataStr);
                        const delta = json.choices[0].delta;
                        if (delta.content) yield delta.content;
                    } catch (e) {}
                }
            }
        }
    } finally { reader.releaseLock(); }
};

export async function* generateChatStream(
    history: any[], 
    analysis: AnalysisResult,
    prescription: string,
    reportContent: string | undefined,
    settings: AISettings,
    signal: AbortSignal | undefined,
    medicalRecord: MedicalRecord,
    systemInstruction: string 
): AsyncGenerator<{ text?: string }, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    let ragContext = "";
    const lastUserMsg = history.filter(m => m.role === 'user').pop();
    if (lastUserMsg && typeof lastUserMsg.text === 'string' && medicalRecord.knowledgeChunks.length > 0) {
        const chunks = await localVectorSearch(lastUserMsg.text, medicalRecord.knowledgeChunks, settings, 5);
        if (chunks.length > 0) {
            ragContext = `\n[Info]:\n${chunks.map(c => c.content).join('\n')}`;
        }
    }
    const systemMsg: OpenAIMessage = { role: "system", content: systemInstruction + ragContext };
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
                        if (delta.reasoning_content) {
                            if (!hasOutputThinking) { yield { text: "<div class='text-xs text-slate-400 mb-2 italic border-l-2 border-slate-300 pl-2'>AI 正在思考...\n" }; hasOutputThinking = true; }
                            yield { text: delta.reasoning_content };
                        }
                        if (delta.content) {
                            if (hasOutputThinking) { yield { text: "\n</div>\n\n" }; hasOutputThinking = false; }
                            yield { text: delta.content };
                        }
                    } catch (e) {}
                }
            }
        }
    } finally { reader.releaseLock(); }
}

// === NEW: STREAMING FULL RECORD EXTRACTION (BYPASS TIMEOUT) ===
export async function* extractMedicalRecordStream(
    fullText: string,
    settings: AISettings,
    signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
    if (!settings.apiKey) throw new Error("API Key missing");

    const instruction = `
    任务：你是一个高级医疗数据引擎。请读取用户提供的全部病历文本，提取所有关键医疗数据。
    
    输出要求：
    1. 必须输出且仅输出一个合法的 JSON 对象。
    2. JSON 必须包含以下三个数组字段：
       - "westernReports": [{ "date": "YYYY-MM-DD", "item": "项目名称", "result": "结果数值/描述" }] 
       - "tcmTreatments": [{ "date": "YYYY-MM-DD", "plan": "处方名称、治法或具体用药" }] 
       - "vitalSigns": [{ "date": "YYYY-MM-DD", "reading": "数值(如120/80)", "type": "BP/Glu/HR", "context": "备注(如空腹/饭后)" }]
    3. 如果文中没有日期，请根据上下文推断或使用当前日期。
    4. 忽略闲聊，只提取硬数据。不要输出 Markdown 代码块标记，只输出纯 JSON 字符串。
    `;

    // Cap input size just in case, though 30k is fine for modern models
    const safeText = fullText.length > 40000 ? fullText.slice(0, 40000) + "...(truncated)" : fullText;

    let payload: any = {
        model: settings.model || "gpt-3.5-turbo",
        messages: [
            { role: "system", content: instruction },
            { role: "user", content: `原始全量文本：\n${safeText}` }
        ],
        stream: true, // CRITICAL: Stream to keep connection alive
        temperature: 0,
        max_tokens: 8000 // Allow large output
    };
    
    payload = cleanPayloadForModel(payload);

    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    const res = await fetchWithRetry(url, { 
        method: "POST", 
        headers: getHeaders(settings.apiKey), 
        body: JSON.stringify(payload),
        signal: signal
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (line.trim().startsWith("data: ")) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === "[DONE]") return;
                    try {
                        const json = JSON.parse(dataStr);
                        const content = json.choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) {}
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

// Deprecated Non-Streaming Logic - Kept for compatibility but unused in new flow
export const reconstructMedicalRecordFromText = async (fullText: string, settings: AISettings, signal?: AbortSignal): Promise<string> => {
    // This is now just a wrapper if needed, but we prefer the stream above
    let result = "";
    for await (const chunk of extractMedicalRecordStream(fullText, settings, signal)) {
        result += chunk;
    }
    return extractJsonFromText(result);
};

export const generateStructuredMedicalUpdate = async (conversationHistoryOrRawText: string, existingRecord: MedicalRecord, settings: AISettings, userInstructions: string = ""): Promise<string> => {
    // Keep this for chat-based updates (smaller payload)
    if (!settings.apiKey) throw new Error("API Key missing");
    
    const instruction = `
    任务：作为医疗数据专员，请分析输入文本，提取【新增】或【更新】的医疗数据。
    输出必须是 JSON 对象，包含 "westernReports", "tcmTreatments", "vitalSigns" 数组。
    额外指令：${userInstructions}
    不要输出 JSON 以外的任何文本。
    `;

    let payload: any = {
        model: settings.model || "gpt-3.5-turbo",
        messages: [{ role: "system", content: instruction }, { role: "user", content: conversationHistoryOrRawText }],
        stream: false,
        temperature: 0,
        max_tokens: 4000
    };
    payload = cleanPayloadForModel(payload); 
    const res = await fetchWithRetry(`${getBaseUrl(settings.apiBaseUrl)}/chat/completions`, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
    const data = await res.json();
    return extractJsonFromText(data.choices?.[0]?.message?.content || "{}");
};

export const generateMedicalRecordSummary = async (conversationHistory: string, settings: AISettings, userInstructions: string = ""): Promise<string> => {
    return generateStructuredMedicalUpdate(conversationHistory, createEmptyMedicalRecord(), settings, userInstructions);
};

export const organizeMedicalRecordAgent = async (conversationHistory: string, existingRecord: MedicalRecord, settings: AISettings, userInstructions: string = ""): Promise<string> => {
    const json = await generateStructuredMedicalUpdate(conversationHistory, existingRecord, settings, userInstructions);
    return json;
};

export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => {
    if (!settings.apiKey) return "Error: API Key missing.";
    const textOnlyMessages = messages.map((m: any) => {
        if (Array.isArray(m.content)) return { role: m.role, content: m.content.map((c: any) => c.type === 'text' ? c.text : '[Image]').join('\n') };
        return m;
    });
    const cleanMessages = sanitizeMessageHistory(textOnlyMessages); 
    const contentToSummarize = cleanMessages.map(m => `${m.role}: ${m.content}`).join("\n");
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        let payload: any = {
            model: settings.model || "gpt-3.5-turbo",
            messages: [{ role: "system", content: "Summarize conversation." }, { role: "user", content: contentToSummarize }],
            temperature: 0.3
        };
        payload = cleanPayloadForModel(payload);
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e: any) { return `Summary failed: ${e.message}`; }
};
