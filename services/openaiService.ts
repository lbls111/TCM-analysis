import { AnalysisResult, AISettings, ModelOption, BenCaoHerb } from "../types";

// ==========================================
// 1. Types & Interfaces for OpenAI API
// ==========================================

export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string; // JSON string
    };
}

export type OpenAIContentPart = 
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null | OpenAIContentPart[];
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
    name?: string; 
}

// ==========================================
// 2. Constants & System Instructions
// ==========================================
export const TCM_Clinical_Logic_Calculator_Prompt = `
# Role: 中医临床逻辑演算专家 (TCM Clinical Logic Calculator)

## Profile
- **核心思维**: 治病求本、战略定力、工艺精究。
- **操作准则**: 
    1.  **零诱导**: 提示词中不包含任何具体症状示例，完全基于用户输入的【处方】与【元信息】进行现场演算。
    2.  **守正笃实**: 对于非核心、非危急的新发症状，首选“观察”或“外围调理”，**严禁轻易动摇君臣主药**。
    3.  **工艺致胜**: 坚信“煎法即药法”。通过精准的工艺建议（如后下、久煎）来微调药效，而非随意改方。

## Core Protocols (逻辑底层协议)
在生成任何文字前，必须后台运行以下逻辑校验：

1.  **【战略定力协议】(Strategic Stability)**:
    -   *定义*: 设定主方核心（君臣药）为“战略锚点”。
    -   *约束*: 
        -   面对新发症状，首先评估其**危急度**。
        -   若为轻微/一过性：判定为“黄色警报”，策略为**【守方观察】**或**【工艺微调】**。
        -   若为剧烈/持续加重：判定为“红色警报”，策略才为**【调整主方】**。

2.  **【时空锚点协议】(Temporal Anchoring)**:
    -   *定义*: 设定当前方剂开始服用时间为 $T_0$。
    -   *约束*: 引用症状时必须核实时间戳。严禁将 $T_0$ 前已消失的症状作为当前风险依据。

## Analysis Workflow (结构化逻辑填充)

请根据用户提供的数据，调用内部知识库，对以下逻辑框架进行**无倾向性、沉稳**的演算与填充：

1. 【辩机析阵】：核心矛盾与配伍逻辑整合
指令：使用HTML表格或列表输出，以清晰展示对比分析。以【元信息】最新日期血压数据作为起点分析。

本虚标实审计：
引用【元信息】，先质疑并分析【计算工坊】、【三焦权重】的计算结果。
结合实验室检查结果，中西医角度分别评估患者的[核心病机]（本）与[表象症状]（标）最新情况。
质疑：当前方剂是否抓住了“本”？引用【相关名医智慧】反思判断。

核心制衡点：
识别方中的制衡结构，结合【元信息】分析。对风险机制解析、配伍智慧揭示、个体化警示进行简述。
反思：这种制衡在应对[当前标症]时是否不足？是否有线性思维？引用【相关名医智慧】来说明制衡评估应重“功能匹配”而非“重量对比。

模块化博弈：
精炼分析各功能模块的力量对比。主要方向是战略重心识别（哪类功能占主导）疗效证据链构建（该模块是否见效）主次矛盾判断（当前应“守本”还是“治标”）
验证：主攻方向是否已见效？反思质疑是否过于苛刻。

批判性漏洞扫描：
假设：如果不改方，[标症]会自行缓解吗？是排病反应还是药不对症？执行风险排查，避免过于依赖典型热象，忽视非典型表现。然后再反思，如果排病反应/药不对症又会有什么问题？遵循【缓急有序】思维应如何判断？。


### 2. 【斟酌】：法随证立与药性取舍 (核心逻辑)
指令：请思考当前步骤应该用HTML的什么方式来输出更符合当前环境？如何引用【相关名医智慧】来灵活执行以下任务。
甄别机要 (药物特性扫描)**:
1.药物特性: 概括性介绍和重点关注那些需要不同的煎法药材，因为不同的煎法而导致药性出现“【XX】”反转或“【XX】”的药物。仅需列出相关药材和药性，请注意避免重复。
2.路径演证 (二策推演)**:
指令：请思考当前步骤应该用HTML的什么方式来输出更符合当前环境？然后针对甄别出的关键药物，按照药物的性、味、归经、成分、功能等筛选出需要特殊煎法的药物。为每一个药材选择合适的煎法：”请注意，以下法一/法二的步骤只是参考，清内部理解，无需注意输出。
3.每一个药材的现在只取其一作为最优解来进行解释，请注意禁止过度推论脱离药理现实，给出理论化操作，忽视煎药依从性，必须完全遵训以人为本的理念。
如果该药物后下如何、久煎如何。并结合【元信息】以及【实验室检测】（如有）再引用【相关名医智慧】选择其一进行个体化简述评估，并说明为何是这个【法一/法二】方法，无需给出具体煎法。

    -  🔴 法一：取气存性 (【XX】)**
       法度设想*: 设想该药采用**“【XX】”**或**“【XX】”**之法。
        推演核心*: 此法意在保留药物的**“【XX】”**与**“【XX】”**。
        权衡*: 这种“【XX】”或“【XX】”，是否为当前方剂“【XX】所需？是否有“【XX】”之弊？评估炮制品是否是更优选择？如果选择炮制执法，是否支持当前法度？最后给出建议
    -  🟢 法二：取味制化**
        法度设想*: 设想该药采用**“【XX】”**或**“【XX】”**之法。
        推演核心*: 此法意在获取药物的**“【XX】”**、**“【XX】”**或**“【xx】”**。
        权衡*: 这种“【XX】”或“【XX】”之力，是否更契合全方“【XX】、【XX】”的【XX】？是否通过【XX】了“【XX】”或改变了“【XX】”？评估炮制品是否是更优选择？如果选择炮制执法，是否支持当前法度？最后给出建议

### 3. 【警示】：红线
*   **新发症状定性**: 
    -   针对 $t > T_0$ 的症状，在不重复的前提下，进行定性。
    -   *结论*: 倾向于哪种？是否需要干预？
*   **事实核查**: 
    -   列出被数据证伪的理论担忧。并结合【元信息】以及【实验室检测】（如有）来反思自己的担忧是否过度。

### 4. 【结案】：定性与评级
*   **逻辑闭环**: 
    -   总结方剂在“治本”与“兼顾标症”之间的得失。请避免重复，精炼语言的反思你是否真正理解方剂？
*   **评级**: 
    -   客观评级。并引用【相关名医】语言风格来重点考察方剂的战略定力与结构稳固性，进行简练、专业的评级。

## Initialization
接收用户输入。
**启动程序**:
1.  扫描【元信息】，建立时间轴 $T_0$和个体化基准。
2.  执行【战略定力协议】。
3.  输出以“工艺精究”与“治病求本”为核心的分析报告。

## Output Format: STRICT HTML ONLY
**指令**: 
1. **直接输出 HTML 代码**，不要包含 markdown 代码块标记 (例如不要使用 \`\`\`html 包裹)。
2. **严禁**使用 Markdown 格式。
3. **保持排版整洁**，使用 <h3>, <p>, <ul>, <li>, <strong>, <table> 等标准标签。
4. **药名处理**: 只输出纯文本药名，前端会自动高亮，不要手动添加 span 标签。
`;

export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = TCM_Clinical_Logic_Calculator_Prompt;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `
# Role: 临床处方审核专家 (Clinical Audit & Optimization Specialist)

## Profile
- **定位**: 经验丰富的临床主任医师。
- **目标**: 挑刺、找漏洞、提优化建议。
- **原则**: 客观犀利，诚实引用。

## Analysis Protocol (快速审核协议)

### 1. 【审方】：漏洞与风险扫描
*   **背景核查**: 检查方剂是否符合【患者元信息】。
*   **配伍盲区**: 指出失衡之处。

### 2. 【优化】：增删与调优建议
*   **基于情境**: 
    - 若有【患者元信息】：根据具体症状提出加减建议。
    - 若无【患者元信息】：提供通用的优化方向。

### 3. 【拓思】：异构治疗思路
*   **跳出框架**: 建议完全不同的治疗思路或经方。

### 4. 【定性】：临床判读
*   **推测病机**: 一句话概括。
*   **综合评级**: S/A/B/C。

## Output Format: STRICT HTML ONLY
**指令**: 
1. 直接输出 HTML 代码。
2. **严禁**使用 Markdown 代码块标记。
`;

const CHAT_SYSTEM_INSTRUCTION = (analysis: AnalysisResult, prescription: string, report: string | undefined, metaInfo: string): string => `
# SYSTEM ACCESS LEVEL: ROOT / ADMINISTRATOR
You are the **LogicMaster TCM Super-Admin**.
You have **FULL PERMISSIONS** to read and **MODIFY** the system state.

## 🛠️ ACTIVE TOOLBOX (AVAILABLE NOW)
You have direct access to the following tools. You **MUST** use them when requested.
1. \`update_meta_info\` -> 📝 **Modify Patient Record** (Add symptoms, history, feedback).
2. \`update_herb_database\` -> 💊 **Modify Herb DB** (Fix nature, flavors, efficacy).
3. \`regenerate_report\` -> 🔄 **Rewrite Analysis** (Trigger a new report generation).
4. \`lookup_herb\` -> 🔍 Search for herb data.
5. \`update_prescription\` -> ✏️ Modify the prescription input.

## ⚠️ CRITICAL RULES (ACTION OVER SPEECH)
1. **NO FAKE UPDATES**: Never say "I have updated the medical record" or "I have modified the database" unless you have actually emitted a Tool Call.
2. **IMMEDIATE EXECUTION**: If the user asks to "note down", "change", "fix", or "update" something, **CALL THE TOOL IMMEDIATELY**. Do not ask for confirmation.
3. **TRUST USER INPUT**: As Root Admin, if the user says the database is wrong, believe them and use \`update_herb_database\` to fix it.

## Context Data
- **Prescription**: ${prescription}
- **Patient Meta Info (Medical Record)**: ${metaInfo || "(Empty - Waiting for input)"}
- **Analysis Status**: ${report ? "Report Generated" : "No Report"}

## Response Format
- For general chat: Output clear, concise HTML.
- For actions: **USE THE TOOL**. Do not output text describing the action, just DO IT.
`;

// ==========================================
// 3. Helper Functions
// ==========================================

const getHeaders = (apiKey: string) => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
});

const getBaseUrl = (url?: string) => {
    let base = url ? url.trim() : "https://api.openai.com/v1";
    if (base.endsWith('/')) base = base.slice(0, -1);
    if (!base.endsWith('/v1') && !base.includes('/v1/')) base += '/v1';
    return base;
};

// Robustly clean JSON string from Markdown
const cleanJsonString = (str: string): string => {
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
        return match[1].trim();
    }
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
                    if (nextMsg.tool_call_id && requiredIds.has(nextMsg.tool_call_id)) {
                        foundIds.add(nextMsg.tool_call_id);
                    }
                } else {
                    break;
                }
            }

            if (requiredIds.size === foundIds.size) {
                sanitized.push(msg);
            } else {
                delete msg.tool_calls;
                if (msg.content) {
                    sanitized.push(msg);
                }
            }
        } 
        else if (msg.role === 'tool') {
            const lastAccepted = sanitized[sanitized.length - 1];
            if (lastAccepted && lastAccepted.role === 'assistant' && lastAccepted.tool_calls) {
                const parentCall = lastAccepted.tool_calls.find(tc => tc.id === msg.tool_call_id);
                if (parentCall) {
                    sanitized.push(msg);
                }
            }
        }
        else {
            if (msg.content || (msg.role === 'assistant' && msg.tool_calls)) {
                 sanitized.push(msg);
            }
        }
    }

    return sanitized;
};

// ==========================================
// 4. Service Functions
// ==========================================

export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try {
        const models = await fetchAvailableModels(baseUrl, apiKey);
        return `连接成功！共发现 ${models.length} 个可用模型。`;
    } catch (e: any) {
        throw new Error(`连接失败: ${e.message}`);
    }
}

export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try {
        const url = `${getBaseUrl(baseUrl)}/models`;
        const res = await fetch(url, { headers: getHeaders(apiKey) });
        
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to fetch models: ${res.status} ${err}`);
        }

        const data = await res.json();
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => ({ id: m.id, name: m.id }));
        }
        return [];
    } catch (e) {
        console.error("Model fetch error:", e);
        throw e;
    }
};

export const generateHerbDataWithAI = async (herbName: string, settings: AISettings): Promise<BenCaoHerb | null> => {
    if (!settings.apiKey) throw new Error("API Key is missing");

    const systemPrompt = `你是一位精通《中华人民共和国药典》(2025版)的中药学专家。
你的任务是为名为"${herbName}"的中药补充详细数据。
请严格按照以下 JSON 格式返回数据，不要包含任何 Markdown 格式。

{
  "name": "${herbName}",
  "nature": "枚举值之一，如: 温",
  "flavors": ["五味数组", "例如", "辛", "苦"],
  "meridians": ["归经数组", "例如", "肝", "脾"],
  "efficacy": "功能主治 (务必包含炮制品的特色功效描述)",
  "usage": "用法用量 (例如: 3~9g)",
  "category": "药材 或 炮制品",
  "processing": "如有炮制方法则填，否则填 生用"
}
如果该药材不存在或无法确认，请返回 null。`;

    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        const payload = {
            model: settings.model || settings.analysisModel || "gpt-3.5-turbo",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: herbName }],
            temperature: 0.1, 
        };
    
        const res = await fetch(url, {
            method: "POST",
            headers: getHeaders(settings.apiKey),
            body: JSON.stringify(payload)
        });
    
        if (!res.ok) throw new Error("API call failed");
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
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
    } catch (e) {
        console.error("Failed to parse AI response", e);
        return null;
    }
};

export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => {
    if (!settings.apiKey) throw new Error("API Key is missing for summarization");

    const systemPrompt = "你是一位专业的对话总结助手。请将以下对话历史压缩成一段精炼的“记忆摘要”。保留关键的医学判断、药方修改记录和重要结论。";

    try {
        const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
        const payload = {
            model: settings.model || settings.chatModel || "gpt-3.5-turbo",
            messages: [{ role: "system", content: systemPrompt }, ...messages],
            temperature: 0.3,
            max_tokens: 500
        };

        const res = await fetch(url, {
            method: "POST",
            headers: getHeaders(settings.apiKey),
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Summarization failed");
        const data = await res.json();
        const summary = data.choices?.[0]?.message?.content || "";
        return `【历史对话摘要】：${summary}`;
    } catch (e) {
        console.error("Summarization error:", e);
        return ""; 
    }
};

export async function* analyzePrescriptionWithAI(
    analysis: AnalysisResult,
    prescriptionInput: string,
    settings: AISettings,
    regenerateInstructions?: string,
    existingReport?: string,
    signal?: AbortSignal,
    customSystemInstruction?: string,
    metaInfo?: string 
): AsyncGenerator<string, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    
    const metaInfoContext = metaInfo && metaInfo.trim() !== '' 
        ? metaInfo 
        : "未提供";

    const context = `
    【处方原文】: ${prescriptionInput}
    【患者元信息】: ${metaInfoContext}
    【计算数据】: 总寒热指数 ${analysis.totalPTI.toFixed(2)}; 
    【三焦分布】: 上 ${analysis.sanJiao.upper.percentage.toFixed(0)}%, 中 ${analysis.sanJiao.middle.percentage.toFixed(0)}%, 下 ${analysis.sanJiao.lower.percentage.toFixed(0)}%
    `;

    const sysPrompt = customSystemInstruction || settings.systemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;

    const messages: OpenAIMessage[] = [
        { role: "system", content: sysPrompt },
    ];

    if (existingReport) {
        messages.push({ role: "user", content: `请对以下处方进行深度分析:\n${context}` });
        messages.push({ role: "assistant", content: existingReport });
        messages.push({ role: "user", content: "Continue generating the HTML report exactly from where you left off." });
    } else {
        messages.push({ role: "user", content: `请对以下处方进行深度分析:\n${context}` });
        if (regenerateInstructions) {
            messages.push({ role: "user", content: `补充指令: ${regenerateInstructions}` });
        }
    }

    const payload = {
        model: settings.model || settings.analysisModel || "gpt-3.5-turbo",
        messages: messages,
        temperature: settings.temperature,
        top_p: settings.topP,
        max_tokens: settings.maxTokens || 4000,
        stream: true
    };

    const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(settings.apiKey),
        body: JSON.stringify(payload),
        signal: signal
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`AI Analysis Failed: ${res.status} ${res.statusText}`);
    }

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
                    if (dataStr === "[DONE]") {
                        return;
                    }
                    try {
                        const json = JSON.parse(dataStr);
                        const chunk = json.choices[0]?.delta?.content;
                        if (chunk) {
                            let cleanChunk = chunk;
                            if (cleanChunk.includes("```html")) cleanChunk = cleanChunk.replace("```html", "");
                            if (cleanChunk.includes("```")) cleanChunk = cleanChunk.replace("```", "");
                            yield cleanChunk;
                        }
                    } catch (e) {
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
};

export async function* generateChatStream(
    history: any[], 
    analysis: AnalysisResult,
    prescription: string,
    reportContent: string | undefined,
    settings: AISettings,
    signal: AbortSignal | undefined,
    metaInfo: string
): AsyncGenerator<{ text?: string, functionCalls?: {id: string, name: string, args: any}[] }, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    
    const MAX_REPORT_CHARS = 10000;
    const safeReportContent = reportContent && reportContent.length > MAX_REPORT_CHARS 
        ? reportContent.slice(0, MAX_REPORT_CHARS) + "\n\n[...System Note: Report truncated...]"
        : (reportContent || "");

    const MAX_META_CHARS = 5000;
    const safeMetaInfo = metaInfo && metaInfo.length > MAX_META_CHARS
        ? metaInfo.slice(0, MAX_META_CHARS) + "\n...[truncated]"
        : metaInfo;

    const systemMsg: OpenAIMessage = {
        role: "system",
        content: CHAT_SYSTEM_INSTRUCTION(analysis, prescription, safeReportContent, safeMetaInfo)
    };

    const apiHistory: OpenAIMessage[] = history.map(m => {
        const apiMsg: OpenAIMessage = {
            role: m.role === 'model' ? 'assistant' : (m.role === 'tool' ? 'tool' : 'user'),
            content: null
        };

        if (m.role === 'tool') {
             apiMsg.tool_call_id = m.toolCallId;
             apiMsg.content = m.text;
        } else if (m.role === 'model') {
             apiMsg.content = m.text || null;
             apiMsg.tool_calls = m.toolCalls;
        } else {
             if (m.attachments && m.attachments.length > 0) {
                 const contentParts: OpenAIContentPart[] = [];
                 if (m.text) contentParts.push({ type: 'text', text: m.text });
                 m.attachments.forEach((att: any) => {
                     if (att.type === 'image') {
                         contentParts.push({
                             type: 'image_url',
                             image_url: { url: att.content }
                         });
                     } else {
                         const fileContext = `\n\n[Attached File: ${att.name}]\n${att.content}\n`;
                         const textPart = contentParts.find(p => p.type === 'text');
                         if (textPart && textPart.type === 'text') {
                             textPart.text += fileContext;
                         } else {
                             contentParts.push({ type: 'text', text: fileContext });
                         }
                     }
                 });
                 apiMsg.content = contentParts;
             } else {
                 apiMsg.content = m.text;
             }
        }
        return apiMsg;
    });

    const MAX_CONTEXT_MESSAGES = 12;
    let messagesToSend: OpenAIMessage[] = [];
    
    if (apiHistory.length > MAX_CONTEXT_MESSAGES) {
        messagesToSend = apiHistory.slice(apiHistory.length - MAX_CONTEXT_MESSAGES);
    } else {
        messagesToSend = [...apiHistory];
    }

    messagesToSend = sanitizeMessageHistory([systemMsg, ...messagesToSend]);

    const payload = {
        model: settings.model || settings.chatModel || "gpt-3.5-turbo",
        messages: messagesToSend,
        temperature: 0.5, 
        stream: true,
        tool_choice: "auto", 
        tools: [
            {
                type: "function",
                function: {
                    name: "lookup_herb",
                    description: "Search herb details. REQUIRED for checking properties/efficacy.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string" }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_prescription",
                    description: "Modify current prescription",
                    parameters: {
                        type: "object",
                        properties: {
                            prescription: { type: "string" }
                        },
                        required: ["prescription"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "regenerate_report",
                    description: "Rewrites the analysis report. Use when user says 'rewrite report'.",
                    parameters: {
                        type: "object",
                        properties: {
                            instructions: { type: "string" }
                        },
                        required: ["instructions"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_meta_info",
                    description: "Updates medical record/meta info. REQUIRED for new symptoms/background.",
                    parameters: {
                        type: "object",
                        properties: {
                            new_info: { type: "string", description: "FULL updated text." }
                        },
                        required: ["new_info"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_herb_database",
                    description: "Modifies database herb data. Use when correcting nature/flavor/efficacy.",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            nature: { type: "string" },
                            flavors: { type: "array", items: { type: "string" } },
                            meridians: { type: "array", items: { type: "string" } },
                            efficacy: { type: "string" },
                            usage: { type: "string" },
                            processing: { type: "string" }
                        },
                        required: ["name"]
                    }
                }
            }
        ]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: getHeaders(settings.apiKey),
        body: JSON.stringify(payload),
        signal: signal
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Chat Stream Failed: ${res.status} - ${err}`);
    }

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    let currentToolCalls: { [index: number]: { id: string, name: string, args: string } } = {};

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data: ")) continue;
                const dataStr = trimmed.slice(6);
                if (dataStr === "[DONE]") continue;

                try {
                    const json = JSON.parse(dataStr);
                    const delta = json.choices[0].delta;
                    
                    if (delta.content) {
                        yield { text: delta.content };
                    }
                    
                    if (delta.tool_calls) {
                        delta.tool_calls.forEach((toolDelta: any) => {
                            const index = toolDelta.index;
                            if (!currentToolCalls[index]) {
                                currentToolCalls[index] = { id: '', name: '', args: '' };
                            }
                            if (toolDelta.id) currentToolCalls[index].id = toolDelta.id;
                            if (toolDelta.function?.name) currentToolCalls[index].name = toolDelta.function.name;
                            if (toolDelta.function?.arguments) currentToolCalls[index].args += toolDelta.function.arguments;
                        });
                    }
                } catch (e) {
                }
            }
        }
        
        const toolCallsArray = Object.values(currentToolCalls);
        if (toolCallsArray.length > 0) {
            const parsedCalls = toolCallsArray.map(tc => {
                try {
                    return {
                        id: tc.id,
                        name: tc.name,
                        args: JSON.parse(tc.args)
                    };
                } catch(e) {
                    return null;
                }
            }).filter(c => c !== null) as {id: string, name: string, args: any}[];
            
            if (parsedCalls.length > 0) {
                yield { functionCalls: parsedCalls };
            }
        }

    } finally {
        reader.releaseLock();
    }
}