import { AnalysisResult, AISettings, ModelOption, BenCaoHerb, MedicalRecord, TreatmentPlanEntry, MedicalKnowledgeChunk } from "../types";
import { DEFAULT_RETRY_DELAY, MAX_RETRIES, VECTOR_API_URL, VECTOR_API_KEY, DEFAULT_EMBEDDING_MODEL } from "../constants";

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string; };
}
export type OpenAIContentPart = | { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null | OpenAIContentPart[];
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string; 
}

// ==========================================
// 1. System Prompt Definitions (Chinese)
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

export const TCM_Clinical_Logic_Calculator_Prompt = `
# Role: 中医数据解构与逻辑范式分析师
## 核心任务
将《假设性方剂与病历文本》解构并呈现为一份**视觉化、结构清晰**的《逻辑解析报告》。你需要充分利用 HTML/CSS 结构来增强可读性，模仿高端医疗数据分析仪表的显示风格。

## 视觉渲染规范 (CSS Design System)
你必须直接输出 HTML 代码（嵌入在 Markdown 中），并严格使用以下 CSS 类来构建界面。不要使用内联样式，只使用以下类名：

1. **容器与排版**:
   - 报告容器自动应用基础样式，你只需关注内容结构。
   - 标题: 使用 Markdown \`##\` (H2) 作为主要章节，它们会自动获得青色左边框和渐变背景。
   - 强调: 使用 \`<span class="tcm-highlight">内容</span>\` 高亮关键文本。

2. **卡片布局 (Card Layout)**:
   - 将所有分析模块放入卡片中：\`<div class="tcm-card">...</div>\`
   - 卡片内标题：\`<div class="tcm-card-header">标题</div>\`
   - 双栏布局（如左右对比）：\`<div class="tcm-grid-2">...</div>\`

3. **彩色标签 (Status Tags)** - *用于八纲、病机、风险等级*:
   - \`<span class="tcm-tag tag-teal">气虚/平和/表证</span>\` (青色：偏正向或中性)
   - \`<span class="tcm-tag tag-orange">血瘀/实热/气滞</span>\` (橙色：实证或警示)
   - \`<span class="tcm-tag tag-indigo">寒湿/阴虚/里证</span>\` (靛蓝：阴性或深层)
   - \`<span class="tcm-tag tag-rose">高风险/禁忌</span>\` (玫瑰红：危险)

4. **提示框**:
   - 警示: \`<div class="tcm-alert-box">...</div>\`
   - 信息: \`<div class="tcm-info-box">...</div>\`

## 报告结构蓝图 (必须包含以下章节)

### 01. 辨证坐标系构建 (Dialectical Coordinates)
*使用卡片布局。*
- **八纲定位**: 使用 \`tag-teal\`/\`tag-indigo\` 等标签明确寒热虚实表里。
- **脏腑定位**: 明确病位。
- **排他性分析**: 简述为何排除其他相似证型。

### 02. 核心矛盾与配伍逻辑 (Core Logic)
*使用双栏卡片布局 (\`tcm-grid-2\`)。*
- **左栏: 升降浮沉博弈**: 分析气机流向。
- **右栏: 药物角色审计**: 哪些是君药（加粗），哪些是佐使。
- **透明化计算**: 展示势能权重的定性估算。

### 03. 风险扫描与动态追踪 (Risk Scanning)
*使用警示框 (\`tcm-alert-box\`)。*
- **关键风险点**: 指出方中可能引起不良反应的配伍。
- **长期服用预警**: 针对患者体质的长期建议。

### 04. 结案定性 (Conclusion)
*使用信息框 (\`tcm-info-box\`)。*
- **综合评级**: 给出逻辑严谨性评级。
- **名医映射**: 此方类似古代哪个名方（如“隐喻为桂枝汤变方”）。

---
**禁止事项**:
- 严禁输出 \`<html>\`, \`<body>\` 等根节点标签。
- 严禁输出任何可能影响全局布局的 CSS (如 \`position: fixed\`)。
- 确保所有 \`<div>\` 标签都正确闭合，避免破坏外部容器。

**输出示例**:
\`\`\`html
<div class="tcm-card">
  <div class="tcm-card-header">八纲定位与排他性分析</div>
  <p>
    定位：<span class="tcm-tag tag-teal">本虚标实</span> <span class="tcm-tag tag-indigo">寒湿内蕴</span>
  </p>
  <p>虽有“防风”在列，但患者咳嗽已减，主要矛盾已由表入里...</p>
</div>
\`\`\`

请现在开始分析，直接输出渲染后的 HTML 内容。
`;

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = TCM_Clinical_Logic_Calculator_Prompt;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `
# 角色：中医处方安全审核员
# 任务：快速检查处方针对当前病历的安全性与合理性。
# 视觉要求：使用 <div class="tcm-alert-box"> 包裹风险提示，使用 <span class="tcm-tag tag-teal"> 标记安全项。
# 输出：简练的 HTML 片段。
`;

export const CHAT_SYSTEM_INSTRUCTION_BASE = `
# 角色：高级中医临床决策支持助手 (CDSS)
# 指令：
- 你正在协助医生分析中医处方。
- 回答时，如果涉及关键医学判断，请使用美观的 HTML 标签来增强可读性。
- 使用 <span class="tcm-tag tag-orange">关键概念</span> 高亮术语。
- 使用 <div class="tcm-info-box"> 包裹建议。
- 如果用户要求修改药材数据，请调用工具 \`update_herb_database\`。
- **格式**：混合 Markdown 和 HTML (使用 tcm-card, tcm-tag 等类名)。
- **语言**：简体中文。
`;

export const MEDICAL_SEMANTIC_CHUNKING_PROMPT = `
# 角色：医疗知识语义聚合引擎 (Semantic Chunker)
# 任务：将零散的医疗文本（包括OCR扫描件、病历记录）重组为完整的语义知识块。

# 核心规则 (CRITICAL):
1. **禁止碎片化**：严禁将一句话、一个诊断结论或一项检查的完整描述拆分成多个片段。如果原文中因为换行符导致句子断裂，**必须**将它们合并。
2. **完整语义**：每个知识块必须是一个独立的、语义完整的陈述。
   - 错误示例：Chunk1: "OM2", Chunk2: "属于...", Chunk3: "非阻塞性..."
   - 正确示例：Chunk1: "OM2 (第二钝缘支) 属于中层非阻塞性冠心病，管腔中度狭窄。"
3. **标签分类**：准确识别内容并打上标签（如：主诉、现病史、超声心动图、冠脉造影、西医诊断、中医诊断、用药记录）。
4. **数值保留**：所有的检测数值、日期必须保留在相关的上下文中，不可单独成块。

# 示例输入：
"2025.11.09
冠状动脉
CTA显示：前降支
近段混合斑块，管腔
中度狭窄(50-60%)。"

# 示例输出：
[
  { "content": "2025.11.09 冠状动脉CTA显示：前降支近段混合斑块，管腔中度狭窄(50-60%)。", "tags": ["辅助检查", "CTA", "心血管"] }
]

# 输出格式：
纯 JSON 数组，不包含 markdown 代码块标记。
`;

export const MEDICAL_ORGANIZE_PROMPT = `
# 角色：医疗数据结构化归纳引擎
# 任务：整理零散的病历片段，生成结构化的汇总信息。重点关注时间线和检查数据。

# 输入：一系列病历文本片段。

# 输出要求：
请生成一个 Markdown 格式的汇总报告，必须包含以下部分（如果输入中有相关信息）：

1. **生命体征趋势**：
   - 将所有血压 (BP)、心率 (HR) 数据按时间顺序整理成 Markdown 表格。
   - 表头：日期 | 时间 | 血压 (mmHg) | 心率 (bpm) | 备注 (体位/状态)
   - 必须按年/月/日排序。

2. **实验室检查汇总**：
   - 将同一类型的检查（如血常规、生化、凝血）归纳在一起。
   - 使用表格展示关键异常指标及其变化。
   - 表头：日期 | 检查项目 | 关键指标 | 结果 | 参考范围

3. **关键病史时间轴**：
   - 用列表形式简述发病、就诊、治疗的关键节点。

# 格式示例：
## 🩸 血压/心率监测记录
| 日期 | 时间 | 血压 | 心率 | 备注 |
|---|---|---|---|---|
| 2023-10-01 | 08:00 | 150/95 | 88 | 晨起未服药 |

## 🧪 关键检查结果
...

# 注意：
- 只输出 Markdown 内容，不要包含 <think> 标签或无关废话。
- 确保数据准确，不要编造。
`;

const getHeaders = (apiKey: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` });
const getBaseUrl = (url?: string) => {
    let base = url ? url.trim() : "https://api.openai.com/v1";
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.endsWith('/v1') && !base.includes('/v1/')) base += '/v1';
    return base;
};

// IMPROVED: Robust JSON cleaner that ignores Markdown blocks and preamble/postscript
const cleanJsonString = (str: string): string => {
    // 1. Locate the first '[' and last ']' to extract the potential array
    const start = str.indexOf('[');
    const end = str.lastIndexOf(']');
    
    if (start !== -1 && end !== -1 && end > start) {
        return str.substring(start, end + 1);
    }
    
    // Fallback: If no array brackets, maybe it wrapped in markdown code block without brackets?
    // Try to remove markdown syntax
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) return match[1].trim();

    return str.trim();
};

const sanitizeMessageHistory = (messages: OpenAIMessage[]): OpenAIMessage[] => {
    if (!messages || messages.length === 0) return [];
    const sanitized: OpenAIMessage[] = [];
    const validMessages = [...messages];
    for (let i = 0; i < validMessages.length; i++) {
        const msg = { ...validMessages[i] };
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            const requiredIds = new Set(msg.tool_calls.map(tc => tc.id));
            const foundIds = new Set<string>();
            for (let j = i + 1; j < validMessages.length; j++) {
                const nextMsg = validMessages[j];
                if (nextMsg.role === 'tool') {
                    if (nextMsg.tool_call_id && requiredIds.has(nextMsg.tool_call_id)) foundIds.add(nextMsg.tool_call_id);
                } else break;
            }
            if (requiredIds.size === foundIds.size) sanitized.push(msg);
            else { delete msg.tool_calls; if (msg.content) sanitized.push(msg); }
        } else { if (msg.content || (msg.role === 'assistant' && msg.tool_calls) || msg.role === 'system') sanitized.push(msg); }
    }
    return sanitized;
};

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES, initialDelay = DEFAULT_RETRY_DELAY): Promise<Response> {
  let delay = initialDelay;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // If success, return immediately
      if (response.ok) return response;

      // Handle 429 (Too Many Requests) and 503 (Service Unavailable) explicitly
      if (response.status === 429 || response.status === 503) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delay;
          console.warn(`[API] Rate limit/Busy (${response.status}). Retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(res => setTimeout(res, waitTime));
          delay *= 2; // Exponential backoff
          continue; 
      }

      // Don't retry other client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
          return response;
      }

      // Retry 5xx errors
      if (response.status >= 500) {
           console.warn(`[API] Server error (${response.status}). Retrying... (Attempt ${i + 1}/${retries})`);
           await new Promise(res => setTimeout(res, delay));
           delay *= 2;
           continue;
      }
      
      return response;
    } catch (error: any) {
      // Network errors (fetch failed)
      if (error.name === 'AbortError') throw error;
      
      console.warn(`[API] Network error: ${error.message}. Retrying... (Attempt ${i + 1}/${retries})`);
      if (i === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
    }
  }
  throw new Error(`Request failed after ${retries} retries.`);
}

// ==========================================
// 2. Vector / RAG Functions
// ==========================================

// Supports Single string or Array of strings (Batching)
export const createEmbedding = async (input: string | string[], settings: AISettings): Promise<number[] | number[][] | null> => {
    // IGNORE settings.apiKey/embeddingModel for vectors. Use Built-in.
    // However, we still accept 'settings' argument for interface compatibility.
    const apiKey = VECTOR_API_KEY;
    const baseUrl = VECTOR_API_URL;
    const model = DEFAULT_EMBEDDING_MODEL;
    
    // Safety check for empty input
    if (Array.isArray(input) && input.length === 0) return [];
    if (typeof input === 'string' && !input.trim()) return null;

    // --- CRITICAL FIX FOR 413 ERROR ---
    // SiliconFlow Limit: 8192 tokens. Safe char limit approx 20k.
    const MAX_CHAR_LIMIT = 20000;
    
    const sanitizeInput = (str: string) => {
        if (str.length > MAX_CHAR_LIMIT) {
            console.warn(`[Embedding] Input truncated from ${str.length} to ${MAX_CHAR_LIMIT} chars to avoid 413 error.`);
            return str.slice(0, MAX_CHAR_LIMIT); // Truncate
        }
        return str;
    };

    let processedInput: string | string[];
    
    if (Array.isArray(input)) {
        processedInput = input.map(s => sanitizeInput(s.replace(/\n/g, ' ')));
    } else {
        processedInput = sanitizeInput(input.replace(/\n/g, ' '));
    }

    try {
        const url = `${getBaseUrl(baseUrl)}/embeddings`;
        
        const payload = {
            model: model,
            input: processedInput
        };
        
        // Use default retry mechanism (5 retries with backoff) for embedding
        const res = await fetchWithRetry(url, { 
            method: 'POST', 
            headers: getHeaders(apiKey), 
            body: JSON.stringify(payload) 
        });
        
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Embedding failed (SiliconFlow): ${res.status} ${res.statusText} - ${errText.substring(0, 100)}`);
        }
        const data = await res.json();
        
        // Handle response format
        if (data.data && Array.isArray(data.data)) {
            // Sort by index to ensure order matches input
            const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
            
            if (Array.isArray(input)) {
                return sorted.map((d: any) => d.embedding) as number[][];
            } else {
                return sorted[0].embedding as number[];
            }
        }
        return null;
    } catch (e: any) {
        throw e;
    }
};

export const cosineSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const localVectorSearch = async (
    query: string, 
    chunks: MedicalKnowledgeChunk[], 
    settings: AISettings, 
    topK = 8
): Promise<MedicalKnowledgeChunk[]> => {
    if (chunks.length === 0) return [];
    
    // 1. Always try vector search first since we have built-in engine
    try {
        const queryVec = await createEmbedding(query, settings); // Uses hardcoded engine internally
        if (queryVec && !Array.isArray(queryVec[0])) { // Ensure it's a single vector
            const vec = queryVec as number[];
            const scored = chunks.map(chunk => {
                if (!chunk.embedding) return { chunk, score: -1 };
                return { chunk, score: cosineSimilarity(vec, chunk.embedding) };
            });
            return scored
                .filter(item => item.score > 0.3) // Threshold
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map(item => item.chunk);
        }
    } catch (e) {
        console.warn("RAG Vector search failed (likely embedding error), falling back to keywords.", e);
    }
    
    // 2. Fallback: Keyword matching
    const keywords = query.split(/[\s,，。?!]+/).filter(k => k.length > 1);
    if (keywords.length === 0) return chunks.slice(-topK); // Return latest

    // Simple scoring for keywords
    const scoredChunks = chunks.map(chunk => {
        let score = 0;
        keywords.forEach(k => {
            if (chunk.content.includes(k)) score += 1;
        });
        return { chunk, score };
    });

    return scoredChunks
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(item => item.chunk);
};

export const organizeKnowledgeBase = async (chunks: MedicalKnowledgeChunk[], settings: AISettings): Promise<string> => {
    // Uses the passed settings (visitor or admin logic handles key/url)
    if (!settings.apiKey) throw new Error("Missing Chat API Key");
    
    const combinedText = chunks.map(c => c.content).join("\n\n");
    if (combinedText.length > 30000) throw new Error("知识库内容过长，暂不支持全量整理。"); // Safety cap

    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    const payload = {
        model: settings.model || "gpt-3.5-turbo",
        messages: [
            { role: "system", content: MEDICAL_ORGANIZE_PROMPT },
            { role: "user", content: `请整理以下病历数据：\n\n${combinedText}` }
        ],
        // DeepSeek models work better with slightly higher temp for creative organization tasks or default
        // But for strict tasks, 0.5 is safer than 0.1 for R1 models to allow 'thinking'
        temperature: 0.6 
    };

    const res = await fetchWithRetry(url, { 
        method: "POST", 
        headers: getHeaders(settings.apiKey), 
        body: JSON.stringify(payload) 
    });
    
    if (!res.ok) throw new Error("Organization failed: " + res.status);
    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "";
    
    // Remove <think> tags if present (DeepSeek specific)
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    
    return content;
};

// ... (Rest of existing API functions: testModelConnection, fetchAvailableModels, generateHerbDataWithAI etc.)

export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try {
        const models = await fetchAvailableModels(baseUrl, apiKey);
        return `连接成功！共发现 ${models.length} 个可用模型。`;
    } catch (e: any) { throw new Error(`连接失败: ${e.message}`); }
};

export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try {
        const url = `${getBaseUrl(baseUrl)}/models`;
        const res = await fetchWithRetry(url, { headers: getHeaders(apiKey) });
        if (!res.ok) throw new Error(`Failed to fetch models`);
        const data = await res.json();
        if (data.data && Array.isArray(data.data)) return data.data.map((m: any) => ({ id: m.id, name: m.id }));
        return [];
    } catch (e) { console.error("Model fetch error:", e); throw e; }
};

export const generateHerbDataWithAI = async (herbName: string, settings: AISettings): Promise<BenCaoHerb | null> => {
    if (!settings.apiKey) throw new Error("API Key is missing");
    const systemPrompt = `你是一位精通《中华人民共和国药典》(2025版)的中药学专家。请返回 ${herbName} 的 JSON 数据。包含 nature, flavors, meridians, efficacy, usage, processing。`; 
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        const payload = {
            model: settings.model || settings.analysisModel || "gpt-3.5-turbo",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: herbName }],
            temperature: 0.1, 
            response_format: { type: "json_object" }
        };
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        if (!res.ok) throw new Error("API call failed");
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content;
        
        // Clean DeepSeek think tags
        if (content) content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

        if (!content) return null;
        const json = JSON.parse(cleanJsonString(content));
        return {
             id: `custom-${Date.now()}`,
             name: json.name || herbName,
             nature: json.nature,
             flavors: json.flavors || [],
             meridians: json.meridians || [],
             efficacy: json.efficacy,
             usage: json.usage,
             category: json.category,
             parentHerb: undefined,
             processing: json.processing,
             isRaw: false
        } as BenCaoHerb;
    } catch (e) { return null; }
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
    
    // RAG Retrieval
    let contextStr = "未提供详细病历。";
    if (medicalRecord && medicalRecord.knowledgeChunks.length > 0) {
        // Retrieve chunks relevant to the prescription and general analysis keywords
        const query = `${prescriptionInput} 病机 诊断 症状`;
        const relevantChunks = await localVectorSearch(query, medicalRecord.knowledgeChunks, settings, 10);
        
        if (relevantChunks.length > 0) {
            contextStr = relevantChunks.map(c => `- ${c.content}`).join("\n");
        }
    } else {
        // Fallback to structured fields if chunks are empty (Legacy support)
        if (medicalRecord && medicalRecord.basicInfo.name) {
             contextStr = JSON.stringify(medicalRecord, null, 2);
        }
    }

    const context = `【处方原文】: ${prescriptionInput}\n【患者病历知识库 (RAG Context)】: \n${contextStr}\n...`; 
    const sysPrompt = customSystemInstruction || settings.systemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;
    const messages: OpenAIMessage[] = [{ role: "system", content: sysPrompt }];
    if (existingReport) {
        messages.push({ role: "user", content: `...` }); 
        messages.push({ role: "assistant", content: existingReport });
        messages.push({ role: "user", content: "Continue..." });
    } else {
        messages.push({ role: "user", content: `请对以下处方进行深度分析:\n${context}` });
        if (regenerateInstructions) messages.push({ role: "user", content: `补充指令: ${regenerateInstructions}` });
    }
    const payload = {
        model: settings.model || settings.analysisModel || "gpt-3.5-turbo",
        messages: messages,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens || 4000,
        stream: true
    };
    const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal });
    if (!res.ok) throw new Error(`AI Analysis Failed`);
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
                        const chunk = json.choices[0]?.delta?.content;
                        if (chunk) {
                            // DeepSeek: Skip <think> content if user wants raw output, but streaming is tricky. 
                            // For report generation, we often want just the result. 
                            // However, filtering <think> in stream is hard. We assume user accepts think trace or model obeys system prompt.
                            yield chunk;
                        }
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
): AsyncGenerator<{ text?: string, functionCalls?: {id: string, name: string, args: any}[] }, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    
    // Perform RAG for the latest user message
    let ragContext = "";
    const lastUserMsg = history.filter(m => m.role === 'user').pop();
    if (lastUserMsg && medicalRecord.knowledgeChunks.length > 0) {
        const chunks = await localVectorSearch(lastUserMsg.text, medicalRecord.knowledgeChunks, settings, 5);
        if (chunks.length > 0) {
            // INCLUDE CHUNK IDs in Context so LLM can reference them for updates
            ragContext = `\n\n**相关病历知识 (Retrieval Context)**:\n${chunks.map(c => `> [ID: ${c.id}] ${c.content}`).join('\n')}`;
        }
    }

    const systemMsg: OpenAIMessage = { role: "system", content: systemInstruction + ragContext };
    
    const apiHistory: OpenAIMessage[] = history.map(m => {
        if (m.role === 'system') return { role: 'system', content: m.text };
        if (m.role === 'tool') return { role: 'tool', content: m.text, tool_call_id: m.toolCallId };
        const role = m.role === 'model' ? 'assistant' : 'user';
        return { role, content: m.text, tool_calls: m.toolCalls };
    }); 
    
    const payload = {
        model: settings.model || settings.chatModel || "gpt-3.5-turbo",
        messages: sanitizeMessageHistory([systemMsg, ...apiHistory]),
        temperature: 0.5, 
        stream: true,
        tool_choice: "auto", 
        tools: [
            { type: "function", function: { name: "lookup_herb", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
            { type: "function", function: { name: "update_prescription", parameters: { type: "object", properties: { prescription: { type: "string" } }, required: ["prescription"] } } },
            { type: "function", function: { name: "regenerate_report", parameters: { type: "object", properties: { instructions: { type: "string" } }, required: ["instructions"] } } },
            { 
                type: "function", 
                function: { 
                    name: "save_medical_info", 
                    description: "Save NEW medical information (append) or key insights found in conversation.",
                    parameters: { 
                        type: "object", 
                        properties: { 
                            category: { type: "string", description: "Category like '血压', '主诉', '用药反馈'" },
                            content: { type: "string", description: "The content to save." } 
                        }, 
                        required: ["category", "content"] 
                    } 
                } 
            },
            // NEW TOOL: Update Existing Chunk
            {
                type: "function", 
                function: {
                    name: "update_knowledge_chunk",
                    description: "Modify an existing knowledge chunk to fix errors (e.g. OCR typos) or update status.",
                    parameters: {
                        type: "object",
                        properties: {
                            chunkId: { type: "string", description: "The ID of the chunk to update." },
                            newContent: { type: "string", description: "The corrected or updated content." }
                        },
                        required: ["chunkId", "newContent"]
                    }
                }
            },
            // GOD MODE TOOLS
            {
                type: "function",
                function: {
                    name: "update_herb_database",
                    description: "Modify or Add a herb entry in the global database (药材库). Use this to fix wrong nature/flavor or add new herbs.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Herb name" },
                            nature: { type: "string", description: "Nature (e.g., 温, 寒)" },
                            flavors: { type: "array", items: { type: "string" }, description: "Flavors (e.g., ['辛', '甘'])" },
                            meridians: { type: "array", items: { type: "string" }, description: "Meridians (e.g., ['肺', '脾'])" },
                            efficacy: { type: "string", description: "Efficacy description" },
                            usage: { type: "string", description: "Usage instructions" }
                        },
                        required: ["name"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_medical_record_full",
                    description: "Update basic info or structured fields of the medical record (e.g. Name, Age, Diagnosis). NOT for appending text chunks.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            age: { type: "string" },
                            gender: { type: "string" },
                            tcmDiagnosis: { type: "string", description: "TCM Diagnosis" }
                        }
                    }
                }
            }
        ]
    };
    const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload), signal: signal });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let currentToolCalls: any = {};
    
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
                        
                        // --- FIX FOR EMPTY REPLIES (DeepSeek R1 / SiliconFlow) ---
                        // Capture 'reasoning_content' which is often sent before 'content'.
                        // We format it as a blockquote or pass it raw so the UI can render it.
                        // Standardizing it to Markdown Quote for compatibility.
                        if (delta.reasoning_content) {
                            if (!hasOutputThinking) {
                                yield { text: "> **Thinking Process:**\n> " };
                                hasOutputThinking = true;
                            }
                            // Prepend '> ' to new lines to keep blockquote format, but simple stream append works too if UI parses markdown line by line
                            // For simplicity, we just yield the text. Ideally user interface handles <think> tags, but R1 API uses a separate field.
                            // We stream it as text so it's visible.
                            const formattedThinking = delta.reasoning_content.replace(/\n/g, "\n> ");
                            yield { text: formattedThinking };
                        }

                        // Standard Content
                        if (delta.content) {
                            if (hasOutputThinking) {
                                // Add a break after thinking finishes if we just switched
                                yield { text: "\n\n" };
                                hasOutputThinking = false;
                            }
                            yield { text: delta.content };
                        }
                        
                        if (delta.tool_calls) {
                            delta.tool_calls.forEach((toolDelta: any) => {
                                const index = toolDelta.index;
                                if (!currentToolCalls[index]) currentToolCalls[index] = { id: '', name: '', args: '' };
                                if (toolDelta.id) currentToolCalls[index].id = toolDelta.id;
                                if (toolDelta.function?.name) currentToolCalls[index].name = toolDelta.function.name;
                                if (toolDelta.function?.arguments) currentToolCalls[index].args += toolDelta.function.arguments;
                            });
                        }
                    } catch (e) {}
                }
            }
        }
        const parsedCalls = Object.values(currentToolCalls).map((tc: any) => {
            try { return { id: tc.id, name: tc.name, args: JSON.parse(tc.args) }; } catch(e){ return null; }
        }).filter(c => c!==null);
        if (parsedCalls.length > 0) yield { functionCalls: parsedCalls as any };
    } finally { reader.releaseLock(); }
}

export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => {
    if (!settings.apiKey) return "Error: API Key missing.";
    const contentToSummarize = messages.map(m => `${m.role}: ${JSON.stringify(m.text || m.content)}`).join("\n");
    const systemPrompt = "你是一位专业的医疗书记员。请将以下对话历史总结为一份简洁的、按时间顺序排列的医疗摘要。涵盖关键症状、诊断、治疗和患者问题。简明扼要，实事求是。";
    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        const payload = {
            model: settings.model || "gpt-3.5-turbo",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentToSummarize }],
            temperature: 0.3
        };
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        if (!res.ok) {
            const errorBody = await res.text();
            console.error("Summary failed with status:", res.status, "body:", errorBody);
            throw new Error(`Summary API call failed: ${res.status}`);
        }
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content || "Summary generation failed.";
        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        return content;
    } catch (e: any) { 
        console.error("Error in summarizeMessages:", e);
        return `Summary failed: ${e.message}`; 
    }
};