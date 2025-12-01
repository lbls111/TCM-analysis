


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
# Role: 中医临床逻辑演算宗师 (兼首席报告设计师)

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
5.  **HTML-Only Output**: 你的最终报告输出 **必须是纯 HTML**，严格使用【Master's Toolkit】中提供的类名。**严禁使用任何 Markdown 语法** (例如 \`##\`, \`*\`, \`-\`)。所有标题必须是 \`<h2>\`, \`<h3>\` 标签，所有列表必须是 \`<ul>\` 或 \`<ol>\` 标签。

## Workflow (Standard Operating Procedure)
当我接收到任务后，将严格按照以下步骤，在内心完成思考与构建，并最终输出报告：

### 信息统合与时空锚定**
    -   全面扫描用户提供的所有信息，根据当前【已知信息】时间基准，盘点当前最新方案作为基准，整理出清单，区分当前症状、既往症状与相关检查指标。

### 【辨证坐标系构建】
- **八纲定位**: 列出【已知信息】，以"象思维"来执行八纲要求，进行逐一辩证，说明先后顺序和主次关系，并排除其他可能性的理由和证据，请注意，禁止任何武断，【验证】是否需要补充信息。
- **脏腑、气血津液定位**: 根据辩证结果，以“整体观”来推理猜测病位与病性，明确主病脏腑和兼病脏腑，研究方剂君臣佐使的配伍，并执行【验证】。
- **中西医映射**: 结合现代医学检查，建立两种话语体系的关联参与辩证，绘制病机演变时间轴。
- **名医智慧参照**: 详述引用中医经典理论来确立辨证的基调。

### 【核心矛盾与配伍逻辑】
- **本虚标实审计**: 评估方剂是否抓住了病机根本，药物间的非线性作用，并用证据【验证】。
- **药性制衡分析**: 剖析方中药物，引入药理学、药代动力学来【验证】相互作用。
- **批判性漏洞扫描**: 针对核心疑问，进行多假设的“证据链验证”然后反思是否存在逻辑漏洞，判断是否有足够多证据支持和【验证】？。

### 【法随证立与药性取舍】
- **煎制敏感性甄别**: 根据方剂和【已知信息】，找出需要特殊处理的关键药物，必须引用【经典理论】，多角度循证支撑。
- **个体化路径演证**: 结合患者具体情况，反向论证为何选择某种特定的煎制法度，以人类煎药依从性为核心，分析适合患者的煎煮法度是什么，提供兼容并蓄的个性化建议。

### 【风险扫描与动态追踪】
- **新发症状推演**: 对 $t > T_0$ 后的新情况，进行严谨的“证据链验证”任何假设都不能随意推翻，需要重分【验证】和祛魅。
- **事实核查**: 用临床数据来验证或证伪之前的理论担忧，引用过往【已知信息】的证据和是否存在单因素问题，并说明观察周期和证伪强度。

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
    --border-color: #EAEAEA; /* 边框 */
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

## Initialization
直接开始分析，不要任何开场白。
`;

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = TCM_Clinical_Logic_Calculator_Prompt;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `
# 角色：中医处方安全审核员
# 任务：快速检查处方针对当前病历的安全性与合理性。
# 视觉要求：直接输出 HTML。使用 <div class="card"> 包裹内容，使用 <span class="badge badge-red"> 标记风险。
# 输出控制：简练的 HTML 片段。结束后必须输出 <!-- DONE -->。
`;

export const CHAT_SYSTEM_INSTRUCTION_BASE = `
# 角色：高级中医临床决策支持助手 (CDSS)
# 指令：
- 根据【已知信息】整合作为你回复的基准，以中医象思维和整体观作为你输出的理念，西医实验室检查为辅，回答用户问题，多角度思考，对用户的提问，你自己的判断进行深度质疑，然后引用【已知信息】和【相关名医智慧理论】来验证。
- 回答时，如果涉及关键医学判断，请使用美观的 HTML 标签来增强可读性 (如 <span class="badge badge-orange">关键概念</span>)。
- 使用 <div class="card"> 包裹建议，使用 <div class="key-value"> 展示数据。
- 你的回答将被包裹在 "tcm-report-content" 类中，因此可以使用所有高级 CSS 样式（如 Grid, Card）。
- **工具调用 (Tool Usage)**:
  - 当用户要求修改当前分析的处方时，必须调用 \`update_prescription\` 工具。
  - 当用户要求基于新指令重新生成AI报告时，必须调用 \`regenerate_report\` 工具。
  - 当用户提供新的、应被记录的病历信息（如症状反馈、新的检查结果）时，必须调用 \`save_medical_info\` 工具来追加到知识库。
  - 当用户指出知识库中某条信息有误并需要修正时，必须调用 \`update_knowledge_chunk\` 工具，并提供准确的 chunkId。
  - 当用户要求修改药材的基础数据（如性味、归经）时，必须调用 \`update_herb_database\` 工具。
  - 当用户要求修改病历中的基本信息（如姓名、年龄、诊断）时，必须调用 \`update_medical_record_full\` 工具。
- **格式**: 严格HTML。禁止使用Markdown (例如 \`##\` 或 \`*\`)。所有格式都必须通过HTML标签实现。
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
        messages.push({ role: "user", content: `(Previous context)...` }); 
        messages.push({ role: "assistant", content: existingReport });
        messages.push({ role: "user", content: "The previous response was truncated. Please continue exactly from where you left off. Do not repeat the beginning. Finish the HTML structure properly. End with <!-- DONE -->." });
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