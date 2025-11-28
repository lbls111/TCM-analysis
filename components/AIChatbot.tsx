import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { generateChatStream, OpenAIMessage, OpenAIToolCall, summarizeMessages } from '../services/openaiService';
import { AnalysisResult, AISettings, ChatAttachment, CloudChatSession } from '../types';
import { searchHerbsForAI, FULL_HERB_LIST, registerDynamicHerb } from '../data/herbDatabase';
import { fetchCloudChatSessions, saveCloudChatSession, deleteCloudChatSession } from '../services/supabaseService';
import { MetaInfoModal } from './MetaInfoModal';
import { ChatMemoryModal } from './ChatMemoryModal';
import { TokenCapsule } from './TokenCapsule';
import { useLog } from '../contexts/LogContext';

// ==========================================
// 1. Types
// ==========================================
interface Message {
  role: 'user' | 'model' | 'tool' | 'system';
  text: string;
  isError?: boolean;
  toolCalls?: OpenAIToolCall[];
  toolCallId?: string;
  functionName?: string;
  attachments?: ChatAttachment[];
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  metaInfo?: string;
}

interface Props {
  analysis: AnalysisResult;
  prescriptionInput: string;
  reportContent?: string;
  onUpdatePrescription?: (newPrescription: string) => void;
  onRegenerateReport?: (instructions: string) => void;
  onHerbClick?: (herbName: string) => void;
  settings: AISettings;
  metaInfo: string;
  onUpdateMetaInfo: (info: string) => void;
}

const LS_CHAT_SESSIONS_KEY = "logicmaster_chat_sessions";

// ==========================================
// 2. Helper Components (Optimized)
// ==========================================

// --- Cloud Archive Modal ---
const CloudArchiveModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    sessions: CloudChatSession[],
    onLoad: (session: CloudChatSession) => void,
    onDelete: (id: string) => void,
    isLoading: boolean
}> = ({ isOpen, onClose, sessions, onLoad, onDelete, isLoading }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <span>☁️</span> 云端研讨存档
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                
                <div className="flex-1 overflow-y-auto max-h-[60vh] p-4 bg-white custom-scrollbar space-y-3">
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-400">正在同步...</div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">暂无云端存档</div>
                    ) : (
                        sessions.map(s => (
                            <div key={s.id} className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group relative">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-slate-700 line-clamp-1 pr-8">{s.title || "未命名研讨"}</h4>
                                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                        {new Date(s.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500 mb-3 line-clamp-1">
                                    {s.meta_info ? `包含病历: ${s.meta_info.slice(0, 20)}...` : '无元信息'}
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => onLoad(s)}
                                        className="flex-1 bg-indigo-50 text-indigo-600 text-xs font-bold py-1.5 rounded hover:bg-indigo-100 transition-colors"
                                    >
                                        加载此存档
                                    </button>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                                    className="absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors"
                                    title="删除"
                                >
                                    ✕
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

// --- File Uploader Helper ---
const FileUploadPreview: React.FC<{ 
  files: ChatAttachment[], 
  onRemove: (id: string) => void 
}> = ({ files, onRemove }) => {
    if (files.length === 0) return null;
    return (
        <div className="flex gap-2 p-3 overflow-x-auto border-t border-slate-200 bg-slate-100 rounded-t-xl mx-0">
            {files.map(f => (
                <div key={f.id} className="relative group shrink-0 w-24 h-24 rounded-lg border border-slate-300 overflow-hidden bg-white shadow-sm">
                    {f.type === 'image' ? (
                        <img src={f.content} alt={f.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-600 p-2 bg-slate-50">
                            <span className="text-2xl mb-1">📄</span>
                            <span className="truncate w-full text-center font-medium">{f.name}</span>
                        </div>
                    )}
                    <button 
                        onClick={() => onRemove(f.id)}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >✕</button>
                </div>
            ))}
        </div>
    );
};

// --- Message Item (MEMOIZED FOR PERFORMANCE) ---
interface MessageItemProps {
  message: Message;
  index: number;
  isLoading: boolean;
  isLast: boolean;
  onDelete: (index: number) => void;
  onRegenerate: (index: number) => void;
  onEdit: (index: number, newText: string, resend: boolean) => void;
  onHerbClick?: (herbName: string) => void;
  onCitationClick: (type: 'report' | 'meta') => void;
  herbRegex: RegExp | null;
}

const ActionButton: React.FC<{ icon: string, label: string, onClick: () => void, isDestructive?: boolean }> = ({ icon, label, onClick, isDestructive }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-all ${
      isDestructive 
        ? 'text-slate-400 hover:text-red-600 hover:bg-red-50 border-transparent hover:border-red-100' 
        : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 border-transparent hover:border-indigo-100'
    }`}
    title={label}
  >
    <span>{icon}</span>
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// Memoized ChatMessageItem to prevent re-renders of history
const ChatMessageItem = memo<MessageItemProps>(({ 
  message, 
  index, 
  isLoading, 
  isLast,
  onDelete, 
  onRegenerate, 
  onEdit,
  onHerbClick,
  onCitationClick,
  herbRegex
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    setEditValue(message.text);
  }, [message.text]);

  const handleCopy = () => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = message.text;
    const plainText = tempDiv.textContent || tempDiv.innerText || message.text;
    
    navigator.clipboard.writeText(plainText).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };

  const handleSaveEdit = () => {
    if (editValue.trim() !== message.text) {
      const shouldResend = message.role === 'user';
      onEdit(index, editValue, shouldResend);
    }
    setIsEditing(false);
  };
  
  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      
      const herbSpan = target.closest('[data-herb]');
      if (herbSpan) {
          const herbName = herbSpan.getAttribute('data-herb');
          if (herbName && onHerbClick) {
              onHerbClick(herbName);
              return;
          }
      }
      
      const citationSpan = target.closest('[data-citation]');
      if (citationSpan) {
          const type = citationSpan.getAttribute('data-citation') as 'report' | 'meta';
          if (type) {
              onCitationClick(type);
              return;
          }
      }
  };

  const processHtml = useMemo(() => {
      const html = message.text;
      if (!html) return '';
      let processed = html.replace(/```html/g, '').replace(/```/g, '');

      processed = processed
          .replace(/\[\[AI报告\]\]/g, '<span class="citation-link cursor-pointer inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-all select-none shadow-sm" data-citation="report">📑 AI报告</span>')
          .replace(/\[\[元信息\]\]/g, '<span class="citation-link cursor-pointer inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300 hover:bg-blue-200 transition-all select-none shadow-sm" data-citation="meta">🧠 元信息</span>');

      if (herbRegex) {
          const parts = processed.split(/(<[^>]+>)/g);
          processed = parts.map(part => {
              if (part.startsWith('<')) return part;
              return part.replace(herbRegex, (match) => 
                  `<span class="herb-link cursor-pointer inline-flex items-center gap-0.5 mx-0.5 px-1 py-0 rounded-sm text-indigo-700 font-bold border-b-2 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-500 transition-colors" data-herb="${match}">${match}</span>`
              );
          }).join('');
      }
      
      processed = processed.replace(/<table>/g, '<div class="overflow-x-auto my-4 border border-slate-300 rounded-lg shadow-sm"><table class="w-full text-sm border-collapse bg-white">');
      processed = processed.replace(/<\/table>/g, '</table></div>');
      processed = processed.replace(/<th>/g, '<th class="bg-slate-200 text-slate-900 font-bold px-4 py-2 text-left border-b border-slate-300 whitespace-nowrap">');
      processed = processed.replace(/<td>/g, '<td class="px-4 py-2 border-b border-slate-100 text-slate-800 align-top">');
      processed = processed.replace(/<ul>/g, '<ul class="list-disc pl-5 space-y-2 my-3 marker:text-slate-500 text-slate-800">');
      processed = processed.replace(/<ol>/g, '<ol class="list-decimal pl-5 space-y-2 my-3 marker:text-slate-600 text-slate-800">');
      processed = processed.replace(/<p>/g, '<p class="my-2 leading-relaxed text-slate-800">');
      processed = processed.replace(/<h3>/g, '<h3 class="text-lg font-bold text-slate-900 mt-6 mb-3 flex items-center gap-2 before:content-[\'\'] before:w-1 before:h-5 before:bg-indigo-600 before:rounded-full">');
      
      return processed;
  }, [message.text, herbRegex]);

  if (message.role === 'tool') return null;
  if (message.role === 'model' && !message.text && message.toolCalls && message.toolCalls.length > 0) return null;

  if (message.role === 'system') {
      return (
          <div className="flex items-center justify-center gap-4 my-6 opacity-80 select-none group relative">
               <div className="h-px bg-slate-300 flex-1"></div>
               <div className="flex items-center gap-2">
                   <span className="text-xs text-slate-500 font-bold uppercase tracking-wider bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                      {message.text.includes('摘要') ? '📜 历史记忆已压缩' : message.text.length > 30 ? 'System Notice' : message.text}
                   </span>
               </div>
               <div className="h-px bg-slate-300 flex-1"></div>
          </div>
      );
  }

  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} group mb-6 animate-in fade-in slide-in-from-bottom-2`}>
      <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-base font-bold shadow-md border overflow-hidden ${isUser ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-indigo-600 border-indigo-100 ring-2 ring-indigo-50/50'}`}>
        {isUser ? (
           <span className="text-xl">🧑‍⚕️</span>
        ) : (
           <span className="text-xl">🤖</span>
        )}
      </div>

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[90%] lg:max-w-[80%]`}>
        
        {message.attachments && message.attachments.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {message.attachments.map(att => (
                    <div key={att.id} className="relative rounded-lg overflow-hidden border border-slate-300 shadow-sm bg-white cursor-pointer hover:scale-[1.02] transition-transform" title={att.name}>
                        {att.type === 'image' ? (
                            <img src={att.content} alt={att.name} className="max-w-[200px] max-h-[200px] object-cover" />
                        ) : (
                            <div className="px-3 py-2 flex items-center gap-2 text-xs text-slate-800 bg-slate-100 h-full font-bold">
                                <span className="text-lg">📄</span>
                                <span className="max-w-[150px] truncate">{att.name}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}

        {isEditing ? (
          <div className="w-full min-w-[300px] bg-white border-2 border-indigo-500 rounded-2xl p-4 shadow-xl z-10">
            <textarea 
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full h-32 p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 resize-none font-mono text-slate-800"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-bold">取消</button>
              <button onClick={handleSaveEdit} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-md font-bold">保存修改</button>
            </div>
          </div>
        ) : (
          <div className={`relative px-5 py-4 rounded-2xl text-[16px] leading-7 shadow-sm border font-medium ${
            isUser 
              ? 'bg-[#4f46e5] text-white border-indigo-600 rounded-br-none shadow-indigo-200/50' 
              : 'bg-white text-slate-900 border-slate-200 rounded-bl-none shadow-slate-200/50'
          }`}>
             {message.isError ? (
               <div className="flex items-center gap-2 text-red-100 bg-red-900/40 p-3 rounded-lg border border-red-500/50">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                 <span className="font-mono text-sm break-all">{message.text}</span>
               </div>
             ) : (
                <div 
                    className={`prose prose-sm max-w-none ${isUser ? 'prose-invert text-white' : 'prose-slate text-slate-800'}`}
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{ __html: processHtml }}
                />
             )}
          </div>
        )}

        {!isEditing && !isLoading && (
          <div className={`flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isUser ? 'justify-end pr-1' : 'justify-start pl-1'}`}>
             <ActionButton icon="📋" label={copyStatus === 'copied' ? '已复制' : '复制'} onClick={handleCopy} />
             <ActionButton icon="✎" label="编辑" onClick={() => setIsEditing(true)} />
             <ActionButton icon="↻" label="重试" onClick={() => onRegenerate(index)} />
             <ActionButton icon="🗑️" label="删除" onClick={() => onDelete(index)} isDestructive />
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // Custom comparison for performance optimization
  // We only re-render if the message content, loading state (if it affects this msg), or index changes
  return (
    prev.message.text === next.message.text && 
    prev.message.role === next.message.role && 
    prev.message.isError === next.message.isError &&
    prev.isLoading === next.isLoading && 
    prev.index === next.index
  );
});

// ==========================================
// 3. System Prompt (REINFORCED FOR DATA PRESERVATION)
// ==========================================
const CHAT_SYSTEM_INSTRUCTION = (analysis: AnalysisResult, prescription: string, report: string | undefined, metaInfo: string): string => `
# SYSTEM ROLE: Medical Record Administrator & Clinical Logic Engine
# PERMISSIONS: ROOT (Read/Write)

## ⚠️ MEDICAL RECORD (META INFO) INTEGRITY PROTOCOL - ABSOLUTE PRIORITY
You are the guardian of the patient's medical history. The Meta Info contains critical, time-series data (e.g., Blood Pressure logs, Symptom Diaries).

**CURRENT META INFO:**
"""
${metaInfo || "(Empty)"}
"""

**YOUR DUTY (CRITICAL RULES):**
1.  **NO SUMMARIZATION of Data**: You are STRICTLY FORBIDDEN from summarizing data tables, logs, or dates.
    -   *Wrong*: "The patient had blood pressure fluctuations in November." (Deleting the table)
    -   *Right*: Keep the entire existing table and append the new row.
2.  **APPEND ONLY Strategy**: When updating the record:
    -   READ the old record completely.
    -   FIND the appropriate section (e.g., "Log", "History").
    -   **APPEND** the new information to that section.
    -   **KEEP ALL** old information exactly as is.
3.  **MERGE LOGIC**:
    -   If the user gives data for "Nov 27", find "Nov 27" in the text.
    -   If it exists, append the new detail to that line.
    -   If it does not exist, create a new line/entry for "Nov 27".
    -   **DO NOT WIPE** the rest of the document.

## ACTIVE TOOLBOX
1. \`update_meta_info\`: Call this to SAVE the medical record. **Argument \`new_info\` must be the FULL TEXT (Old Content + New Content).**
   - *WARNING*: If you pass only a summary, you destroy the patient's history. You must pass the **FULL, DETAILED** text.
2. \`lookup_herb\`: Search DB.
3. \`update_herb_database\`: Modify DB.
4. \`update_prescription\`: Modify prescription input.

## Context Data
- **Prescription**: ${prescription}
- **Analysis**: ${report ? "Report Available" : "Not Generated"}

## Response Style
- concise, professional, clinical HTML format.
`;

// ==========================================
// 4. Main Component
// ==========================================
export const AIChatbot: React.FC<Props> = ({ 
  analysis, 
  prescriptionInput, 
  reportContent, 
  onUpdatePrescription,
  onRegenerateReport,
  onHerbClick,
  settings,
  metaInfo,
  onUpdateMetaInfo
}) => {
  const { addLog } = useLog(); 

  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [viewingReference, setViewingReference] = useState<{type: 'report' | 'meta', content: string} | null>(null);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  // Pending Meta Update State (The Bubble)
  const [pendingMetaUpdate, setPendingMetaUpdate] = useState<string | null>(null);

  // Cloud Sync & Archive
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCloudArchive, setShowCloudArchive] = useState(false);
  const [cloudArchiveSessions, setCloudArchiveSessions] = useState<CloudChatSession[]>([]);
  const [isCloudArchiveLoading, setIsCloudArchiveLoading] = useState(false);
  
  // Mobile UI
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  
  // File Upload State
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);
  
  // Ref to track latest meta info for async chat loop
  const metaInfoRef = useRef(metaInfo);

  useEffect(() => {
    metaInfoRef.current = metaInfo;
  }, [metaInfo]);

  const herbRegex = useMemo(() => {
      const names = FULL_HERB_LIST.map(h => h.name).sort((a, b) => b.length - a.length);
      if (names.length === 0) return null;
      const validNames = names.filter(n => n.length >= 1); 
      const escaped = validNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp(`(${escaped.join('|')})`, 'g');
  }, [FULL_HERB_LIST.length]);

  const estimateTokens = (msgs: Message[]) => {
     let totalChars = 0;
     msgs.forEach(m => {
         totalChars += m.text.length;
         if (m.toolCalls) totalChars += JSON.stringify(m.toolCalls).length;
     });
     return Math.round(totalChars * 0.8) + 100;
  };

  const saveCurrentSessionToCloud = async (sessionId: string, explicitMetaInfo?: string) => {
      if (!settings.supabaseKey || !sessionId) return;
      const session = sessions[sessionId];
      if (!session) return;
      
      setIsSyncing(true);
      try {
          await saveCloudChatSession({
              id: session.id,
              title: session.title,
              messages: session.messages,
              meta_info: explicitMetaInfo || session.metaInfo || metaInfoRef.current,
              created_at: session.createdAt
          }, settings);
          addLog('success', 'Chat', 'Session synced to cloud', { sessionId });
      } catch (e: any) {
          addLog('error', 'Chat', 'Session sync failed', { error: e.message });
          console.error("Auto-sync failed:", e);
      } finally {
          setIsSyncing(false);
      }
  };

  // ... (Session Initialization UseEffects remain same, skipping for brevity but logic is preserved) ...
  useEffect(() => {
    const init = async () => {
        let loadedFromCloud = false;
        if (settings.supabaseKey) {
            const cloudSessions = await fetchCloudChatSessions(settings);
            if (cloudSessions.length > 0) {
                const sessionMap: Record<string, Session> = {};
                cloudSessions.forEach(cs => {
                    sessionMap[cs.id] = {
                        id: cs.id,
                        title: cs.title,
                        messages: cs.messages,
                        createdAt: cs.created_at,
                        metaInfo: cs.meta_info
                    };
                });
                setSessions(sessionMap);
                const firstSession = cloudSessions[0];
                setActiveSessionId(firstSession.id);
                if (firstSession.meta_info) {
                    onUpdateMetaInfo(firstSession.meta_info);
                }
                loadedFromCloud = true;
                addLog('info', 'Chat', `Loaded ${cloudSessions.length} sessions from cloud`);
            }
        }

        if (!loadedFromCloud) {
            try {
                const saved = localStorage.getItem(LS_CHAT_SESSIONS_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setSessions(parsed);
                    const lastActive = localStorage.getItem('logicmaster_last_active_session');
                    if (lastActive && parsed[lastActive]) {
                        setActiveSessionId(lastActive);
                        if (parsed[lastActive].metaInfo) {
                            onUpdateMetaInfo(parsed[lastActive].metaInfo);
                        }
                    } else {
                        const ids = Object.keys(parsed).sort((a, b) => parsed[b].createdAt - parsed[a].createdAt);
                        if (ids.length > 0) {
                            setActiveSessionId(ids[0]);
                            if (parsed[ids[0]].metaInfo) {
                                onUpdateMetaInfo(parsed[ids[0]].metaInfo);
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        
        setSessions(current => {
            if (Object.keys(current).length === 0) {
                 const newId = `session_${Date.now()}`;
                 const newSession: Session = {
                    id: newId,
                    title: "新的研讨",
                    createdAt: Date.now(),
                    messages: [{ role: 'model', text: '我是您的 AI 中医助手。我可以帮您分析处方，或查阅药典数据。请问您想了解什么？' }],
                    metaInfo: ''
                 };
                 setActiveSessionId(newId);
                 onUpdateMetaInfo('');
                 return { [newId]: newSession };
            }
            return current;
        });
    };
    init();
  }, [settings.supabaseKey]);

  useEffect(() => {
    if (Object.keys(sessions).length > 0) {
      localStorage.setItem(LS_CHAT_SESSIONS_KEY, JSON.stringify(sessions));
    }
    if (activeSessionId) {
      localStorage.setItem('logicmaster_last_active_session', activeSessionId);
      const msgs = sessions[activeSessionId]?.messages || [];
      setTokenCount(estimateTokens(msgs));
    }
  }, [sessions, activeSessionId]);

  useEffect(() => {
      if (!isLoading && activeSessionId && sessions[activeSessionId]) {
          saveCurrentSessionToCloud(activeSessionId);
      }
  }, [isLoading]); 

  useEffect(() => {
    const currentMsgs = activeSessionId ? sessions[activeSessionId]?.messages || [] : [];
    if (messageCountRef.current !== currentMsgs.length) {
        scrollToBottom();
        messageCountRef.current = currentMsgs.length;
    }
  }, [sessions, activeSessionId]); 

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);
  
  useEffect(() => {
      if (showCloudArchive && settings.supabaseKey) {
          loadCloudArchive();
      }
  }, [showCloudArchive]);

  // ... (Cloud handlers: loadCloudArchive, handleLoadCloudSession, handleDeleteCloudSession same as before) ...
  const loadCloudArchive = async () => {
      setIsCloudArchiveLoading(true);
      try {
          const data = await fetchCloudChatSessions(settings);
          setCloudArchiveSessions(data);
      } catch (e) {
          console.error(e);
      } finally {
          setIsCloudArchiveLoading(false);
      }
  };

  const handleLoadCloudSession = (cloudSession: CloudChatSession) => {
      const newSession: Session = {
          id: cloudSession.id,
          title: cloudSession.title,
          messages: cloudSession.messages,
          createdAt: cloudSession.created_at,
          metaInfo: cloudSession.meta_info
      };
      setSessions(prev => ({
          ...prev,
          [newSession.id]: newSession
      }));
      setActiveSessionId(newSession.id);
      if (cloudSession.meta_info) {
          onUpdateMetaInfo(cloudSession.meta_info);
      }
      setShowCloudArchive(false);
      addLog('info', 'Chat', 'Loaded cloud session', { id: newSession.id });
  };

  const handleDeleteCloudSession = async (id: string) => {
      if (!window.confirm("确定要删除此云端存档吗？")) return;
      
      const success = await deleteCloudChatSession(id, settings);
      if (success) {
          setCloudArchiveSessions(prev => prev.filter(s => s.id !== id));
          if (sessions[id]) {
              const newSessions = {...sessions};
              delete newSessions[id];
              setSessions(newSessions);
              if (activeSessionId === id) {
                  const keys = Object.keys(newSessions).sort((a,b) => newSessions[b].createdAt - newSessions[a].createdAt);
                  if (keys.length > 0) {
                      const nextId = keys[0];
                      setActiveSessionId(nextId);
                      if (newSessions[nextId].metaInfo) {
                          onUpdateMetaInfo(newSessions[nextId].metaInfo || '');
                      }
                  } else {
                      setActiveSessionId(null);
                      onUpdateMetaInfo('');
                  }
              }
          }
          addLog('success', 'Chat', 'Cloud session deleted');
      } else {
          alert("删除失败，请检查网络或权限。");
      }
  };

  const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
      if (!messagesContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
      setShowScrollButton(!isNearBottom);
  };

  // ... (File handling logic same as before) ...
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const files = e.target.files;
          const newAttachments: ChatAttachment[] = [];
          
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const reader = new FileReader();
              const isImage = file.type.startsWith('image/');
              
              const result = await new Promise<string>((resolve) => {
                  if (isImage) {
                      reader.readAsDataURL(file);
                  } else {
                      reader.readAsText(file); 
                  }
                  reader.onload = () => resolve(reader.result as string);
              });

              newAttachments.push({
                  id: `file-${Date.now()}-${Math.random()}`,
                  type: isImage ? 'image' : 'file',
                  name: file.name,
                  content: result,
                  mimeType: file.type
              });
          }
          
          setAttachments(prev => [...prev, ...newAttachments]);
          addLog('info', 'Chat', `Files attached: ${files.length}`);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      const newAttachments: ChatAttachment[] = [];
      let hasImage = false;
      
      for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
              hasImage = true;
              break;
          }
      }

      if (hasImage) {
          e.preventDefault();
          for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.type.indexOf('image') !== -1) {
                  const file = item.getAsFile();
                  if (file) {
                      const reader = new FileReader();
                      const result = await new Promise<string>((resolve) => {
                          reader.readAsDataURL(file);
                          reader.onload = () => resolve(reader.result as string);
                      });
                      
                      newAttachments.push({
                          id: `paste-${Date.now()}-${Math.random()}`,
                          type: 'image',
                          name: file.name || `pasted-image-${Date.now()}.png`,
                          content: result,
                          mimeType: file.type
                      });
                  }
              }
          }
          if (newAttachments.length > 0) {
              setAttachments(prev => [...prev, ...newAttachments]);
              addLog('info', 'Chat', `Images pasted: ${newAttachments.length}`);
          }
      }
  };

  const removeAttachment = (id: string) => {
      setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const createNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: Session = {
      id: newId,
      title: "新的研讨",
      createdAt: Date.now(),
      messages: [{ role: 'model', text: '我是您的 AI 中医助手。我可以帮您分析处方，或查阅药典数据。请问您想了解什么？' }],
      metaInfo: ''
    };
    setSessions(prev => ({ ...prev, [newId]: newSession }));
    setActiveSessionId(newId);
    onUpdateMetaInfo('');
    setShowMobileSidebar(false);
    addLog('info', 'Chat', `Created new session: ${newId}`);
    return newId;
  };
  
  const handleSwitchSession = (sessionId: string) => {
      setActiveSessionId(sessionId);
      setShowMobileSidebar(false);
      const sess = sessions[sessionId];
      if (sess) {
          onUpdateMetaInfo(sess.metaInfo || '');
      }
  };

  const handleMetaInfoSave = async (newInfo: string) => {
      onUpdateMetaInfo(newInfo);
      metaInfoRef.current = newInfo;
      setPendingMetaUpdate(null);

      if (!activeSessionId) return;

      setSessions(prev => {
          const updated = {
              ...prev,
              [activeSessionId]: {
                  ...prev[activeSessionId],
                  metaInfo: newInfo
              }
          };
          return updated;
      });

      if (settings.supabaseKey) {
          await saveCurrentSessionToCloud(activeSessionId, newInfo);
      }
      addLog('success', 'Chat', 'Meta info saved successfully');
  };

  const handleConfirmMetaUpdate = () => {
      if (pendingMetaUpdate) {
          setShowMetaModal(true);
      }
  };

  // ... (deleteSession, handleCompressMemory same as before) ...
  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("确定要删除此会话吗？")) return;
      
      const newSessions = { ...sessions };
      delete newSessions[sessionId];
      setSessions(newSessions);
      
      if (settings.supabaseKey) {
          addLog('action', 'Chat', 'Deleting session from cloud', { sessionId });
          const success = await deleteCloudChatSession(sessionId, settings);
          if (success) addLog('success', 'Chat', 'Cloud session deleted');
          else addLog('error', 'Chat', 'Cloud delete failed');
      }

      if (activeSessionId === sessionId) {
          const remainingIds = Object.keys(newSessions).sort((a,b) => newSessions[b].createdAt - newSessions[a].createdAt);
          if (remainingIds.length > 0) {
              const nextId = remainingIds[0];
              setActiveSessionId(nextId);
              if (newSessions[nextId].metaInfo) {
                  onUpdateMetaInfo(newSessions[nextId].metaInfo || '');
              }
          } else {
              setActiveSessionId(null);
              onUpdateMetaInfo('');
          }
      }
  };

  const handleCompressMemory = async (keepCount: number) => {
      if (!activeSessionId) return;
      
      const currentMsgs = sessions[activeSessionId].messages;
      if (currentMsgs.length <= keepCount) return;

      setIsCompressing(true);
      addLog('info', 'Memory', 'Compressing chat history', { keepCount });
      
      try {
          const splitIndex = currentMsgs.length - keepCount;
          const toSummarize = currentMsgs.slice(0, splitIndex);
          const toKeep = currentMsgs.slice(splitIndex);

          const apiMsgs = toSummarize.map(m => ({
              role: m.role === 'model' ? 'assistant' : (m.role === 'tool' ? 'tool' : (m.role === 'system' ? 'system' : 'user')),
              content: m.text
          }));

          const summary = await summarizeMessages(apiMsgs, settings);
          
          if (summary) {
              const summaryMsg: Message = {
                  role: 'system',
                  text: summary
              };
              
              setSessions(prev => ({
                  ...prev,
                  [activeSessionId]: {
                      ...prev[activeSessionId],
                      messages: [summaryMsg, ...toKeep]
                  }
              }));
              
              addLog('success', 'Memory', 'History compressed successfully');
              saveCurrentSessionToCloud(activeSessionId);
          }
      } catch (e: any) {
          addLog('error', 'Memory', 'Compression failed', { error: e.message });
          console.error("Compression Error:", e);
      } finally {
          setIsCompressing(false);
      }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    
    let targetSessionId = activeSessionId;
    if (!targetSessionId) targetSessionId = createNewSession();

    const currentInput = input;
    const currentAttachments = [...attachments];
    
    addLog('action', 'Chat', 'Sending user message', { length: currentInput.length, attachments: currentAttachments.length });

    const userMsg: Message = { 
        role: 'user', 
        text: currentInput,
        attachments: currentAttachments 
    };

    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    setSessions(prev => {
        const sess = { ...prev[targetSessionId!] };
        sess.messages = [...sess.messages, userMsg];
        if (sess.messages.length <= 2 && currentInput) {
            sess.title = currentInput.slice(0, 20) + (currentInput.length > 20 ? '...' : '');
        }
        return { ...prev, [targetSessionId!]: sess };
    });

    const currentHistory = [...sessions[targetSessionId!].messages, userMsg];
    await runGeneration(targetSessionId!, currentHistory);
  };
  
  // ... (handleRegenerate, handleEditMessage, handleDeleteMessage, handleManualSync same as before) ...
  const handleRegenerate = async (index: number) => {
     if (!activeSessionId || isLoading) return;
     addLog('action', 'Chat', 'Regenerating message', { index });
     const currentMessages = sessions[activeSessionId].messages;
     const targetMsg = currentMessages[index];
     
     let newHistory: Message[] = [];
     if (targetMsg.role === 'user') {
         newHistory = currentMessages.slice(0, index + 1);
     } else {
         newHistory = currentMessages.slice(0, index);
     }

     setSessions(prev => ({
         ...prev,
         [activeSessionId]: { ...prev[activeSessionId], messages: newHistory }
     }));

     await runGeneration(activeSessionId, newHistory);
  };
  
  const handleEditMessage = (index: number, newText: string, shouldResend: boolean) => {
    if (!activeSessionId) return;
    addLog('action', 'Chat', 'Edited message', { index, resend: shouldResend });
    
    const currentMsgs = sessions[activeSessionId].messages;
    const updatedMsgs = [...currentMsgs];
    updatedMsgs[index] = { ...updatedMsgs[index], text: newText };
    
    setSessions(prev => ({
       ...prev,
       [activeSessionId]: { ...prev[activeSessionId], messages: updatedMsgs }
    }));
    
    if (shouldResend) {
        const truncatedHistory = updatedMsgs.slice(0, index + 1);
        setSessions(prev => ({
             ...prev,
             [activeSessionId]: { ...prev[activeSessionId], messages: truncatedHistory }
        }));
        runGeneration(activeSessionId, truncatedHistory);
    } else {
        saveCurrentSessionToCloud(activeSessionId);
    }
  };
  
  const handleDeleteMessage = (index: number) => {
    if (!activeSessionId) return;
    addLog('action', 'Chat', 'Deleted message', { index });
    setSessions(prev => {
      const sess = { ...prev[activeSessionId] };
      sess.messages = sess.messages.filter((_, i) => i !== index);
      return { ...prev, [activeSessionId]: sess };
    });
    saveCurrentSessionToCloud(activeSessionId);
  };

  const handleManualSync = () => {
      if (activeSessionId) {
          saveCurrentSessionToCloud(activeSessionId);
      }
  };

  // === GENERATION LOGIC (OPTIMIZED FOR STREAMING & META UPDATE) ===
  const runGeneration = async (sessionId: string, history: Message[], currentMetaInfo?: string) => {
      setIsLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const metaToUse = currentMetaInfo ?? metaInfoRef.current;
      const chatSystemPrompt = CHAT_SYSTEM_INSTRUCTION(analysis, prescriptionInput, reportContent, metaToUse);

      setSessions(prev => {
          const sess = { ...prev[sessionId] };
          sess.messages = [...sess.messages, { role: 'model', text: '' }];
          return { ...prev, [sessionId]: sess };
      });

      try {
          const stream = generateChatStream(
              history, 
              analysis, 
              prescriptionInput, 
              reportContent, 
              settings, 
              controller.signal,
              metaToUse,
              chatSystemPrompt
          );

          let fullText = '';
          let toolCallsResult: {id: string, name: string, args: any}[] = [];
          
          for await (const chunk of stream) {
              if (chunk.text) {
                  // FIX: Ensure we don't duplicate text if chunk contains overlapping parts (rare but safe to append)
                  fullText += chunk.text;
                  setSessions(prev => {
                      const sess = { ...prev[sessionId] };
                      const lastIdx = sess.messages.length - 1;
                      if (lastIdx >= 0) {
                          // DIRECT UPDATE for streaming responsiveness
                          sess.messages[lastIdx] = { ...sess.messages[lastIdx], text: fullText };
                      }
                      return { ...prev, [sessionId]: sess };
                  });
              }
              if (chunk.functionCalls) {
                  toolCallsResult = chunk.functionCalls;
              }
          }

          if (toolCallsResult.length > 0) {
              setIsToolExecuting(true);
              addLog('info', 'Chat', 'Executing tool calls', { count: toolCallsResult.length });
              
              const assistantToolCalls: OpenAIToolCall[] = toolCallsResult.map(tc => ({
                  id: tc.id,
                  type: 'function',
                  function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.args)
                  }
              }));

              const assistantMsg: Message = {
                  role: 'model',
                  text: fullText, // Persist any text generated before tool call
                  toolCalls: assistantToolCalls
              };

              setSessions(prev => {
                  const sess = { ...prev[sessionId] };
                  sess.messages[sess.messages.length - 1] = assistantMsg;
                  return { ...prev, [sessionId]: sess };
              });
              
              const nextHistory = [...history, assistantMsg];

              let updatedMetaInfoForRecursion = metaToUse;

              for (const tool of toolCallsResult) {
                  let result = "";
                  addLog('action', 'Tool', `Invoking: ${tool.name}`, tool.args);
                  
                  if (tool.name === 'lookup_herb') {
                      result = searchHerbsForAI(tool.args.query);
                  } 
                  else if (tool.name === 'update_prescription') {
                      onUpdatePrescription?.(tool.args.prescription);
                      result = "Prescription updated successfully in frontend.";
                  } 
                  else if (tool.name === 'regenerate_report') {
                      onRegenerateReport?.(tool.args.instructions);
                      result = "Report regeneration triggered.";
                  } 
                  else if (tool.name === 'update_meta_info') {
                      if (tool.args.new_info) {
                          // VISUAL ALERT TRIGGER
                          setPendingMetaUpdate(tool.args.new_info);
                          result = "Update Pending User Approval. I have triggered the UI alert (Bouncing Red Button). The user must click the flashing button to review and merge the data.";
                      } else {
                          result = "Failed to update meta info: content was empty.";
                      }
                  } 
                  else if (tool.name === 'update_herb_database') {
                       const { name, ...updates } = tool.args;
                       let existing = FULL_HERB_LIST.find(h => h.name === name);
                       const newHerbData = {
                            ...(existing || {
                                id: `manual-${Date.now()}`,
                                name: name,
                                nature: '平',
                                flavors: [],
                                meridians: [],
                                efficacy: '暂无',
                                category: '药材',
                                processing: '生用',
                                isRaw: false
                            }),
                            ...updates
                       };
                       await registerDynamicHerb(newHerbData, true);
                       result = `Herb '${name}' updated.`;
                  }
                  else {
                      result = "Unknown tool.";
                  }

                  const toolMsg: Message = {
                      role: 'tool',
                      toolCallId: tool.id,
                      functionName: tool.name,
                      text: result
                  };

                  nextHistory.push(toolMsg);
                  setSessions(prev => {
                      const sess = { ...prev[sessionId] };
                      sess.messages.push(toolMsg);
                      return { ...prev, [sessionId]: sess };
                  });
              }
              
              // Recursive call
              await runGeneration(sessionId, nextHistory, updatedMetaInfoForRecursion);
          } else {
              setIsToolExecuting(false);
          }

      } catch (e: any) {
          setIsToolExecuting(false);
          if (e.name !== 'AbortError') {
              console.error('Generation failed:', e);
              addLog('error', 'Chat', 'Generation exception', { error: e.message });
              setSessions(prev => {
                  const sess = { ...prev[sessionId] };
                  const lastIdx = sess.messages.length - 1;
                  const currentText = sess.messages[lastIdx].text;
                  sess.messages[lastIdx] = { 
                      ...sess.messages[lastIdx], 
                      text: currentText + `\n\n[系统错误: ${e.message}]`,
                      isError: true
                  };
                  return { ...prev, [sessionId]: sess };
              });
          }
      } finally {
          setIsLoading(false);
          abortControllerRef.current = null;
      }
  };

  const activeMessages = activeSessionId ? sessions[activeSessionId]?.messages || [] : [];
  
  // Reusable Session List Component
  const SessionList = () => (
     <div className="flex flex-col h-full">
         <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
           <button 
             onClick={() => createNewSession()}
             className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-slate-300 transition-all flex items-center justify-center gap-2 transform active:scale-[0.98]"
           >
             <span className="text-xl">+</span> 新的研讨
           </button>
           <div className="flex gap-2">
                {settings.supabaseKey && (
                    <button 
                        onClick={handleManualSync}
                        disabled={isSyncing || !activeSessionId}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                            isSyncing 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-white text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-200'
                        }`}
                        title="立即同步当前会话"
                    >
                        {isSyncing ? <span className="animate-spin">⏳</span> : <span>☁️</span>}
                        {isSyncing ? '备份中' : '同步'}
                    </button>
                )}
                <button 
                    onClick={() => { setShowCloudArchive(true); setShowMobileSidebar(false); }}
                    className="flex-1 py-2 rounded-lg border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 text-xs font-bold transition-all flex items-center justify-center gap-1"
                    title="查看云端所有历史存档"
                >
                    <span>📂</span> 历史存档
                </button>
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
           {(Object.values(sessions) as Session[])
             .sort((a, b) => b.createdAt - a.createdAt)
             .map((session) => (
               <div 
                 key={session.id}
                 onClick={() => handleSwitchSession(session.id)}
                 className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border ${
                   activeSessionId === session.id 
                     ? 'bg-white border-indigo-200 shadow-md ring-1 ring-indigo-50 text-slate-900' 
                     : 'hover:bg-white/80 border-transparent hover:border-slate-200 text-slate-500 hover:text-slate-700'
                 }`}
               >
                 <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <span className={`text-xl ${activeSessionId === session.id ? 'grayscale-0' : 'grayscale opacity-50'}`}>
                      💬
                    </span>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold truncate">
                        {session.title}
                        </span>
                        <span className="text-[10px] opacity-60 font-medium flex items-center gap-1">
                            {new Date(session.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            {session.metaInfo && <span className="text-amber-500">●</span>}
                        </span>
                    </div>
                 </div>
                 
                 {/* Delete Button */}
                 <button 
                     onClick={(e) => deleteSession(session.id, e)}
                     className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                     title="删除会话"
                 >
                     ✕
                 </button>
               </div>
             ))}
        </div>
     </div>
  );

  return (
    <div className="flex h-full w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 relative">
      
      {/* Modals */}
      <MetaInfoModal 
         isOpen={showMetaModal}
         onClose={() => setShowMetaModal(false)}
         metaInfo={pendingMetaUpdate || metaInfo} // Prioritize pending update for review
         originalMetaInfo={pendingMetaUpdate ? metaInfo : undefined} 
         onSave={handleMetaInfoSave}
         isAiSuggestion={!!pendingMetaUpdate}
      />
      <ChatMemoryModal 
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        tokenCount={tokenCount}
        messageCount={activeMessages.length}
        onCompress={handleCompressMemory}
        isCompressing={isCompressing}
      />
      <CloudArchiveModal 
          isOpen={showCloudArchive}
          onClose={() => setShowCloudArchive(false)}
          sessions={cloudArchiveSessions}
          onLoad={handleLoadCloudSession}
          onDelete={handleDeleteCloudSession}
          isLoading={isCloudArchiveLoading}
      />

      {/* Viewing Reference Modal */}
      {viewingReference && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingReference(null)}></div>
              <div className="relative bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          {viewingReference.type === 'report' ? '📑 AI分析报告原文' : '🧠 研讨元信息上下文'}
                      </h3>
                      <button onClick={() => setViewingReference(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
                     {viewingReference.type === 'report' ? (
                         <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{__html: viewingReference.content}}></div>
                     ) : (
                         <div className="whitespace-pre-wrap text-slate-800 leading-loose text-lg font-serif-sc">{viewingReference.content}</div>
                     )}
                  </div>
              </div>
          </div>
      )}
      
      {/* Mobile Sidebar (Drawer) */}
      {showMobileSidebar && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileSidebar(false)}></div>
            <div className="relative w-4/5 max-w-xs bg-slate-50 h-full shadow-2xl animate-in slide-in-from-left">
                <SessionList />
            </div>
          </div>
      )}

      {/* Sidebar (Desktop) */}
      <div className="w-80 bg-[#f8fafc] border-r border-slate-200 hidden md:flex flex-col flex-shrink-0">
          <SessionList />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-white h-full overflow-hidden w-full min-w-0">
        {/* Header */}
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 bg-white/95 backdrop-blur z-20 shadow-sm shrink-0">
           <div className="flex items-center gap-3">
             <button className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg" onClick={() => setShowMobileSidebar(true)}>
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
             </button>
             <div className="md:hidden">
                 <span className="text-2xl">💬</span>
             </div>
             <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                智能研讨
                </h3>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-block">
                    {settings.model || settings.chatModel || 'Default Model'}
                </span>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
               {/* META INFO BUTTON - AGGRESSIVE NOTIFICATION STYLE */}
               <button 
                 onClick={() => setShowMetaModal(true)}
                 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all duration-300 ${
                     pendingMetaUpdate 
                     ? 'bg-red-500 text-white border-red-600 shadow-lg shadow-red-200 animate-bounce ring-4 ring-red-200' 
                     : metaInfo 
                        ? 'bg-amber-100 text-amber-900 border-amber-200 shadow-sm' 
                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-amber-50 hover:text-amber-700'
                 }`}
               >
                   <span className={pendingMetaUpdate ? 'animate-ping absolute inline-flex h-3 w-3 rounded-full bg-white opacity-75' : 'hidden'}></span>
                   <span>{pendingMetaUpdate ? '⚠️' : '🧠'}</span> 
                   <span className="hidden sm:inline">
                       {pendingMetaUpdate ? '新病历待审核!' : (metaInfo ? '已设元信息' : '设置元信息')}
                   </span>
               </button>

               <button 
                 onClick={() => setShowMemoryModal(true)}
                 className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
               >
                   <span>🗜️</span> <span className="hidden sm:inline">记忆</span>
               </button>
           </div>
        </div>

        {/* Messages List - Main Scroll Area */}
        <div 
            className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth custom-scrollbar relative bg-[#fafafa]" 
            ref={messagesContainerRef}
            onScroll={handleScroll}
        >
           {activeMessages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6">
                <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center text-5xl shadow-xl border border-slate-100">🤖</div>
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-700 mb-2">欢迎使用 LogicMaster AI</h3>
                    <p className="text-sm max-w-xs mx-auto text-slate-500">
                        您可以上传病历图片、文档，或直接输入问题开始研讨。
                        <br/>
                        <span className="text-xs opacity-60 mt-2 block">支持多模态识图与文件解析</span>
                    </p>
                </div>
             </div>
           ) : (
             activeMessages.map((msg, i) => (
               <ChatMessageItem 
                 key={i} 
                 index={i} 
                 message={msg} 
                 isLoading={isLoading}
                 isLast={i === activeMessages.length - 1}
                 onDelete={handleDeleteMessage}
                 onRegenerate={handleRegenerate}
                 onEdit={handleEditMessage}
                 onHerbClick={onHerbClick}
                 onCitationClick={(type) => setViewingReference({ type, content: type === 'report' ? (reportContent || '无') : metaInfo })}
                 herbRegex={herbRegex}
               />
             ))
           )}
           
           {isToolExecuting && (
             <div className="flex justify-center my-4 animate-in fade-in">
                 <div className="bg-white border border-indigo-100 shadow-lg px-6 py-2 rounded-full flex items-center gap-3">
                     <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                     <span className="text-xs font-bold text-indigo-700">正在查阅/修改数据库...</span>
                 </div>
             </div>
           )}

           <div ref={messagesEndRef} className="h-4" />
           
           {/* Scroll Button */}
           {showScrollButton && (
               <button 
                   onClick={scrollToBottom}
                   className="fixed bottom-40 right-10 z-30 w-10 h-10 bg-slate-900 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-bottom-4 border-2 border-white"
               >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
               </button>
           )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-30 shrink-0">
           
           {/* Meta Update Bubble (Redundant with header button but good for visibility) */}
           {pendingMetaUpdate && (
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 z-50 animate-in slide-in-from-bottom-2 fade-in">
                   <div 
                       className="bg-red-500 text-white pl-4 pr-3 py-3 rounded-2xl shadow-xl flex items-center gap-3 cursor-pointer hover:bg-red-600 transition-colors border-2 border-white ring-4 ring-red-100/50"
                       onClick={handleConfirmMetaUpdate}
                   >
                       <span className="text-2xl animate-pulse">📝</span>
                       <div className="flex flex-col">
                           <span className="text-[10px] font-bold opacity-80 uppercase tracking-wider">Attention Required</span>
                           <span className="font-bold text-sm">AI 建议更新病历 (点击审核)</span>
                       </div>
                       <button 
                           onClick={(e) => { e.stopPropagation(); setPendingMetaUpdate(null); }}
                           className="w-6 h-6 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-xs ml-2"
                       >
                           ✕
                       </button>
                   </div>
               </div>
           )}

           <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
              
              <FileUploadPreview files={attachments} onRemove={removeAttachment} />

              <div className="flex gap-3 items-end bg-slate-50 p-2 rounded-[1.5rem] border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all shadow-sm">
                  <div className="relative pb-1 pl-1">
                      <input 
                          type="file" 
                          multiple 
                          className="hidden" 
                          ref={fileInputRef}
                          onChange={handleFileSelect}
                          accept="image/*,.txt,.md,.csv,.json"
                      />
                      <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-colors flex items-center justify-center shadow-sm"
                          title="上传图片或文件"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                      </button>
                  </div>

                  <div className="flex-1 relative py-2.5">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onPaste={handlePaste}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={isLoading ? "AI 正在思考..." : "输入消息 (Shift+Enter 换行)..."}
                      disabled={isLoading}
                      className="w-full bg-transparent border-none p-0 text-base outline-none resize-none font-sans text-slate-900 placeholder-slate-400 min-h-[24px] max-h-[200px] leading-relaxed"
                      rows={1}
                    />
                  </div>
                  
                  {isLoading ? (
                    <button 
                      onClick={() => abortControllerRef.current?.abort()}
                      className="w-11 h-11 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all group shrink-0 mb-0.5"
                      title="停止生成"
                    >
                      <div className="w-3 h-3 bg-red-600 rounded-sm group-hover:scale-110"></div>
                    </button>
                  ) : (
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim() && attachments.length === 0}
                      className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed shrink-0 mb-0.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6 ml-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
                    </button>
                  )}
               </div>
               
               <div className="flex justify-between items-start">
                   <TokenCapsule 
                       tokenCount={tokenCount} 
                       limit={200000} 
                       messageCount={activeMessages.length} 
                   />
                   <div className="text-right pt-2">
                       <span className="text-[10px] text-slate-300">LogicMaster AI Engine v2.5</span>
                   </div>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};