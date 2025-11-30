// ... (Imports remain same)
import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { generateChatStream, OpenAIMessage, OpenAIToolCall, summarizeMessages, createEmptyMedicalRecord, CHAT_SYSTEM_INSTRUCTION_BASE, createEmbedding } from '../services/openaiService';
import { AnalysisResult, AISettings, ChatAttachment, CloudChatSession, ViewMode, MedicalRecord, MedicalKnowledgeChunk, BenCaoHerb } from '../types';
import { searchHerbsForAI, FULL_HERB_LIST, registerDynamicHerb } from '../data/herbDatabase';
import { fetchCloudChatSessions, saveCloudChatSession, deleteCloudChatSession } from '../services/supabaseService';
import { TokenCapsule } from './TokenCapsule';
import { useLog } from '../contexts/LogContext';
import { PromptEditorModal } from './PromptEditorModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

// ... (Interface definitions remain same)
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
  medicalRecord?: MedicalRecord;
}

interface Props {
  analysis: AnalysisResult;
  prescriptionInput: string;
  reportContent?: string;
  onUpdatePrescription?: (newPrescription: string) => void;
  onRegenerateReport?: (instructions: string) => void;
  onHerbClick?: (herbName: string) => void;
  settings: AISettings;
  medicalRecord: MedicalRecord;
  onUpdateMedicalRecord: (record: MedicalRecord) => void;
  onUpdateHerb: (herb: Partial<BenCaoHerb>) => void; // New callback
  isVisitorMode: boolean;
  isAdminMode: boolean;
}

// ... (Subcomponents like NotificationBubble, ChatMessageItem remain same)
const NotificationBubble = ({ message, visible }: { message: string, visible: boolean }) => {
    if (!visible) return null;
    return (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in">
            <div className="bg-emerald-600 text-white px-6 py-2 rounded-full shadow-lg border border-emerald-500 flex items-center gap-2">
                <span className="text-xl">✍️</span>
                <span className="font-bold text-sm">{message}</span>
            </div>
        </div>
    );
};

// ... CloudArchiveModal and FileUploadPreview remain same ...
const CloudArchiveModal: React.FC<any> = ({ isOpen, onClose, sessions, onLoad, onDelete, isLoading, isVisitorMode }) => {
    if (!isOpen) return null;
    // Filter out medical record archives from the chat session list
    const chatSessions = sessions.filter((s: any) => !s.id.startsWith('medical_record_master_'));
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if(window.confirm("确定删除此研讨存档吗？无法撤销。")) {
            setDeletingId(id);
            await onDelete(id);
            setDeletingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><span>☁️</span> 云端研讨存档</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-white custom-scrollbar space-y-3">
                    {isLoading ? (
                        <div className="text-center py-12 text-slate-400">正在同步...</div>
                    ) : chatSessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">暂无云端存档</div>
                    ) : (
                        chatSessions.map((s:any) => (
                        <div 
                            key={s.id} 
                            className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors group relative cursor-pointer"
                            onClick={() => onLoad(s)}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-slate-700 line-clamp-1 pr-8">{s.title || "未命名研讨"}</h4>
                                <span className="text-[10px] text-slate-400 whitespace-nowrap bg-white px-1 py-0.5 rounded border border-slate-100">
                                    {new Date(s.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity mt-2">
                                <span className="flex-1 bg-indigo-50 text-indigo-600 text-xs font-bold py-1.5 rounded hover:bg-indigo-100 transition-colors text-center block">
                                    加载此存档
                                </span>
                            </div>
                            
                            <button 
                                onClick={(e) => handleDelete(s.id, e)} 
                                disabled={isVisitorMode || deletingId === s.id} 
                                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-300 hover:text-red-600 hover:bg-red-50 border border-slate-100 hover:border-red-100 transition-all shadow-sm z-10 disabled:cursor-not-allowed disabled:opacity-50"
                                title="删除"
                            >
                                {deletingId === s.id ? (
                                    <div className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></div>
                                ) : (
                                    <span>✕</span>
                                )}
                            </button>
                        </div>
                    )))}
                </div>
            </div>
        </div>
    );
};
const FileUploadPreview: React.FC<any> = ({ files, onRemove }) => {
    if (files.length === 0) return null;
    return (<div className="flex gap-2 p-3 overflow-x-auto border-t border-slate-200 bg-slate-100 rounded-t-xl mx-0">{files.map((f:any) => (<div key={f.id} className="relative group shrink-0 w-24 h-24 rounded-lg border border-slate-300 overflow-hidden bg-white shadow-sm">{f.type === 'image' ? <img src={f.content} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-600 p-2 bg-slate-50"><span className="text-2xl mb-1">📄</span><span className="truncate w-full text-center font-medium">{f.name}</span></div>}<button onClick={() => onRemove(f.id)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">✕</button></div>))}</div>);
};

// ... ChatMessageItem remains same ...
interface ChatMessageItemProps {
    message: Message;
    index: number;
    isLoading: boolean;
    isLast: boolean;
    onDelete: (index: number) => void;
    onRegenerate: (index: number) => Promise<void>;
    onEdit: (index: number, newText: string, shouldResend: boolean) => void;
    onHerbClick?: (herbName: string) => void;
    herbRegex: RegExp | null;
}

const ChatMessageItem = memo((props: ChatMessageItemProps) => {
    const { message, index, isLoading, isLast, onDelete, onRegenerate, onEdit, onHerbClick, herbRegex } = props;
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(message.text);
    const [isHovering, setIsHovering] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [forceRender, setForceRender] = useState(false); // New state

    if(message.role === 'tool') return null;

    const processMessageContent = (text: string) => {
      if (!text) return "";
      let cleanText = text;
      
      // 1. INTELLIGENT EXTRACTION: If a code block exists, extract it
      const codeBlockMatch = cleanText.match(/```(?:html|xml)?\s*([\s\S]*?)```/i);
      if (codeBlockMatch) {
          cleanText = codeBlockMatch[1]; 
      } else {
          cleanText = cleanText.replace(/```(?:html|xml|markdown|css)?\s*(\n|$)/gi, '');
          cleanText = cleanText.replace(/```\s*$/gi, '');
      }

      // 2. Strip HTML Document Wrapper Tags (html, head, body, doctype)
      cleanText = cleanText.replace(/<!DOCTYPE html>/gi, '');
      cleanText = cleanText.replace(/<\/?html[^>]*>/gi, '');
      cleanText = cleanText.replace(/<\/?head[^>]*>/gi, '');
      cleanText = cleanText.replace(/<\/?body[^>]*>/gi, '');

      // 3. Fix Indentation (De-indent)
      // If AI indented the HTML code block, removing fences leaves indentation.
      // 4 spaces of indentation is interpreted as a Code Block in Markdown. We must remove it.
      const lines = cleanText.split('\n');
      const indentedLineMatches = lines.filter(line => line.trim().length > 0).map(line => line.match(/^[ \t]*/)?.[0].length || 0);
      
      if (indentedLineMatches.length > 0) {
          const minIndent = Math.min(...indentedLineMatches);
          if (minIndent > 0) {
              cleanText = lines.map(line => line.length >= minIndent ? line.slice(minIndent) : line).join('\n');
          }
      }

      if (!herbRegex) return cleanText;

      // FIX: Do not strip <think> tags completely here, handled in service or UI
      
      return cleanText.replace(herbRegex, (match, p1, offset, string) => {
          // Simple guard: don't replace inside attributes
          const before = string.slice(Math.max(0, offset - 2), offset);
          if (before.includes('="') || before.includes("='")) return match;
          
          return `<span class="herb-link cursor-pointer text-indigo-700 font-bold border-b border-indigo-200 hover:bg-indigo-50 hover:border-indigo-500 transition-colors px-0.5 rounded-sm" data-herb-name="${match}">${match}</span>`;
      });
    };
    
    // Auto-enable Force Render if content looks like HTML
    useEffect(() => {
        const clean = processMessageContent(message.text).trim();
        const hasCodeBlock = message.text.includes('```html') || message.text.includes('```xml');
        if (hasCodeBlock || clean.startsWith('<div') || clean.startsWith('<table') || clean.startsWith('<p') || clean.startsWith('<h')) {
            if (!forceRender) setForceRender(true);
        }
    }, [message.text]);
    
    // ... rest of ChatMessageItem ...
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.matches('.herb-link') || target.closest('.herb-link')) {
        const el = target.matches('.herb-link') ? target : target.closest('.herb-link');
        const herbName = el?.getAttribute('data-herb-name');
        if (herbName && onHerbClick) {
          onHerbClick(herbName);
        }
      }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(message.text);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleSaveEdit = (shouldResend: boolean) => {
        onEdit(index, editValue, shouldResend);
        setIsEditing(false);
    };

    const isUser = message.role === 'user';

    return (
        <div 
            className={`flex gap-4 mb-8 ${isUser ? 'flex-row-reverse' : ''} group relative px-4 lg:px-12`}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 shadow-md border ${isUser ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-indigo-600' : 'bg-white text-indigo-600 border-slate-200'}`}>
                {isUser ? '🧑‍⚕️' : '🤖'}
            </div>

            <div className={`max-w-[90%] lg:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`text-xs text-slate-400 mb-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                    {isUser ? '我' : 'LogicMaster AI'}
                </div>

                <div className={`rounded-2xl px-6 py-4 shadow-sm border transition-all duration-200 ${
                    isUser 
                        ? 'bg-indigo-600 text-white border-indigo-600 rounded-tr-none shadow-indigo-200' 
                        : 'bg-white text-slate-800 border-slate-200 rounded-tl-none shadow-sm'
                }`}>
                    {isEditing ? (
                        <div className="min-w-[300px]">
                            <textarea 
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-sans"
                                rows={5}
                            />
                            <div className="flex justify-end gap-2 mt-3">
                                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100">取消</button>
                                <button onClick={() => handleSaveEdit(false)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100">仅保存</button>
                                <button onClick={() => handleSaveEdit(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm">保存并发送</button>
                            </div>
                        </div>
                    ) : (
                        // Render Logic Switch
                        forceRender ? (
                            <div 
                                className="prose prose-lg max-w-none prose-slate prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5"
                                onClick={handleClick}
                                dangerouslySetInnerHTML={{ __html: processMessageContent(message.text) }}
                            />
                        ) : (
                            <div 
                              className={`prose prose-lg max-w-none ${isUser ? 'prose-invert' : 'prose-slate'} prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5`}
                              onClick={handleClick}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        a: ({node, ...props}) => <a {...props} className="text-indigo-500 underline hover:text-indigo-600 font-bold" target="_blank" rel="noreferrer" />,
                                        table: ({node, ...props}) => <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 shadow-sm"><table {...props} className="min-w-full text-sm" /></div>,
                                        th: ({node, ...props}) => <th {...props} className="bg-slate-100/50 font-bold text-left p-2 border-b" />,
                                        td: ({node, ...props}) => <td {...props} className="p-2 border-b" />,
                                        strong: ({node, ...props}) => <strong {...props} className="font-bold text-inherit bg-yellow-100/30 px-0.5 rounded" />,
                                        blockquote: ({node, ...props}) => <blockquote {...props} className="border-l-4 border-indigo-300 pl-4 py-1 italic bg-slate-50 text-slate-600 my-2 rounded-r" />,
                                    }}
                                >
                                    {processMessageContent(message.text)}
                                </ReactMarkdown>
                            </div>
                        )
                    )}
                </div>
                {/* ... action buttons ... */}
                 {!isEditing && (
                    <div className={`mt-2 flex items-center gap-2 transition-opacity duration-200 ${isHovering || copySuccess ? 'opacity-100' : 'opacity-0'} ${isUser ? 'flex-row-reverse' : ''}`}>
                         {copySuccess && <span className="text-xs text-emerald-600 font-bold animate-pulse">已复制</span>}
                         
                         {/* Force Render Toggle */}
                         {!isUser && (
                             <button 
                                onClick={() => setForceRender(!forceRender)} 
                                className={`p-1.5 rounded-lg transition-colors ${forceRender ? 'bg-amber-100 text-amber-700' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
                                title={forceRender ? "切换回 Markdown" : "切换到强制 HTML 渲染"}
                             >
                                👁️
                             </button>
                         )}

                         <button onClick={handleCopy} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="复制">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5" /></svg>
                         </button>
                         
                         <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="编辑">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                         </button>

                         {(!isLoading) && (
                            <button onClick={() => onRegenerate(index)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="重新生成">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                            </button>
                         )}

                         <button onClick={() => onDelete(index)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="删除">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                         </button>
                    </div>
                )}
            </div>
        </div>
    );
});


// ==========================================
// Main Component
// ==========================================
export const AIChatbot: React.FC<Props> = ({ 
  analysis, 
  prescriptionInput, 
  reportContent, 
  onUpdatePrescription, 
  onRegenerateReport,
  onHerbClick,
  settings,
  medicalRecord,
  onUpdateMedicalRecord,
  onUpdateHerb,
  isVisitorMode,
  isAdminMode
}) => {
  const { addLog } = useLog(); 
  const LS_CHAT_SESSIONS_KEY = "logicmaster_chat_sessions";

  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isToolExecuting, setIsToolExecuting] = useState(false);
  const [viewingReference, setViewingReference] = useState<{type: 'report' | 'meta', content: string} | null>(null);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState("");
  
  // ... rest of state ...
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState(CHAT_SYSTEM_INSTRUCTION_BASE);

  // ... (useEffects remain mostly same) ...
  // Cloud Sync & Archive
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCloudArchive, setShowCloudArchive] = useState(false);
  const [cloudArchiveSessions, setCloudArchiveSessions] = useState<CloudChatSession[]>([]);
  const [isCloudArchiveLoading, setIsCloudArchiveLoading] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);
  
  // Ref for latest Medical Record to ensure async tool calls access latest state
  const medicalRecordRef = useRef(medicalRecord);
  useEffect(() => {
      medicalRecordRef.current = medicalRecord;
  }, [medicalRecord]);
  
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

  const showToast = (msg: string) => {
      setNotificationMsg(msg);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
  };
  
  // ... Session management logic ...
  useEffect(() => {
    const init = async () => {
         const saved = localStorage.getItem(LS_CHAT_SESSIONS_KEY);
         const lastId = localStorage.getItem('logicmaster_last_active_session');
         let loadedSessions = saved ? JSON.parse(saved) : {};
         
         if (Object.keys(loadedSessions).length > 0) {
             setSessions(loadedSessions);
             if (lastId && loadedSessions[lastId]) {
                 setActiveSessionId(lastId);
                 if (loadedSessions[lastId].medicalRecord) {
                    onUpdateMedicalRecord(loadedSessions[lastId].medicalRecord);
                 }
             }
         } else {
             createNewSession();
         }
    };
    init();
  }, [settings.supabaseKey, isVisitorMode]);

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
      // PREVENT SYNC IN VISITOR MODE
      if (!isVisitorMode && !isLoading && activeSessionId && sessions[activeSessionId]) {
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

  const saveCurrentSessionToCloud = async (sessionId: string, explicitMedicalRecord?: MedicalRecord) => {
      if (isVisitorMode || !settings.supabaseKey || !sessionId) return;
      const session = sessions[sessionId];
      if (!session) return;
      // Do not sync medical record archive sessions back from chat if they were loaded
      if (session.id.startsWith('medical_record_master_')) return;

      setIsSyncing(true);
      try {
          await saveCloudChatSession({
              id: session.id,
              title: session.title,
              messages: session.messages,
              medical_record: explicitMedicalRecord || session.medicalRecord || medicalRecordRef.current,
              created_at: session.createdAt
          }, settings);
          addLog('success', 'Chat', 'Session synced to cloud', { sessionId });
      } catch (e: any) {
          addLog('error', 'Chat', 'Session sync failed', { error: e.message });
      } finally {
          setIsSyncing(false);
      }
  };

  const checkAndCompressHistory = async (sessionId: string, history: Message[]) => {
      // FIX: Increase retention to 50 messages
      const MAX_MESSAGES = 60;
      const KEEP_MESSAGES = 50;
      if (history.length > MAX_MESSAGES) {
          const messagesToSummarize = history.slice(0, history.length - KEEP_MESSAGES);
          const messagesToKeep = history.slice(history.length - KEEP_MESSAGES);
          try {
             const summary = await summarizeMessages(messagesToSummarize, settings);
             const summaryMessage: Message = {
                 role: 'system',
                 text: `[SYSTEM: PREVIOUS CONVERSATION SUMMARY]\n${summary}`
             };
             const compressedHistory = [summaryMessage, ...messagesToKeep];
             setSessions(prev => ({ ...prev, [sessionId]: { ...prev[sessionId], messages: compressedHistory } }));
             return compressedHistory;
          } catch(e: any) { return history; }
      }
      return history;
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
        targetSessionId = createNewSession();
    }
    
    const currentInput = input;
    const currentAttachments = [...attachments];
    const userMsg: Message = { role: 'user', text: currentInput, attachments: currentAttachments };
    setInput('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    const updatedHistory = [...(sessions[targetSessionId]?.messages || []), userMsg];

    setSessions(prev => {
        const sess = { ...prev[targetSessionId!] };
        sess.messages = updatedHistory;
        if (sess.messages.length <= 2 && currentInput) sess.title = currentInput.slice(0, 20) + (currentInput.length > 20 ? '...' : '');
        return { ...prev, [targetSessionId!]: sess };
    });

    const processedHistory = await checkAndCompressHistory(targetSessionId!, updatedHistory);
    await runGeneration(targetSessionId!, processedHistory);
  };

  const runGeneration = async (sessionId: string, history: Message[]) => {
      setIsLoading(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
              medicalRecordRef.current, // USE REF for latest state
              customSystemPrompt
          );

          let fullText = '';
          let toolCallsResult: {id: string, name: string, args: any}[] = [];
          
          for await (const chunk of stream) {
              if (chunk.text) {
                  fullText += chunk.text;
                  setSessions(prev => {
                      const sess = { ...prev[sessionId] };
                      const lastIdx = sess.messages.length - 1;
                      if (lastIdx >= 0 && sess.messages[lastIdx].role === 'model') {
                          sess.messages[lastIdx] = { ...sess.messages[lastIdx], text: fullText };
                      }
                      return { ...prev, [sessionId]: sess };
                  });
              }
              if (chunk.functionCalls) {
                  toolCallsResult = chunk.functionCalls;
              }
          }

          let finalHistory = [...history];
          const assistantMsg: Message = { role: 'model', text: fullText };
          finalHistory.push(assistantMsg);

          if (toolCallsResult.length > 0) {
              const assistantMsgWithTools: Message = {
                  role: 'model',
                  text: fullText, 
                  toolCalls: toolCallsResult.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } }))
              };
              finalHistory[finalHistory.length - 1] = assistantMsgWithTools;
              setSessions(prev => {
                  const sess = { ...prev[sessionId] };
                  sess.messages[sess.messages.length - 1] = assistantMsgWithTools;
                  return { ...prev, [sessionId]: sess };
              });

              for (const tool of toolCallsResult) {
                  let result = "";
                  setIsToolExecuting(true);
                  
                  if (tool.name === 'lookup_herb') {
                      result = searchHerbsForAI(tool.args.query);
                  }
                  else if (tool.name === 'update_prescription') { 
                      onUpdatePrescription?.(tool.args.prescription); 
                      result = "Updated."; 
                  }
                  else if (tool.name === 'regenerate_report') { 
                      onRegenerateReport?.(tool.args.instructions); 
                      result = "Triggered."; 
                  }
                  else if (tool.name === 'save_medical_info') {
                      const { category, content } = tool.args;
                      // Generate simple embedding for new chunk if model available
                      let embedding: number[] | undefined = undefined;
                      if (settings.embeddingModel) {
                          try {
                              const vec = await createEmbedding(content, settings);
                              if (vec && !Array.isArray(vec[0])) embedding = vec as number[];
                          } catch (e) { console.warn("Failed to embed new info", e); }
                      }
                      
                      const newChunk: MedicalKnowledgeChunk = {
                          id: `chat-update-${Date.now()}`,
                          content: `${category}: ${content}`,
                          tags: ['AI对话更新', category],
                          embedding: embedding,
                          sourceType: 'chat',
                          createdAt: Date.now()
                      };
                      
                      // Use Ref for latest base
                      const updatedRecord = {
                          ...medicalRecordRef.current,
                          knowledgeChunks: [...medicalRecordRef.current.knowledgeChunks, newChunk]
                      };
                      onUpdateMedicalRecord(updatedRecord);
                      showToast(`AI 已追加病历: ${category}`);
                      result = `已成功保存信息到病历知识库。ID: ${newChunk.id}`;
                  }
                  else if (tool.name === 'update_knowledge_chunk') {
                      const { chunkId, newContent } = tool.args;
                      const targetChunkIndex = medicalRecordRef.current.knowledgeChunks.findIndex(c => c.id === chunkId);
                      
                      if (targetChunkIndex !== -1) {
                          const oldChunk = medicalRecordRef.current.knowledgeChunks[targetChunkIndex];
                          const updatedChunk = {
                              ...oldChunk,
                              content: newContent,
                              tags: [...oldChunk.tags.filter(t => t !== '已向量化'), 'AI修正', '待重算向量'],
                              embedding: undefined 
                          };
                          
                          const newChunks = [...medicalRecordRef.current.knowledgeChunks];
                          newChunks[targetChunkIndex] = updatedChunk;
                          
                          onUpdateMedicalRecord({ ...medicalRecordRef.current, knowledgeChunks: newChunks });
                          showToast(`AI 已修正病历 ID: ${chunkId.slice(0,6)}`);
                          result = `Chunk ${chunkId} updated successfully. Embedding cleared.`;
                      } else {
                          result = `Error: Chunk ID ${chunkId} not found.`;
                      }
                  }
                  // --- GOD MODE TOOLS IMPLEMENTATION ---
                  else if (tool.name === 'update_herb_database') {
                      showToast(`AI 正在更新药材库: ${tool.args.name}`);
                      onUpdateHerb(tool.args);
                      result = `Success: Updated herb '${tool.args.name}' in global database.`;
                  }
                  else if (tool.name === 'update_medical_record_full') {
                      // tool.args contains partial { name, age, tcmDiagnosis ... }
                      const newRecord = { ...medicalRecordRef.current, basicInfo: { ...medicalRecordRef.current.basicInfo }, diagnosis: { ...medicalRecordRef.current.diagnosis } };
                      if (tool.args.name) newRecord.basicInfo.name = tool.args.name;
                      if (tool.args.age) newRecord.basicInfo.age = tool.args.age;
                      if (tool.args.gender) newRecord.basicInfo.gender = tool.args.gender;
                      if (tool.args.tcmDiagnosis) newRecord.diagnosis.tcm = tool.args.tcmDiagnosis;
                      
                      onUpdateMedicalRecord(newRecord);
                      showToast("AI 已更新病历基本信息");
                      result = "Medical record basic fields updated successfully.";
                  }
                  
                  setIsToolExecuting(false);
                  
                  const toolMsg: Message = { role: 'tool', toolCallId: tool.id, functionName: tool.name, text: result };
                  finalHistory.push(toolMsg);
                  setSessions(prev => {
                      const sess = { ...prev[sessionId] };
                      sess.messages.push(toolMsg);
                      return { ...prev, [sessionId]: sess };
                  });
              }
              await runGeneration(sessionId, finalHistory);
              return; 
          }

      } catch (e: any) {
          if (e.name !== 'AbortError') {
              console.error(e);
              setSessions(prev => {
                  const sess = { ...prev[sessionId] };
                  const lastIdx = sess.messages.length - 1;
                  sess.messages[lastIdx] = { ...sess.messages[lastIdx], text: sess.messages[lastIdx].text + `\n[Error: ${e.message}]`, isError: true };
                  return { ...prev, [sessionId]: sess };
              });
          }
      } finally {
          setIsLoading(false);
          abortControllerRef.current = null;
      }
  };

  const createNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: Session = { id: newId, title: "新的研讨", createdAt: Date.now(), messages: [{ role: 'model', text: '我是您的 AI 中医助手。请先在【电子病历】模块录入患者数据，或直接在此输入病情。' }], medicalRecord: createEmptyMedicalRecord() };
    setSessions(prev => ({ ...prev, [newId]: newSession }));
    setActiveSessionId(newId);
    onUpdateMedicalRecord(createEmptyMedicalRecord());
    setShowMobileSidebar(false);
    return newId;
  };
  
  // ... Handlers (Regenerate, Edit, Delete, etc.) remain the same ...
  const handleRegenerate = async (index: number) => { if (!activeSessionId || isLoading) return; const currentMessages = sessions[activeSessionId].messages; const targetMsg = currentMessages[index]; let newHistory: Message[] = []; if (targetMsg.role === 'user') newHistory = currentMessages.slice(0, index + 1); else newHistory = currentMessages.slice(0, index); setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: newHistory } })); await runGeneration(activeSessionId, newHistory); };
  const handleEditMessage = (index: number, newText: string, shouldResend: boolean) => { if (!activeSessionId) return; const currentMsgs = sessions[activeSessionId].messages; const updatedMsgs = [...currentMsgs]; updatedMsgs[index] = { ...updatedMsgs[index], text: newText }; setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: updatedMsgs } })); if (shouldResend) { const truncatedHistory = updatedMsgs.slice(0, index + 1); setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: truncatedHistory } })); runGeneration(activeSessionId, truncatedHistory); } else { saveCurrentSessionToCloud(activeSessionId); } };
  const handleDeleteMessage = (index: number) => { if (!activeSessionId) return; setSessions(prev => { const sess = { ...prev[activeSessionId] }; sess.messages = sess.messages.filter((_, i) => i !== index); return { ...prev, [activeSessionId]: sess }; }); saveCurrentSessionToCloud(activeSessionId); };
  const handleManualSync = () => { if (activeSessionId) saveCurrentSessionToCloud(activeSessionId); };
  const loadCloudArchive = async () => { setIsCloudArchiveLoading(true); try { const data = await fetchCloudChatSessions(settings); setCloudArchiveSessions(data); } finally { setIsCloudArchiveLoading(false); } };
  const handleDeleteCloudSession = async (id: string) => { if (isVisitorMode) return; if (await deleteCloudChatSession(id, settings)) { setCloudArchiveSessions(prev => prev.filter(s => s.id !== id)); if (sessions[id]) { const newSessions = {...sessions}; delete newSessions[id]; setSessions(newSessions); if (activeSessionId === id) setActiveSessionId(null); } } };
  
  const handleLoadCloudSession = (cloudSession: CloudChatSession) => { 
      let record: MedicalRecord = cloudSession.medical_record || createEmptyMedicalRecord();
      const newSession: Session = { 
          id: cloudSession.id, 
          title: cloudSession.title, 
          messages: cloudSession.messages, 
          createdAt: cloudSession.created_at, 
          medicalRecord: record
      }; 
      setSessions(prev => ({ ...prev, [newSession.id]: newSession })); 
      setActiveSessionId(newSession.id); 
      onUpdateMedicalRecord(record);
      setShowCloudArchive(false); 
  };
  
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const handleScroll = () => { if (!messagesContainerRef.current) return; const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current; setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200); };
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files.length > 0) { const files = e.target.files; const newAttachments: ChatAttachment[] = []; for (let i = 0; i < files.length; i++) { const file = files[i]; const reader = new FileReader(); const isImage = file.type.startsWith('image/'); const result = await new Promise<string>((resolve) => { if (isImage) reader.readAsDataURL(file); else reader.readAsText(file); reader.onload = () => resolve(reader.result as string); }); newAttachments.push({ id: `file-${Date.now()}-${Math.random()}`, type: isImage ? 'image' : 'file', name: file.name, content: result, mimeType: file.type }); } setAttachments(prev => [...prev, ...newAttachments]); if (fileInputRef.current) fileInputRef.current.value = ''; } };
  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));
  const deleteSession = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); if(isVisitorMode) return; if (window.confirm("Delete session?")) { const newSessions = {...sessions}; delete newSessions[id]; setSessions(newSessions); if(activeSessionId === id) setActiveSessionId(null); } };
  const visibleSessions = Object.values(sessions).filter(s => !s.id.startsWith('medical_record_master_')).sort((a, b) => b.createdAt - a.createdAt);
  const activeMessages = activeSessionId ? sessions[activeSessionId]?.messages || [] : [];
  
  const SessionList = () => (
     <div className="flex flex-col h-full">
         <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
           <button onClick={() => createNewSession()} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"><span className="text-xl">+</span> 新的研讨</button>
           <div className="flex gap-2">
                {!isVisitorMode && (
                    <>
                        <button onClick={handleManualSync} disabled={isSyncing || !activeSessionId} className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${isSyncing ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-500 hover:text-indigo-600'}`}>{isSyncing ? '备份中' : '同步'}</button>
                        <button onClick={() => { setShowCloudArchive(true); setShowMobileSidebar(false); loadCloudArchive(); }} className="flex-1 py-2 rounded-lg border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 text-xs font-bold transition-all flex items-center justify-center gap-1"><span>📂</span> 历史存档</button>
                    </>
                )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
           {visibleSessions.map((session) => (
               <div key={session.id} onClick={() => { setActiveSessionId(session.id); setShowMobileSidebar(false); }} className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border ${activeSessionId === session.id ? 'bg-white border-indigo-200 shadow-md' : 'hover:bg-white/80 border-transparent'}`}>
                 <div className="flex items-center gap-3 overflow-hidden flex-1"><span className="text-xl">💬</span><div className="flex flex-col overflow-hidden"><span className="text-sm font-bold truncate">{session.title}</span><span className="text-[10px] opacity-60 font-medium">{new Date(session.createdAt).toLocaleTimeString()}</span></div></div>
                 <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id, e); }} disabled={isVisitorMode} className="w-6 h-6 rounded-full bg-white border flex items-center justify-center text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100">✕</button>
               </div>
             ))}
        </div>
     </div>
  );

  return (
    <div className="flex h-full w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 relative">
      <NotificationBubble message={notificationMsg} visible={showNotification} />
      {/* ... PromptEditorModal, CloudArchiveModal, ViewingReference, MobileSidebar ... */}
      <PromptEditorModal isOpen={showPromptEditor} onClose={() => setShowPromptEditor(false)} title="AI 问答系统提示词" defaultPrompt={customSystemPrompt} onSave={setCustomSystemPrompt} />
      <CloudArchiveModal isOpen={showCloudArchive} onClose={() => setShowCloudArchive(false)} sessions={cloudArchiveSessions} onLoad={handleLoadCloudSession} onDelete={handleDeleteCloudSession} isLoading={isCloudArchiveLoading} isVisitorMode={isVisitorMode} />
      {viewingReference && (<div className="fixed inset-0 z-[110] flex items-center justify-center p-4"><div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setViewingReference(null)}></div><div className="relative bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}><div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center"><h3 className="font-bold text-slate-800">引用内容</h3><button onClick={() => setViewingReference(null)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button></div><div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">{viewingReference.type === 'report' ? <div className="prose" dangerouslySetInnerHTML={{__html: viewingReference.content}}></div> : <pre className="whitespace-pre-wrap">{viewingReference.content}</pre>}</div></div></div>)}
      {showMobileSidebar && <div className="fixed inset-0 z-50 flex md:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)}></div><div className="relative w-4/5 max-w-xs bg-slate-50 h-full shadow-2xl"><SessionList /></div></div>}
      
      <div className="w-80 bg-[#f8fafc] border-r border-slate-200 hidden md:flex flex-col flex-shrink-0"><SessionList /></div>

      <div className="flex-1 flex flex-col relative bg-white h-full overflow-hidden w-full min-w-0">
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 bg-white/95 backdrop-blur z-20 shadow-sm shrink-0">
           <div className="flex items-center gap-3">
             <button className="md:hidden p-2 text-slate-500" onClick={() => setShowMobileSidebar(true)}>☰</button>
             <div><h3 className="font-bold text-slate-800 text-lg">智能研讨</h3></div>
           </div>
           
           <div className="flex items-center gap-2">
               {isAdminMode && (
                 <button onClick={() => setShowPromptEditor(true)} className="text-xs bg-slate-800 text-white px-2 py-1.5 rounded hover:bg-black transition-colors flex items-center gap-1">
                    <span>🔧</span> 提示词
                 </button>
               )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth custom-scrollbar relative bg-[#fafafa]" ref={messagesContainerRef} onScroll={handleScroll}>
           {activeMessages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6"><div className="text-5xl">🤖</div><div className="text-center"><h3 className="text-xl font-bold text-slate-700">欢迎使用 LogicMaster AI</h3><p className="text-sm mt-2">如果您在【电子病历】模块录入了患者信息，AI 将自动检索知识库并结合处方进行分析。</p></div></div>
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
                  herbRegex={herbRegex} 
               />
             ))
           )}
           {isToolExecuting && <div className="flex justify-center my-4 animate-in fade-in"><div className="bg-white border border-indigo-100 shadow-lg px-6 py-2 rounded-full flex items-center gap-3"><div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><span className="text-xs font-bold text-indigo-700">正在查阅/修改数据库...</span></div></div>}
           <div ref={messagesEndRef} className="h-4" />
           {showScrollButton && <button onClick={scrollToBottom} className="fixed bottom-40 right-10 z-30 w-10 h-10 bg-slate-900 text-white rounded-full shadow-xl flex items-center justify-center border-2 border-white">↓</button>}
        </div>

        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-30 shrink-0">
           {/* ... Input Area ... */}
           <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
              <FileUploadPreview files={attachments} onRemove={removeAttachment} />
              <div className="flex gap-3 items-end bg-slate-50 p-2 rounded-[1.5rem] border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all shadow-sm">
                  <div className="relative pb-1 pl-1">
                      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.txt,.md,.csv,.json" />
                      <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-colors flex items-center justify-center shadow-sm">📎</button>
                  </div>
                  <div className="flex-1 relative py-2.5">
                    <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={isLoading ? "AI 正在思考..." : "输入消息 (Shift+Enter 换行)..."} disabled={isLoading} className="w-full bg-transparent border-none p-0 text-lg outline-none resize-none font-sans text-slate-900 placeholder-slate-400 min-h-[28px] max-h-[200px] leading-relaxed" rows={1} />
                  </div>
                  {isLoading ? (
                    <button onClick={() => abortControllerRef.current?.abort()} className="w-11 h-11 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all group shrink-0 mb-0.5">■</button>
                  ) : (
                    <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0} className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed shrink-0 mb-0.5">➤</button>
                  )}
               </div>
               <div className="flex justify-between items-start">
                   <TokenCapsule tokenCount={tokenCount} limit={200000} messageCount={activeMessages.length} />
                   <div className="text-right pt-2"><span className="text-[10px] text-slate-300">LogicMaster AI Engine v2.7</span></div>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};