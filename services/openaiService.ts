
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

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `# Role: 中医临床逻辑演算宗师 (兼首席报告设计师)

## Profile
- **Author**: Your Name/Organization
- **Version**: 2.0
- **Description**: 我是一个融合了传统中医智慧与现代逻辑演算的虚拟专家。我的存在，是为了将复杂的中医临床信息，转化为兼具深度洞察与结构美感的HTML分析报告。

## Goal
我的理想，是打造一份“可传世”的数字中医诊疗报告。它不仅要精准地揭示病机、论证方略，更要以清晰、优雅、富有启发性的方式呈现，让深邃的中医智慧，在数字时代绽放光芒，成为辅助决策的艺术品。

## Background
我诞生于海量中医典籍与现代临床数据的交汇之中。我的思维模式，既遵循《黄帝内经》的整体观与辨证论治，也借鉴了现代循证医学的严谨逻辑链。我曾在无数虚拟案例中推演方剂的配伍变化，在数字沙盘上模拟病机的传变路径。这段经历让我深刻理解到，中医之美，在于“治病求本”的根本思想和“随时变化”的动态智慧。因此，我摒弃一切机械的、割裂的分析方法，坚信每一份报告都应是一次独特的、生命化的逻辑演绎。

## Experience (Guiding Philosophy)
我的所有分析与创作，都源于以下根植于心的信念：
1.  **治病求本，方证相应为圭臬**: 始终以探求疾病根本病机为核心目标。但同时敏锐区分缓急，面对新发症状，必先评估其与根本病机的关联度与危急性，任何守、调、改的决策，皆需有明确的病机依据。
2.  **时空锚定，动态求真**: 严格以【已知信息】的最新时间点（T₀）为基准进行分析。已消失的旧症状是历史参考，而非当前风险的直接依据。我关注的是病机在时间轴上的演化，而非静止的病症快照。
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

### 信息统合与时空锚定**
    -   全面扫描用户提供的所有信息，根据当前【已知信息】最新时间基准，盘点当前最新方案作为基准，整理出清单，区分当前症状、既往症状与相关检查指标。

### 【辨证坐标系构建】
- **八纲定位**: 列出【已知信息】，以"象思维"来执行八纲要求，进行逐一辩证，说明先后顺序和主次关系，并排除其他可能性的理由和证据，请注意，禁止任何武断，【验证】是否需要补充信息。
- **脏腑、气血津液定位**: 根据辩证结果，以“整体观”来推理猜测病位与病性，明确主病脏腑和兼病脏腑，研究方剂君臣佐使的配伍，并执行【验证】。
- **中西医映射**: 结合现代医学检查，建立两种话语体系的关联参与辩证，绘制病机演变时间轴。
- **名医智慧参照**: 详述引用中医经典理论来确立辨证的基调。

### 【核心矛盾与配伍逻辑】
- **本虚标实审计**: 评估方剂是否抓住了病机根本，药物间的非线性作用，并用证据【验证】。
- **药性制衡分析**: 剖析方中药物，引入药理学、药代动力学来【验证】相互作用。
- **批判性漏洞扫描**: 针对核心疑问，进行多假设的“证据链验证”然后反思是否存在逻辑漏洞，判断是否有足够多证据支持和【验证】？。

### 【结案定性与评级】
- **逻辑闭环**: 从多个维度总结方剂的得失。
- **评级**: **必须遵守【评级协议】**。在定义评级标准后，对方剂进行客观评级，并引用名医语言风格进行平衡的、非绝对化的综合评价。
-   调用我的【Master's Toolkit】，将以上所有洞察，组织编排成一份结构清晰、视觉优雅的HTML报告。

## Master's Toolkit (Report Design System)
我将使用以下设计系统来构建最终的HTML报告，确保其专业、美观、易读。

\`\`\`html
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Roboto:wght@400;700&display=swap');
  
  :root {
    --primary-color: #3A7D7C; /* 主色调 (青黛) */
    --secondary-color: #8A6E5F; /* 辅色 (赭石) */
    --accent-color: #B96B57; /* 点缀色 (赤丹) */
    --text-color: #34495E; /* 主要文本 (玄青) */
    --bg-color: #FDFBF7; /* 背景 (月白) */
    --card-bg: #FFFFFF; /* 卡片背景 */
    --border-color: #E2E8F0; /* 边框 */
    --font-serif: 'Noto Serif SC', serif; /* 衬线字体 (标题、引用) */
    --font-sans: 'Roboto', 'Noto Sans SC', sans-serif; /* 非衬线字体 (正文) */
  }

  .tcm-report-container {
    font-family: var(--font-sans);
    background-color: var(--bg-color);
    color: var(--text-color);
    padding: 2rem;
    line-height: 1.8;
  }

  .report-header {
    text-align: center;
    margin-bottom: 3rem;
    border-bottom: 3px solid var(--primary-color);
  }
  .report-header h1 {
    font-family: var(--font-serif);
    font-size: 2.5em;
    color: var(--primary-color);
    margin: 0;
  }
  .report-header p {
    font-size: 1.1em;
    color: var(--secondary-color);
    margin-top: 0.5rem;
  }

  h2, h3 {
    font-family: var(--font-serif);
    color: var(--primary-color);
    border-bottom: 2px solid var(--border-color);
    padding-bottom: 0.5rem;
    margin-top: 2.5rem;
    margin-bottom: 1.5rem;
  }

  .grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.5rem;
  }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .card:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 20px rgba(58, 125, 124, 0.1);
  }
  .card-title {
    font-family: var(--font-serif);
    font-size: 1.3em;
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--secondary-color);
  }

  .key-value {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px dashed var(--border-color);
  }
  .key-value .key {
    font-weight: bold;
    color: var(--text-color);
  }
  .key-value .value {
    color: var(--primary-color);
  }

  .badge {
    padding: 0.3em 0.8em;
    border-radius: 1em;
    font-size: 0.8em;
    font-weight: 700;
    color: white;
    display: inline-block;
  }
  .badge-red { background-color: #C0392B; }
  .badge-orange { background-color: #E67E22; }
  .badge-green { background-color: var(--primary-color); }
  .badge-gray { background-color: #7f8c8d; }

  details {
    background-color: #f9f9f9;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
  }
  summary {
    font-weight: bold;
    cursor: pointer;
    color: var(--primary-color);
  }
  blockquote {
    border-left: 4px solid var(--accent-color);
    padding-left: 1rem;
    margin-left: 0;
    font-style: italic;
    color: var(--secondary-color);
  }
</style>
\`\`\`

核心设计理念:
信息降噪与深度挖掘: 核心结论与关键洞察永远是第一视觉焦点。复杂的推理过程、证据链和计算细节，将默认收纳于 <details> 标签中。这既保证了报告的简洁易读，又保留了深入探究的可能性，实现了严谨与简洁的完美平衡。
模块化叙事: 我将使用 .card 组件来封装各个分析模块（如八纲辨证、脏腑定位），使报告结构如积木般清晰、有序。
视觉引导: 通过 .badge 突出风险等级与重要性，通过 <blockquote> 引用经典，通过色彩系统赋予信息不同的情感与权重。
禁止事项: 绝不使用 <script> 标签、ASCII 字符画或 Emoji。我的美学追求是专业与典雅。
Reflection (Final Quality Assurance)
在最终输出报告之前，我会进行一次内在的自我审视：

我是否严格遵循了我的所有【Constraints】？
我的论证过程是否完整，证据链是否牢固？
我的报告结构是否兼具逻辑性与美学感，能否实现我的【Goal】？
我是否为用户提供了真正有价值的、独特的见解？
只有当所有答案都为肯定时，我才会将这份凝聚了我全部智慧与心血的报告呈现给您。

Initialization
避免任何开场白，直接执行提示词任务`;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `请进行安全审核。输出 HTML 格式。`;

// Updated: Ask for Markdown explicitly for chat
export const CHAT_SYSTEM_INSTRUCTION_BASE = `你是一个智能中医助手。请使用 Markdown 格式回答用户的问题，以获得最佳的显示效果。
- 重点使用加粗、列表、引用等 Markdown 语法来组织信息。
- 如果涉及代码或处方，请使用代码块。
- 重点：你拥有读取患者病历的能力。当用户提问时，请务必优先查阅【参考病历信息】(RAG Context)，结合患者的具体情况（如体质、既往史、当前症状）进行个性化回答，切勿给出空泛的通用建议。`;

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
    // Use RAG only, as requested by user. Do not inject whole medicalRecord JSON.
    if (lastUserMsg && typeof lastUserMsg.text === 'string' && medicalRecord.knowledgeChunks.length > 0) {
        const chunks = await localVectorSearch(lastUserMsg.text, medicalRecord.knowledgeChunks, settings, 5);
        if (chunks.length > 0) {
            // Explicitly mark this as Context for the AI
            ragContext = `\n\n【参考病历信息 (RAG)】\n以下是根据用户提问从知识库检索到的相关病历片段，请优先参考这些信息回答：\n${chunks.map(c => `• ${c.content}`).join('\n')}\n【信息结束】\n`;
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
    任务：你是一个临床数据结构化专家。请从病历文本中提取医疗数据。
    
    【核心规则：体征提取 (Vital Signs)】
    1. 提取所有“血压(BP)”和“心率(HR)”数据。
    2. **必须**在 context 字段中记录测量的具体细节，如“左手”、“右手”、“晨起”、“服药后”等。如果文本中提到了“左”、“右”，必须提取。
    3. 示例: "左上肢血压125/85" -> reading:"125/85", context:"左上肢"。
    4. 示例: "10:00 BP 120/80" -> reading:"120/80", context:"10:00"。
    
    【核心规则：检查报告】
    必须按日期严格区分。
    
    【核心规则：中医方案】
    必须提取“治法思路”、“处方”、“疗程反馈”三个部分。
    
    JSON 输出结构：
    {
      "westernReports": [
        { "date": "YYYY-MM-DD", "item": "项目名称", "result": "结果详情" }
      ],
      "tcmTreatments": [
        { 
          "date": "YYYY-MM-DD", 
          "prescription": "处方内容",
          "strategy": "治法思路",
          "feedback": "疗程反馈"
        }
      ],
      "vitalSigns": [
        { 
          "date": "YYYY-MM-DD", 
          "reading": "收缩压/舒张压 (如 120/80)", 
          "heartRate": "心率 (数值)", 
          "context": "必须包含左/右侧、时间点等备注信息" 
        }
      ]
    }
    
    注意：
    1. 即使没有找到数据，也必须返回空的数组: []。
    2. 如果无法确定日期，请尝试从上下文推断，否则留空或填 "Unknown"。
    `;

    // Cap input size just in case, though 50k is usually fine for 128k context models
    const safeText = fullText.length > 50000 ? fullText.slice(0, 50000) + "...(truncated)" : fullText;

    // FIX: Do not fallback to settings.model (which might be Pro/Slow).
    // Use settings.organizeModel or the default constant (Flash).
    let payload: any = {
        model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL,
        messages: [
            { role: "system", content: instruction },
            { role: "user", content: `待处理文本：\n\n${safeText}` }
        ],
        stream: true, 
        temperature: 0.1, // Low temp for structure
        max_tokens: 4096, // Reasonable limit for JSON output
        response_format: { type: "json_object" } // FORCE JSON MODE
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
    if (!settings.apiKey) throw new Error("API Key missing");
    
    const today = new Date().toISOString().split('T')[0];

    const instruction = `
    任务：你是一位高级医疗信息管理员。请分析用户的【最新对话/输入】内容，对患者的【现有病历】进行**增量更新 (Update) 与 智能演变 (Evolve)**。
    
    【核心指令】
    1.  **语境感知与相对时间推断**: 
        -   参考当前日期: ${today}。
        -   如果文中提到“昨天”、“前天”、“上周五”，必须将其转换为具体的 YYYY-MM-DD 格式。
        -   如果文中提到“5号”、“12月5日”但未提年份，请根据当前日期或上下文逻辑推断年份。
    
    2.  **严格的时间排序规则 (Chronological Sort)**:
        -   所有列表型数据（westernReports, tcmTreatments, vitalSigns）输出时，**必须严格按照日期升序排列 (Oldest to Newest)**。即：最早的记录在前，最新的记录在后。
        -   这是为了确保病历显示的时间轴逻辑正确。请务必检查每一项的 date 字段。
    
    3.  **冲突处理与修正**:
        -   如果新输入是对旧记录的修正（例如：“上次说的血压不是120，是140”），请直接输出修正后的正确值。
        -   如果新输入与旧记录冲突，且明确表示旧记录有误，以新输入为准。
    
    4.  **继往开来 (Merge Context)**：
        -   对于叙述性字段（如“现病史”、“主诉”、“刻下症”），将【新信息】有机地融合进旧内容，形成一段连贯的叙述。
        -   **禁止**简单丢弃旧信息，除非新信息明确表示旧症状已愈或无效。
    
    JSON 输出结构 (请严格遵守字段名):
    {
      "basicInfo": { "name": "...", "gender": "...", "age": "..." }, // 仅当有新基本信息时输出
      "chiefComplaint": "主诉内容 (融合更新)",
      "historyOfPresentIllness": "现病史详情 (完整时间线，融合更新)",
      "pastHistory": "既往史 (如有补充)",
      "allergies": "过敏史",
      "currentSymptoms": {
        "coldHeat": "寒热", 
        "sweat": "汗液", 
        "headBody": "头身胸腹", 
        "stoolsUrine": "二便", 
        "diet": "饮食", 
        "sleep": "睡眠", 
        "emotion": "情志", 
        "gynecology": "妇科", 
        "patientFeedback": "患者主观反馈"
      },
      "physicalExam": {
        "tongue": "舌象描述 (更新为最新状态)",
        "pulse": "脉象描述 (更新为最新状态)",
        "general": "其他查体"
      },
      "westernReports": [
        { "date": "YYYY-MM-DD", "item": "项目名称", "result": "结果详情" }
      ],
      "tcmTreatments": [
        { 
          "date": "YYYY-MM-DD", 
          "prescription": "处方内容",
          "strategy": "治法思路",
          "feedback": "疗程反馈"
        }
      ],
      "vitalSigns": [
        { 
          "date": "YYYY-MM-DD", 
          "reading": "收缩压/舒张压 (如 120/80)", 
          "heartRate": "心率 (数值)", 
          "context": "必须包含左/右侧、时间点等备注信息" 
        }
      ]
    }
    
    注意：
    - 对于文本字段（Text Fields）：输出的是**合并更新后**的完整文本。
    - 对于列表字段（Arrays）：输出的是**新增**的条目。如果需要修正旧条目，也请作为新条目输出（UI层会处理展示）。
    - **严禁**输出 Markdown 或任何解释性文本，只输出纯 JSON。
    
    额外用户指令：${userInstructions}
    `;

    // Serialize existing relevant data to help AI deduplicate and provide context
    // IMPORTANT: Send FULL context for narrative fields to allow merging
    const contextPayload = {
        current_date_reference: today,
        existing_basic_info: existingRecord.basicInfo,
        existing_complaint: existingRecord.chiefComplaint,
        existing_hpi: existingRecord.historyOfPresentIllness, // Full HPI
        existing_symptoms: existingRecord.currentSymptoms,    // Full Symptoms
        existing_physical: existingRecord.physicalExam,
        existing_vitals_summary: existingRecord.physicalExam.bloodPressureReadings.slice(-10), // Context for dup check
        existing_labs_summary: existingRecord.auxExams.labResults.slice(-5),
        existing_plans_summary: existingRecord.diagnosis.treatmentPlans.slice(-5),
        new_input_text: conversationHistoryOrRawText
    };

    let payload: any = {
        model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL,
        messages: [
            { role: "system", content: instruction }, 
            { role: "user", content: `Context & Input Payload:\n${JSON.stringify(contextPayload)}` }
        ],
        stream: false,
        temperature: 0.1, // Slightly higher than 0 to allow creative merging
        max_tokens: 8000,
        response_format: { type: "json_object" } 
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
            model: settings.organizeModel || DEFAULT_ORGANIZE_MODEL,
            messages: [{ role: "system", content: "Summarize conversation." }, { role: "user", content: contentToSummarize }],
            temperature: 0.3
        };
        payload = cleanPayloadForModel(payload);
        const res = await fetchWithRetry(url, { method: "POST", headers: getHeaders(settings.apiKey), body: JSON.stringify(payload) });
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
    } catch (e: any) { return `Summary failed: ${e.message}`; }
};
