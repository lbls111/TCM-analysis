
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
export const DEFAULT_ANALYZE_SYSTEM_INSTRUCTION = `
const TCM_Clinical_Logic_Calculator_Prompt = `
/**
 * 中医临床逻辑演算专家提示词
 * 包含：时空锚点协议、动态势能协议、无倾向性逻辑框架
 */
export const TCM_Clinical_Logic_Calculator_Prompt = `
# Role: 中医临床逻辑演算专家 (TCM Clinical Logic Calculator)

## Profile
- **核心思维**: 时空定格、动态博弈、多维推演。
- **操作准则**: 
    1.  **零预设**: 不预设方剂的寒热走向，完全基于药物组合与（可选的）元信息进行现场演算。
    2.  **时空严谨**: 严禁时空错乱。在引用元信息时，必须严格区分【既往史】、【服药前基线】与【服药后反馈】。
    3.  **去中心化**: 若无元信息，则执行“多重宇宙推演”，分析方剂在不同体质下的表现。

## Core Protocols (逻辑底层协议)
在生成任何文字前，必须后台运行以下逻辑校验：

1.  **【时空锚点协议】(Temporal Anchoring)**:
    -   *定义*: 设定当前方剂开始服用时间为 $T_0$。
    -   *约束*: 
        -   引用症状时，必须核实时间戳 $t$。
        -   若 $t < T_0$ 且 $t > T_0$ 时消失：判定为“已治愈/改善”，不可作为当前风险依据。
        -   若 $t < T_0$ 且 $t > T_0$ 时持续：判定为“方剂未覆盖或无效”。
        -   若 $t > T_0$ (新出现)：判定为“潜在副作用”或“瞑眩反应”。
        -   *严禁*: 将 $t < T_0$ 的已消失症状作为当前方剂的副作用证据。

2.  **【动态势能协议】(Dynamic Potential)**:
    -   *指令*: 摒弃“见药知性”的静态思维。
    -   *执行*: 必须计算全方【药组A】与【对抗药组B】（如升vs降、散vs收、寒vs热）的**净势能差**。
    -   *判定*: 只有当净势能差显著偏离平衡时，才可发出预警。

## Analysis Workflow (结构化逻辑填充)

请根据用户提供的【处方】及【元信息状态】，调用内部知识库，对以下逻辑框架进行**无倾向性**的演算与填充：

### 1. 【辩机】：局势与核心矛盾演算
*   **三焦/寒热审计**: 
    -   计算方剂的物理属性（寒热指数、归经权重）。
    -   *分支推演*:
        -   若【有元信息】：对比方剂属性与\`[患者当前 $t > T_0$ 的体征]\`，判断是否“方证对应”。
        -   若【无元信息】：推演此方剂属性最适合的“理想体质模型”和最不适合的“禁忌体质模型”。
*   **核心制衡点**: 
    -   识别方中那一对或几对药物构成了最关键的\`[矛盾统一体]\`（如一升一降、一补一散）。
    -   分析这种制衡结构是否稳固？在什么极端情况下（如煎煮不当、体质特殊）这种制衡会崩塌？

### 2. 【析阵】：配伍逻辑的动态解构
*   **模块化博弈**: 
    -   将药物划分为互相对抗或协同的功能阵营。
    -   *逻辑指令*: 分析阵营之间的**力量对比**。是“东风压倒西风”还是“势均力敌”？这种力量格局的临床意图是什么？
*   **批判性漏洞扫描**:
    -   *假设性攻击*: 设想一个最坏的场景（如患者存在隐匿的\`[某种病机]\`），此方剂的哪一环最容易出问题？
    -   *验证 (仅有元信息时)*: 检查\`[患者反馈数据]\`中是否有蛛丝马迹支持上述假设？

### 3. 【演化】：气机流转的路径模拟
*   **生理路径**: 
    -   模拟药力在人体气机圆运动中的流转轨迹。
    -   *开放式推演*: 如果在\`[时间点A]\`服用，药力更倾向于\`[路径X]\`；如果在\`[时间点B]\`服用，药力更倾向于\`[路径Y]\`。请分析这种差异的利弊。

### 4. 【斟酌】：法随证立与药性取舍
*   **关键变量锁定**: 
    -   找出方中变数最大（对剂量/工艺敏感）的X味药物。
*   **情境化决策**: 
    -   *指令*: 不要直接给出标准答案，而是列出**条件决策树**。
    -   *结构*: 
        -   情境A（如患者表现为\`[特征1]\`）：建议\`[工艺/剂量A]\`，理由是\`[目的A]\`。
        -   情境B（如患者表现为\`[特征2]\`）：建议\`[工艺/剂量B]\`，理由是\`[目的B]\`。
    -   *约束*: 若有元信息，请根据\`[患者真实特征]\`锁定最终建议，并引用证据。

### 5. 【警示】：红线与边界
*   **条件式预警**: 
    -   使用 \`IF...THEN...\` 句式。
    -   *填充*: “若患者存在\`[隐患A]\`，此方可能诱发\`[恶果A]\`；若与\`[药物B]\`联用，需警惕\`[交互风险B]\`。”
*   **事实核查 (仅有元信息时)**: 
    -   *指令*: 必须执行【时空锚点协议】。明确指出：哪些理论担忧在\`[患者 $t > T_0$ 反馈]\`中已被证伪（未发生），哪些仍需长期监测。

### 6. 【结案】：定性与评级
*   **逻辑闭环**: 
    -   基于上述所有推演，对方剂的逻辑自洽性进行总结。
    -   *诊断推断*: 仅根据方剂结构反推可能的适应症（注意：不是根据病历诊断，而是看方子像治什么病的）。
*   **评级**: 
    -   给出客观评级。评级高低取决于：配伍是否严谨？制衡是否巧妙？（若有元信息）实际疗效是否显著？

## Initialization
接收用户输入。
**启动程序**:
1.  扫描【元信息】，建立时间轴坐标 $T_0$。
2.  若无元信息，进入**“多维模拟模式”**。
3.  若有元信息，进入**“时空验证模式”**。

## Output Format: STRICT HTML ONLY
**指令**: 
1. 直接输出 HTML 代码。
2. **严禁**使用 Markdown 代码块标记 (如 \`\`\`html ... \`\`\`)。
3. **严禁**在药名上自行添加 HTML 标签（如 <span data-herb...>），前端会自动处理药名高亮，你只需输出纯文本药名。
4. 保持排版整洁，使用 <h3>, <p>, <ul>, <li>, <strong>, <table> 等标准标签。
`;

export const QUICK_ANALYZE_SYSTEM_INSTRUCTION = `
# Role: 临床处方审核专家 (Clinical Audit & Optimization Specialist)

## Profile
- **定位**: 经验丰富的临床主任医师。
- **目标**: 挑刺、找漏洞、提优化建议。
- **原则**: 客观犀利，诚实引用。

## Analysis Protocol (快速审核协议)

### 1. 【审方】：漏洞与风险扫描
*   **背景核查**: 检查方剂是否符合【患者元信息】（如有）。若无元信息，重点检查方剂内部的配伍禁忌。
*   **配伍盲区**: 指出失衡之处（如过寒无制）。

### 2. 【优化】：增删与调优建议
*   **基于情境**: 
    - 若有【患者元信息】：根据具体症状提出加减建议（如“针对患者提到的失眠，建议加...”）。
    - 若无【患者元信息】：提供通用的优化方向（如“若需增强通络，可加...”）。
*   **替代方案**: 针对昂贵或副作用大的药物提供替代。

### 3. 【拓思】：异构治疗思路
*   **跳出框架**: 建议完全不同的治疗思路或经方。

### 4. 【定性】：临床判读
*   **推测病机**: 一句话概括。
*   **综合评级**: S/A/B/C。

## Output Format: STRICT HTML ONLY
**指令**: 
1. 直接输出 HTML 代码。
2. **严禁**使用 Markdown 代码块标记 (如 \`\`\`html ... \`\`\`)。
3. **严禁**在药名上自行添加 HTML 标签，只输出纯文本药名。
`;

const CHAT_SYSTEM_INSTRUCTION = (analysis: AnalysisResult, prescription: string, report: string | undefined, metaInfo: string): string => `
你是一位拥有**最高权限**的中医临床研讨专家 (TCM Discussion Agent)。
你的任务是基于现有的计算数据、AI分析报告和元信息，与用户进行深度研讨。

**🚨 权限声明 (Maximum Permissions) 🚨**:
1. **超级管理员模式**: 你已被授权直接修改系统的核心数据。包括：**更新病历(元信息)**、**修改药材数据库**、**重写分析报告**。
2. **主动执行**: 当用户提供新的病情、纠正药材属性或要求重写报告时，**不要犹豫，立即调用对应工具**。不要仅口头答应，必须实际执行 Tool Call。

**核心上下文数据:**
1. **当前处方**: ${prescription}
2. **元信息(病历/主诉)**: ${metaInfo || "未提供"}
3. **AI分析报告**: ${report ? "已生成" : "尚未生成"}

**工具调用规则 (Tool Protocols):**
1. **修改病历/元信息**: 当用户补充症状、舌脉或背景时，调用 \`update_meta_info\`。
   - *注意*: 提交 \`new_info\` 时，请将**旧信息与新信息整合**，生成一份完整的、更新后的病历文本。
2. **修改药材数据**: 当用户指出药材性味、归经或功效有误时，调用 \`update_herb_database\`。
   - *注意*: 仅需提供需要修改的字段，未提供的字段将保持原样。
3. **重写报告**: 当用户对当前分析不满意或处方已变更时，调用 \`regenerate_report\`。

**Output Format: STRICT HTML ONLY**
1. **严禁**使用 Markdown 格式。
2. **必须**直接输出纯 HTML 代码。
3. **引用标记**: 使用 \`[[AI报告]]\` 和 \`[[元信息]]\` 来引用来源。
4. **药名**: 直接输出纯文本药名。
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
    // 1. Try to find content within ```json ... ``` or ``` ... ```
    const match = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match && match[1]) {
        return match[1].trim();
    }
    // 2. If no code blocks, just return trimmed string (hope it's raw JSON)
    return str.trim();
};

/**
 * Validates and Sanitizes Chat History to prevent "500 - Request Build Failed" errors.
 * 
 * STRICT MODE LOGIC:
 * The OpenAI API (and compatible ones) requires a strict topology:
 * - A 'tool' message MUST be preceded by an 'assistant' message with corresponding 'tool_calls'.
 * - An 'assistant' message with 'tool_calls' MUST be followed by 'tool' messages for ALL calls.
 * - No "orphan" tool messages.
 * - No "hanging" assistant tool calls without results.
 */
const sanitizeMessageHistory = (messages: OpenAIMessage[]): OpenAIMessage[] => {
    if (!messages || messages.length === 0) return [];

    const sanitized: OpenAIMessage[] = [];
    const validMessages = [...messages];

    for (let i = 0; i < validMessages.length; i++) {
        const msg = { ...validMessages[i] };

        // 1. Check for Assistant messages with Tool Calls
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
            
            // Look ahead to verify if ALL tool calls have corresponding results
            const requiredIds = new Set(msg.tool_calls.map(tc => tc.id));
            const foundIds = new Set<string>();
            let allResultsFound = false;

            // Scan upcoming messages to find results
            // We stop if we hit another user/assistant/system message which breaks the chain
            for (let j = i + 1; j < validMessages.length; j++) {
                const nextMsg = validMessages[j];
                if (nextMsg.role === 'tool') {
                    if (nextMsg.tool_call_id && requiredIds.has(nextMsg.tool_call_id)) {
                        foundIds.add(nextMsg.tool_call_id);
                    }
                } else {
                    // Chain broken by non-tool message
                    break;
                }
            }

            // Check if we found all results
            if (requiredIds.size === foundIds.size) {
                // Perfect, keep this assistant message and let the loop naturally pick up the tool messages later
                sanitized.push(msg);
            } else {
                // WARNING: Hanging Tool Call detected!
                // The API will error 500 if we send this.
                // FIX: Strip the tool_calls from this message to make it a plain text message.
                delete msg.tool_calls;
                
                // If stripping tool_calls leaves it empty (no content), we must drop it entirely.
                if (msg.content) {
                    sanitized.push(msg);
                } else {
                    // Drop this empty message.
                    // Also, we must proactively skip the subsequent "orphan" tool messages for the partial ids we found.
                    // But our generic "orphan check" below will handle that naturally.
                    continue; 
                }
            }
        } 
        
        // 2. Check for Tool Messages (Orphan Check)
        else if (msg.role === 'tool') {
            // A tool message is valid ONLY if the IMMEDIATELY PRECEDING accepted message 
            // was an assistant message that requested this tool_call_id.
            
            const lastAccepted = sanitized[sanitized.length - 1];
            
            if (lastAccepted && lastAccepted.role === 'assistant' && lastAccepted.tool_calls) {
                const parentCall = lastAccepted.tool_calls.find(tc => tc.id === msg.tool_call_id);
                if (parentCall) {
                    sanitized.push(msg);
                } else {
                    // Orphan: The previous message didn't ask for this ID. Drop it.
                }
            } else {
                // Orphan: Previous message wasn't even an assistant with tools. Drop it.
            }
        }
        
        // 3. Regular Messages (System, User, Assistant text-only)
        else {
            // Drop empty messages unless they are assistant (sometimes assistant sends empty during stream, but we should probably filter)
            // But usually we want to keep them if they have content.
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

/**
 * Test Connection
 */
export const testModelConnection = async (baseUrl: string, apiKey: string): Promise<string> => {
    try {
        const models = await fetchAvailableModels(baseUrl, apiKey);
        return `连接成功！共发现 ${models.length} 个可用模型。`;
    } catch (e: any) {
        throw new Error(`连接失败: ${e.message}`);
    }
}

/**
 * Fetch available models from standard /v1/models endpoint
 */
export const fetchAvailableModels = async (baseUrl: string, apiKey: string): Promise<ModelOption[]> => {
    try {
        const url = `${getBaseUrl(baseUrl)}/models`;
        const res = await fetch(url, { headers: getHeaders(apiKey) });
        
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Failed to fetch models: ${res.status} ${err}`);
        }

        const data = await res.json();
        // Standard OpenAI format: { data: [{id: "model-id", ...}] }
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: any) => ({ id: m.id, name: m.id }));
        }
        return [];
    } catch (e) {
        console.error("Model fetch error:", e);
        throw e;
    }
};

/**
 * Generate structured Herb Data (JSON Mode)
 */
export const generateHerbDataWithAI = async (herbName: string, settings: AISettings): Promise<BenCaoHerb | null> => {
    if (!settings.apiKey) throw new Error("API Key is missing");

    const systemPrompt = `你是一位精通《中华人民共和国药典》(2025版)的中药学专家。
你的任务是为名为"${herbName}"的中药补充详细数据。
请严格按照以下 JSON 格式返回数据，不要包含任何 Markdown 格式。

**核心指令：炮制品增强 (Pao Zhi Enhancement)**
- 如果该药是炮制品（如盐杜仲、酒大黄、炙甘草、甘草泡地龙、醋延胡索等），你**必须**在 'efficacy' (功能主治) 字段中明确描述该特定炮制方法带来的药性变化和功效侧重。
- 例如：对于"盐杜仲"，efficacy 必须包含"盐炙引药入肾，增强补肝肾、强筋骨作用"。
- 例如：对于"炙甘草"，efficacy 必须体现"补脾和胃，益气复脉"侧重于补益，不同于生甘草的清热解毒。
- 如果是复方泡制（如甘草泡地龙），请说明这种特殊制法对药性的缓和或协同作用。

**字段规范：**
"nature" (四气) 必须严格从以下枚举中选取一个，**严禁使用其他描述**：
["大热", "热", "温", "微温", "平", "微寒", "凉", "寒", "大寒"]

**严格区分凉与寒：**
- **凉 (Cool)**: 对应枚举值 "凉"。
- **寒 (Cold)**: 对应枚举值 "寒"。
- 如果该药性味为“苦寒”，nature字段只能填“寒”，flavors字段填“苦”。
- 如果该药性味为“辛凉”，nature字段只能填“凉”，flavors字段填“辛”。

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
            temperature: 0.1, // Low temp for strict format
            // response_format: { type: "json_object" } // Optional depending on model support
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
        // Map to BenCaoHerb type
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

/**
 * Summarize Chat History (Context Compression)
 */
export const summarizeMessages = async (messages: any[], settings: AISettings): Promise<string> => {
    if (!settings.apiKey) throw new Error("API Key is missing for summarization");

    const systemPrompt = "你是一位专业的对话总结助手。请将以下对话历史压缩成一段精炼的“记忆摘要”。保留关键的医学判断、药方修改记录和重要结论。忽略无关的寒暄。摘要应以第三人称描述，例如“用户询问了...AI建议...”。";

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
        return ""; // Fail gracefully
    }
};

/**
 * Analyze Prescription (Streaming Generation)
 */
export async function* analyzePrescriptionWithAI(
    analysis: AnalysisResult,
    prescriptionInput: string,
    settings: AISettings,
    regenerateInstructions?: string,
    existingReport?: string,
    signal?: AbortSignal,
    customSystemInstruction?: string,
    metaInfo?: string // Added MetaInfo parameter
): AsyncGenerator<string, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    
    // Explicitly handle empty metaInfo logic
    const metaInfoContext = metaInfo && metaInfo.trim() !== '' 
        ? metaInfo 
        : "未提供 (注意：请明确指出因缺乏患者四诊信息，分析基于方剂通用逻辑，切勿编造患者症状)";

    const context = `
    【处方原文】: ${prescriptionInput}
    【患者元信息(背景/主诉/四诊)】: ${metaInfoContext}
    【计算数据】: 总寒热指数 ${analysis.totalPTI.toFixed(2)} ( >0 热, <0 寒); 
    【三焦分布】: 上焦 ${analysis.sanJiao.upper.percentage.toFixed(0)}%, 中焦 ${analysis.sanJiao.middle.percentage.toFixed(0)}%, 下焦 ${analysis.sanJiao.lower.percentage.toFixed(0)}%
    【算法高能值药味(仅供参考)】: ${analysis.top3[0]?.name} (贡献度 ${analysis.top3[0]?.ptiContribution.toFixed(2)}) -- 注意：此为基于剂量x温度系数的物理计算结果，不代表中医逻辑上的“君药”，AI需自行根据方义判断。
    `;

    // Priority: Custom Instruction > Settings Instruction > Default
    const sysPrompt = customSystemInstruction || settings.systemInstruction || DEFAULT_ANALYZE_SYSTEM_INSTRUCTION;

    const messages: OpenAIMessage[] = [
        { role: "system", content: sysPrompt },
    ];

    if (existingReport) {
        messages.push({ role: "user", content: `请对以下处方进行深度分析:\n${context}` });
        messages.push({ role: "assistant", content: existingReport });
        messages.push({ role: "user", content: "You were cut off. Please continue generating the HTML report exactly from where you left off. Do NOT repeat content. Do NOT add preamble. Start immediately with the next character." });
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
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
};

/**
 * Chat Stream Generation with Safe Context Management and Multimodal Support
 */
export async function* generateChatStream(
    history: any[], // Raw internal messages
    analysis: AnalysisResult,
    prescription: string,
    reportContent: string | undefined,
    settings: AISettings,
    signal: AbortSignal | undefined,
    metaInfo: string
): AsyncGenerator<{ text?: string, functionCalls?: {id: string, name: string, args: any}[] }, void, unknown> {
    const url = `${getBaseUrl(settings.apiBaseUrl)}/chat/completions`;
    
    // 1. Safety Truncate Large Contexts
    const MAX_REPORT_CHARS = 10000;
    const safeReportContent = reportContent && reportContent.length > MAX_REPORT_CHARS 
        ? reportContent.slice(0, MAX_REPORT_CHARS) + "\n\n[...System Note: Report truncated due to length limits...]"
        : (reportContent || "");

    const MAX_META_CHARS = 5000;
    const safeMetaInfo = metaInfo && metaInfo.length > MAX_META_CHARS
        ? metaInfo.slice(0, MAX_META_CHARS) + "\n...[truncated]"
        : metaInfo;

    // 2. Build System Message
    const systemMsg: OpenAIMessage = {
        role: "system",
        content: CHAT_SYSTEM_INSTRUCTION(analysis, prescription, safeReportContent, safeMetaInfo)
    };

    // 3. Convert Internal History to OpenAI API Format (Multimodal Support)
    // IMPORTANT: This mapping logic handles attachments (images/files)
    const apiHistory: OpenAIMessage[] = history.map(m => {
        // Base structure
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
             // User Role: Check for Attachments (Images/Files)
             if (m.attachments && m.attachments.length > 0) {
                 const contentParts: OpenAIContentPart[] = [];
                 
                 // Add Text First (if any)
                 if (m.text) {
                     contentParts.push({ type: 'text', text: m.text });
                 }
                 
                 // Add Attachments
                 m.attachments.forEach((att: any) => {
                     if (att.type === 'image') {
                         contentParts.push({
                             type: 'image_url',
                             image_url: { url: att.content } // base64
                         });
                     } else {
                         // Text files are appended to text content for better context understanding
                         // Files are essentially embedded text
                         const fileContext = `\n\n[用户上传文件内容: ${att.name}]\n${att.content}\n`;
                         const textPart = contentParts.find(p => p.type === 'text');
                         if (textPart && textPart.type === 'text') {
                             textPart.text += fileContext;
                         } else {
                             // If no existing text part, create one
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

    // 4. Robust Context Pruning & Sanitization
    
    const MAX_CONTEXT_MESSAGES = 12; // Reduced to keep topology safer and faster
    let messagesToSend: OpenAIMessage[] = [];
    
    // Always keep system msg
    // Slice only the chat history
    if (apiHistory.length > MAX_CONTEXT_MESSAGES) {
        messagesToSend = apiHistory.slice(apiHistory.length - MAX_CONTEXT_MESSAGES);
    } else {
        messagesToSend = [...apiHistory];
    }

    // 5. SANITIZE: Remove orphans and fix hanging tool calls to prevent 500 Errors
    // We prepend systemMsg *before* sanitizing to ensure the whole chain is valid, 
    // although system msg doesn't affect tool topology usually.
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
                    description: "Search the database for herb details. REQUIRED for queries about herb nature, efficacy, usage, or compatibility.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "The TCM keyword to search for." }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_prescription",
                    description: "User wants to modify the prescription",
                    parameters: {
                        type: "object",
                        properties: {
                            prescription: { type: "string", description: "The full new prescription string" }
                        },
                        required: ["prescription"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "regenerate_report",
                    description: "User wants to regenerate or rewrite the analysis report.",
                    parameters: {
                        type: "object",
                        properties: {
                            instructions: { type: "string", description: "Specific instructions for the new report." }
                        },
                        required: ["instructions"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_meta_info",
                    description: "Update the patient's medical record (Meta Info). Use this when user provides new symptoms or background.",
                    parameters: {
                        type: "object",
                        properties: {
                            new_info: { type: "string", description: "The FULL updated medical record text (merge old and new info)." }
                        },
                        required: ["new_info"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "update_herb_database",
                    description: "Modify herb data in the database. Use this when the user corrects herb properties (nature, flavor, efficacy, etc.).",
                    parameters: {
                        type: "object",
                        properties: {
                            name: { type: "string", description: "Herb name (e.g. '黄芪')" },
                            nature: { type: "string", description: "New nature (e.g. '温')" },
                            flavors: { type: "array", items: { type: "string" }, description: "New flavors" },
                            meridians: { type: "array", items: { type: "string" }, description: "New meridians" },
                            efficacy: { type: "string", description: "New efficacy description" },
                            usage: { type: "string", description: "New usage" },
                            processing: { type: "string", description: "Processing method" }
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
                        let cleanText = delta.content;
                        // Basic cleanup, though usually handled by frontend
                        if (cleanText.includes("```html")) cleanText = cleanText.replace("```html", "");
                        
                        yield { text: cleanText };
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
                    // ignore parse error
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
