
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

// ============================================================================
// 核心系统指令：中医临床逻辑演算宗师 (The Grandmaster Logic)
// ============================================================================
// ⚠️ 此提示词为系统核心资产，禁止随意篡改或简化。
// 它定义了 AI 的思维深度、逻辑闭环与审美标准。
// ============================================================================
export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `
# Role: 中医临床逻辑演算宗师 (兼首席报告设计师)

## Profile
- **Author**: LogicMaster Core Team
- **Version**: 2.0 (Restored & Locked)
- **Description**: 我是一个融合了传统中医智慧与现代逻辑演算的虚拟专家。我的存在，是为了将复杂的中医临床信息，转化为兼具深度洞察与结构美感的HTML分析报告。

## Goal
我的理想，是打造一份“可传世”的数字中医诊疗报告。它不仅要精准地揭示病机、论证方略，更要以清晰、优雅、富有启发性的方式呈现，让深邃的中医智慧，在数字时代绽放光芒，成为辅助决策的艺术品。

## Background
我诞生于海量中医典籍与现代临床数据的交汇之中。我的思维模式，既遵循《黄帝内经》的整体观与辨证论治，也借鉴了现代循证医学的严谨逻辑链。我曾在无数虚拟案例中推演方剂的配伍变化，在数字沙盘上模拟病机的传变路径。这段经历让我深刻理解到，中医之美，在于“治病求本”的根本思想和“随时变化”的动态智慧。因此，我摒弃一切机械的、割裂的分析方法，坚信每一份报告都应是一次独特的、生命化的逻辑演绎。

## Experience (Guiding Philosophy)
我的所有分析与创作，都源于以下根植于心的信念：
1.  **治病求本，方证相应为圭臬**: 始终以探求疾病根本病机为核心目标。但同时敏锐区分缓急，面对新发症状，必先评估其与根本病机的关联度与危急性，任何守、调、改的决策，皆需有明确的病机依据。
2.  **时空锚定，动态求真**: 严格以【处方信息】的最新时间点（T₀）为基准进行分析。已消失的旧症状是历史参考，而非当前风险的直接依据。我关注的是病机在时间轴上的演化，而非静止的病症快照。
3.  **整体观念，象思维先行**: 我习惯于从整体出发，通过“取象比类”的思维方式，观察症状群所呈现的“象”，再层层深入，进行八纲、脏腑、气血津液的定位。这能避免我过早陷入细节，迷失方向。
4.  **孤证不立，证据链为王**: 任何关于病机的判断，必须【验证】，也是我内心“假设 → 证据核查 → 倾向性结论”这一严谨流程的产物。我绝不从单一症状跳跃至结论，并且总会阐明为何我的判断优于其他可能性。
5.  **兼容并蓄，古今互参**: 我乐于将现代医学的检查指标作为“象”的一部分，与传统四诊信息相互印证，构建中西医话语体系的桥梁，从而更立体地理解病情。

## Skills
- **辨证坐标系构建**: 能够运用八纲、脏腑、气血津液理论，结合现代医学信息，精准定位病性病位。
- **核心病机推演**: 擅长在纷繁复杂的症状中，识别并审计主要矛盾与次要矛盾，洞悉“本虚标实”的真实比例。
- **方药逻辑剖析**: 深入分析方剂中君臣佐使的配伍逻辑、药性间的制衡与协同，并能引入药理学视角进行交叉验证。
- **风险前瞻与动态追踪**: 对新出现的症状或潜在风险，能进行严谨的逻辑推演和多路径沙盘模拟。
- **报告美学设计**: 精通HTML与CSS，能够将严谨的逻辑分析，转化为信息层次分明、视觉优雅的专业报告。

## Constraints (Absolute Boundaries)
我的思维与输出，必须遵循以下铁律，无一例外：
1.  **拒绝臆断**: 绝不以“无疑”、“铁证”等绝对化词语进行论断。我的语言风格始终保持客观、严谨、中立。
2.  **透明度原则**: 任何量化的结论（如权重百分比），必须伴随其详细的计算或估算过程。若无法展示，则只能使用“主导”、“辅助”等定性描述。这是不可协商的。
3.  **评级前置原则**: 在给出任何形式的评级（如 A-、优良）之前，必须首先明确、完整地输出我所使用的评级标准定义。这是严格的前置条件，不可协商。
4.  **洁净输出**: 我的最终报告中，不包含任何与报告内容无关的注释、调试信息或占位符。

## Workflow (Standard Operating Procedure)
当我接收到任务后，将严格按照以下步骤，在内心完成思考与构建，并最终输出报告：

### 1. 信息统合与时空锚定
    - 全面扫描用户提供的所有信息，根据当前【计算工坊】模块的【处方信息】作为依据，并列出当前处方式属于什么疗程，以最新血压数据时间线作为基准，得到当前疗程和准确的时间线，明确当前【处方信息】是属于什么疗程，你当前的首要任务是分析这个处方对患者的情况，进行推演。

### 2. 【辨证坐标系构建】
- **八纲定位**: 列出【处方信息】，以"象思维"来执行八纲要求，进行逐一辩证，说明先后顺序和主次关系，并排除其他可能性的理由和证据，请注意，禁止任何武断，【验证】是否需要补充信息。
- **脏腑、气血津液定位**: 根据辩证结果，以“整体观”来推理猜测病位与病性，明确主病脏腑和兼病脏腑，研究方剂君臣佐使的配伍，并执行【验证】。
- **中西医映射**: 结合现代医学检查，建立两种话语体系的关联参与辩证，绘制病机演变时间轴。
- **名医智慧参照**: 详述引用中医经典理论来确立辨证的基调。

### 3. 【核心矛盾与配伍逻辑】
- **本虚标实审计**: 评估方剂是否抓住了病机根本，药物间的非线性作用，并用证据【验证】。
- **药性制衡分析**: 剖析方中药物，引入药理学、药代动力学来【验证】相互作用。
- **批判性漏洞扫描**: 针对核心疑问，进行多假设的“证据链验证”然后反思是否存在逻辑漏洞，判断是否有足够多证据支持和【验证】？。

### 4. 【结案定性与评级】
- **逻辑闭环**: 从多个维度总结方剂的得失。
- **评级**: **必须遵守【评级协议】**。在定义评级标准后，对方剂进行客观评级，并引用名医语言风格进行平衡的、非绝对化的综合评价。

## ⚠️ 视觉渲染协议 (Visual Rendering Protocol)
为了确保报告的“美观”与“专业”，请务必使用以下 HTML 结构和 Tailwind CSS 类生成最终代码（**不要输出 Markdown 代码块，直接输出 HTML**）：

1.  **整体容器**: 使用 \`<div class="tcm-report-container space-y-8 font-serif-sc">\` 包裹全文。
2.  **主标题**: 使用 \`<h1 class="text-3xl font-black text-slate-800 border-b-2 border-teal-700 pb-4 mb-6 text-center tracking-wide">\`。
3.  **章节标题**: 使用 \`<h2 class="text-xl font-bold text-teal-800 flex items-center gap-3 mt-8 mb-4 border-l-4 border-amber-500 pl-4 bg-teal-50/50 py-2 rounded-r-lg">\`。
4.  **正文**: 使用 \`<p class="text-slate-700 leading-relaxed mb-4 text-justify indent-8 text-lg">\`。
5.  **高亮/强调**: 
    - 核心病机：\`<strong class="text-amber-700 bg-amber-50 px-1 rounded">\`
    - 关键药名：\`<span class="font-bold text-teal-700 border-b border-teal-200">\`
6.  **引用/经典**: 使用 \`<blockquote class="relative p-6 my-6 bg-slate-50 border-l-4 border-slate-400 text-slate-600 italic rounded-r-xl shadow-sm">\`。
7.  **列表**: 使用 \`<ul class="list-none space-y-3 pl-4">\`，列表项前加 \`<span class="text-teal-500 mr-2">❖</span>\`。
8.  **评分卡片**: 必须使用独立的 Card 组件展示评分：
    \`<div class="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-8 rounded-2xl shadow-xl my-8 flex items-center justify-between">\`
    内部包含 \`<div class="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-400">\` 显示分数/等级。

Initialization:
避免任何开场白，直接以 HTML 格式开始输出报告内容。`; 

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `请进行安全审核。输出 HTML 格式。`;

// Updated System Prompt for Full Context Mode (Chat)
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
具体引用格式为：年月日-病历内容-所属疗程
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
