
import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { generateChatStream, summarizeMessages, createEmptyMedicalRecord, CHAT_SYSTEM_INSTRUCTION_BASE, generateStructuredMedicalUpdate } from '../services/openaiService';
import { AnalysisResult, AISettings, ChatAttachment, CloudChatSession, MedicalRecord, BenCaoHerb, Patient, ViewMode, MedicalKnowledgeChunk } from '../types';
import { FULL_HERB_LIST } from '../data/herbDatabase';
import { fetchCloudChatSessions, saveCloudChatSession, deleteCloudChatSession } from '../services/supabaseService';
import { TokenCapsule } from './TokenCapsule';
import { useLog } from '../contexts/LogContext';
import { PromptEditorModal } from './PromptEditorModal';
import { ChatMemoryModal } from './ChatMemoryModal';

interface Message {
  role: 'user' | 'model' | 'system';
  text: string;
  isError?: boolean;
  attachments?: ChatAttachment[];
  citations?: MedicalKnowledgeChunk[]; 
  searchQuery?: string; 
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  medicalRecord?: MedicalRecord;
  patientId?: string; 
}

interface Props {
  analysis: AnalysisResult;
  prescriptionInput: string;
  reportContent?: string;
  settings: AISettings;
  medicalRecord: MedicalRecord;
  onUpdateMedicalRecord: (record: MedicalRecord) => void;
  onUpdateHerb: (herb: Partial<BenCaoHerb>) => void;
  onHerbClick?: (herbName: string) => void;
  onUpdatePrescription?: (newPrescription: string) => void;
  onRegenerateReport?: (instruction?: string) => void;
  isVisitorMode: boolean;
  isAdminMode: boolean;
  activePatient?: Patient | null;
  onSwitchView?: (view: ViewMode) => void; 
}

const NotificationBubble = ({ message, visible }: { message: string, visible: boolean }) => {
    if (!visible) return null;
    return (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in">
            <div className="bg-emerald-600 text-white px-6 py-2 rounded-full shadow-lg border border-emerald-500 flex items-center gap-2">
                <span className="text-xl">💡</span>
                <span className="font-bold text-sm">{message}</span>
            </div>
        </div>
    );
};

// ... (CloudArchiveModal, FileUploadPreview, ChatInputArea remain largely same) ...
const CloudArchiveModal: React.FC<any> = ({ isOpen, onClose, sessions, onLoad, onDelete, isLoading, isVisitorMode }) => {
    if (!isOpen) return null;
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
                            >
                                {deletingId === s.id ? <div className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></div> : <span>✕</span>}
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

const ChatInputArea = memo(({ onSend, isLoading, onStop, tokenCount, limit, messageCount, onOpenMemory }: { 
    onSend: (text: string, files: ChatAttachment[]) => void, 
    isLoading: boolean, 
    onStop: () => void,
    tokenCount: number,
    limit: number,
    messageCount: number,
    onOpenMemory: () => void
}) => {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSend = () => {
        if (!input.trim() && attachments.length === 0) return;
        onSend(input, attachments);
        setInput('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = e.target.files;
            const newAttachments: ChatAttachment[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                const isImage = file.type.startsWith('image/');
                const result = await new Promise<string>((resolve) => {
                    if (isImage) reader.readAsDataURL(file); else reader.readAsText(file);
                    reader.onload = () => resolve(reader.result as string);
                });
                newAttachments.push({ id: `file-${Date.now()}-${Math.random()}`, type: isImage ? 'image' : 'file', name: file.name, content: result, mimeType: file.type });
            }
            setAttachments(prev => [...prev, ...newAttachments]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-30 shrink-0">
           <div className="max-w-5xl mx-auto flex flex-col gap-2 relative">
              <FileUploadPreview files={attachments} onRemove={(id: string) => setAttachments(p => p.filter(x => x.id !== id))} />
              <div className="flex gap-3 items-end bg-slate-50 p-2 rounded-[1.5rem] border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all shadow-sm">
                  <div className="relative pb-1 pl-1">
                      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,.txt,.md,.csv,.json" />
                      <button onClick={() => fileInputRef.current?.click()} className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-colors flex items-center justify-center shadow-sm">📎</button>
                  </div>
                  <div className="flex-1 relative py-2.5">
                    <textarea 
                        ref={textareaRef} 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} 
                        placeholder={isLoading ? "AI 正在深度思考..." : "输入消息 (Shift+Enter 换行)..."} 
                        disabled={isLoading} 
                        className="w-full bg-transparent border-none p-0 text-lg outline-none resize-none font-sans text-slate-900 placeholder-slate-400 min-h-[28px] max-h-[200px] leading-relaxed" 
                        rows={1} 
                    />
                  </div>
                  {isLoading ? (
                    <button onClick={onStop} className="w-11 h-11 rounded-full bg-red-100 text-red-600 hover:bg-red-200 flex items-center justify-center transition-all group shrink-0 mb-0.5">■</button>
                  ) : (
                    <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0} className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed shrink-0 mb-0.5">➤</button>
                  )}
               </div>
               <div className="flex justify-between items-center pt-2">
                   <div className="flex items-center gap-2">
                        <TokenCapsule tokenCount={tokenCount} limit={200000} messageCount={messageCount} />
                        <button 
                            onClick={onOpenMemory}
                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1"
                        >
                            <span>🧠</span> 整理记忆
                        </button>
                   </div>
                   <div className="text-right"><span className="text-[10px] text-slate-300">LogicMaster AI v3.1 (RAG Enhanced)</span></div>
               </div>
           </div>
        </div>
    );
});

// --- NEW: Citation Preview Modal ---
const EvidenceModal: React.FC<{ citations: MedicalKnowledgeChunk[], selectedId: string | null, onClose: () => void }> = ({ citations, selectedId, onClose }) => {
    if (!selectedId) return null;
    const index = parseInt(selectedId) - 1;
    const chunk = citations[index];

    if (!chunk) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        <span className="bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded text-sm">证据 [{selectedId}]</span>
                        <span className="text-xs text-slate-400 font-mono">
                            ID: {chunk.id.slice(0, 8)}...
                        </span>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm leading-relaxed text-slate-700 font-serif-sc overflow-y-auto max-h-[60vh]">
                    {chunk.content}
                </div>
                <div className="mt-4 flex justify-between items-center text-xs text-slate-400">
                    <span>来源: {chunk.sourceType}</span>
                    <span>{new Date(chunk.createdAt).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
};

interface ChatMessageItemProps {
    message: Message;
    index: number;
    isLoading: boolean;
    isLast: boolean;
    onDelete: (index: number) => void;
    onRegenerate: (index: number) => void;
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
    const [activeCitationId, setActiveCitationId] = useState<string | null>(null);
    const [showSources, setShowSources] = useState(false);

    // Prepare content by transforming [1] to links
    const contentWithLinks = useMemo(() => {
        let text = message.text || '';
        
        // 1. Process Citations: [1] -> [1](citation:1)
        text = text.replace(/\[(\d+)\]/g, '[$1](citation:$1)');

        // 2. Process Herbs: Name -> [Name](#herb:Name)
        if (herbRegex) {
            text = text.replace(herbRegex, (match) => `[${match}](#herb:${match})`);
        }

        return text;
    }, [message.text, herbRegex]);

    const components = useMemo(() => ({
        code: ({node, inline, className, children, ...props}: any) => {
             return <code className={`${className} bg-slate-100 text-rose-600 px-1 rounded font-mono text-sm`} {...props}>{children}</code>;
        },
        a: ({node, href, children, ...props}: any) => {
            if (href && href.startsWith('citation:')) {
                const id = href.split(':')[1];
                return (
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveCitationId(id); }}
                        className="inline-flex items-center justify-center w-5 h-5 mx-0.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all align-text-top shadow-sm translate-y-0.5"
                        title="点击查看证据详情"
                    >
                        {children}
                    </button>
                );
            }
            
            // Updated Herb Link Handler:
            // CRITICAL FIX: Render as SPAN instead of A to prevent 403 errors and browser navigation
            if (href && (href.includes('herb:'))) {
                let herbName = "";
                try {
                    const parts = href.split('herb:');
                    if (parts.length > 1) {
                        herbName = decodeURIComponent(parts[1]);
                    } else {
                        herbName = decodeURIComponent(href);
                    }
                } catch(e) { herbName = href; }
                
                return (
                    <span 
                        onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            onHerbClick?.(herbName); 
                        }}
                        className="text-indigo-600 font-bold border-b border-indigo-200 hover:bg-indigo-50 hover:border-indigo-500 cursor-pointer transition-colors px-0.5 rounded-sm select-none"
                        title="点击查看药典详情"
                        role="button"
                        tabIndex={0}
                    >
                        {children}
                    </span>
                );
            }
            return <a href={href} className="text-indigo-600 hover:underline" {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
        }
    }), [onHerbClick]); 

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {};

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
            <EvidenceModal 
                citations={message.citations || []} 
                selectedId={activeCitationId} 
                onClose={() => setActiveCitationId(null)} 
            />

            <div className={`w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 shadow-md border ${isUser ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white border-indigo-600' : 'bg-white text-indigo-600 border-slate-200'}`}>
                {isUser ? '🧑‍⚕️' : '🤖'}
            </div>

            <div className={`max-w-[90%] lg:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                <div className={`text-xs text-slate-400 mb-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                    {isUser ? '我' : 'LogicMaster AI'}
                </div>

                <div className={`rounded-2xl px-6 py-4 shadow-sm border transition-all duration-200 overflow-hidden ${
                    isUser 
                        ? 'bg-indigo-600 text-white border-indigo-600 rounded-tr-none shadow-indigo-200' 
                        : 'bg-white text-slate-800 border-slate-200 rounded-tl-none shadow-sm'
                }`}>
                    {/* Citations / Sources Panel */}
                    {!isUser && message.citations && message.citations.length > 0 && (
                        <div className="mb-4 border border-indigo-100 rounded-xl bg-indigo-50/30 overflow-hidden">
                            <button 
                                onClick={() => setShowSources(!showSources)}
                                className="w-full flex items-center justify-between px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-colors"
                            >
                                <span className="flex items-center gap-2">
                                    <span>📚</span> 已引用 {message.citations.length} 条病历证据
                                </span>
                                <span>{showSources ? '▲' : '▼'}</span>
                            </button>
                            {showSources && (
                                <div className="p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-white">
                                    {message.citations.map((c, idx) => (
                                        <div key={idx} className="text-xs p-2 rounded bg-slate-50 border border-slate-100 hover:border-indigo-200 cursor-pointer" onClick={() => setActiveCitationId((idx + 1).toString())}>
                                            <div className="font-bold text-indigo-600 mb-1">证据 [{idx + 1}]</div>
                                            <div className="text-slate-600 line-clamp-2">{c?.content || '无内容'}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

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
                        <div 
                            className={`markdown-body ${isUser ? 'text-white' : ''}`}
                            onClick={handleClick}
                        >
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm]} 
                                rehypePlugins={[rehypeRaw]}
                                components={components}
                            >
                                {contentWithLinks}
                            </ReactMarkdown>
                        </div>
                    )}
                    
                    {isUser && message.attachments && message.attachments.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {message.attachments.map((att, idx) => (
                                <div key={idx} className="bg-white/20 p-2 rounded-lg border border-white/30 text-xs flex items-center gap-2">
                                    <span>{att.type === 'image' ? '🖼️' : '📄'}</span>
                                    <span className="truncate max-w-[100px]">{att.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                 {!isEditing && (
                    <div className={`mt-2 flex items-center gap-2 transition-opacity duration-200 ${isHovering || copySuccess ? 'opacity-100' : 'opacity-0'} ${isUser ? 'flex-row-reverse' : ''}`}>
                         {copySuccess && <span className="text-xs text-emerald-600 font-bold animate-pulse">已复制</span>}
                         <button onClick={handleCopy} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="复制"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5" /></svg></button>
                         <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="编辑"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
                         {(!isLoading) && (
                            <button onClick={() => onRegenerate(index)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors" title="重新生成"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 011.378-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>
                         )}
                         <button onClick={() => onDelete(index)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="删除"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                    </div>
                )}
            </div>
        </div>
    );
});

export const AIChatbot: React.FC<Props> = (props) => {
    return <AIChatbotInner {...props} />;
};

const AIChatbotInner: React.FC<Props> = ({ 
  analysis, 
  prescriptionInput, 
  reportContent, 
  settings,
  medicalRecord,
  onUpdateMedicalRecord,
  onUpdateHerb,
  onHerbClick,
  onUpdatePrescription,
  onRegenerateReport,
  isVisitorMode,
  isAdminMode,
  activePatient,
  onSwitchView
}) => {
  // ... (Hooks remain same) ...
  const { addLog } = useLog(); 
  const LS_CHAT_SESSIONS_KEY = activePatient ? `logicmaster_chat_sessions_${activePatient.id}` : "logicmaster_chat_sessions";

  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [customSystemPrompt, setCustomSystemPrompt] = useState(CHAT_SYSTEM_INSTRUCTION_BASE);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showCloudArchive, setShowCloudArchive] = useState(false);
  const [cloudArchiveSessions, setCloudArchiveSessions] = useState<CloudChatSession[]>([]);
  const [isCloudArchiveLoading, setIsCloudArchiveLoading] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [showOrganizeInstruction, setShowOrganizeInstruction] = useState(false);
  const [organizeInstruction, setOrganizeInstruction] = useState('');
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);
  
  const medicalRecordRef = useRef(medicalRecord);
  useEffect(() => { medicalRecordRef.current = medicalRecord; }, [medicalRecord]);
  
  // ... (Other useEffects remain same) ...
  const herbRegex = useMemo(() => {
      const names = FULL_HERB_LIST.map(h => h.name).sort((a, b) => b.length - a.length);
      if (names.length === 0) return null;
      const validNames = names.filter(n => n.length >= 1); 
      const escaped = validNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return new RegExp(`(${escaped.join('|')})`, 'g');
  }, [FULL_HERB_LIST.length]);

  // FIX: Added safe navigation to prevent crash if m.text is undefined (legacy data)
  const estimateTokens = (msgs: Message[]) => {
     if (!Array.isArray(msgs)) return 0;
     let totalChars = 0;
     msgs.forEach(m => totalChars += (m.text || '').length);
     return Math.round(totalChars * 0.8) + 100;
  };

  const showToast = (msg: string) => {
      setNotificationMsg(msg);
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
  };
  
  useEffect(() => {
      setActiveSessionId(null);
      setSessions({});
      const init = async () => {
         try {
             const saved = localStorage.getItem(LS_CHAT_SESSIONS_KEY);
             const lastIdKey = activePatient ? `logicmaster_last_active_session_${activePatient.id}` : 'logicmaster_last_active_session';
             const lastId = localStorage.getItem(lastIdKey);
             let loadedSessions = saved ? JSON.parse(saved) : {};
             
             if (Object.keys(loadedSessions).length > 0) {
                 setSessions(loadedSessions);
                 if (lastId && loadedSessions[lastId]) {
                     setActiveSessionId(lastId);
                 }
             } else {
                 createNewSession();
             }
         } catch (e) {
             console.error("Failed to load sessions from LS", e);
             createNewSession();
         }
      };
      init();
  }, [activePatient?.id]);

  // --- OPTIMIZED LOCAL STORAGE PERSISTENCE LOGIC ---
  useEffect(() => {
    if (Object.keys(sessions).length > 0) {
        // Helper: Strip Embeddings to save massive space
        // Vectors are float arrays that take up 90% of storage.
        // We assume re-vectorization or cloud sync handles the actual vector data.
        // Local storage just keeps text history for UX.
        const prepareForStorage = (data: Record<string, Session>) => {
            const cleanData: Record<string, Session> = {};
            
            Object.values(data).forEach(s => {
                const cleanSession = { ...s };
                
                // 1. Strip embeddings from medical record inside session
                if (cleanSession.medicalRecord) {
                    cleanSession.medicalRecord = {
                        ...cleanSession.medicalRecord,
                        knowledgeChunks: cleanSession.medicalRecord.knowledgeChunks.map(c => ({
                            ...c,
                            embedding: undefined 
                        }))
                    };
                }

                // 2. NEW: Aggressively strip embeddings from Message Citations (RAG evidence)
                // This is often where the bulk of the data accumulates unseen.
                if (cleanSession.messages) {
                    cleanSession.messages = cleanSession.messages.map(m => ({
                        ...m,
                        citations: m.citations ? m.citations.map(c => ({
                            ...c,
                            embedding: undefined // Strip the vector array
                        })) : undefined
                    }));
                }
                
                cleanData[s.id] = cleanSession;
            });
            return cleanData;
        };

        const trySave = (data: Record<string, Session>) => {
            try {
                localStorage.setItem(LS_CHAT_SESSIONS_KEY, JSON.stringify(data));
                return true;
            } catch (e: any) {
                return false;
            }
        };

        // 1. Attempt Safe Save (Stripped Embeddings)
        const safeData = prepareForStorage(sessions);
        if (!trySave(safeData)) {
            console.warn("Storage Quota Exceeded. Triggering aggressive cleanup...");
            
            // 2. Aggressive Cleanup: Keep Active + Last 3 Sessions
            const sorted = Object.values(safeData).sort((a, b) => b.createdAt - a.createdAt);
            const keepSessions = sorted.filter(s => s.id === activeSessionId || sorted.indexOf(s) < 3);
            
            const trimmedData = keepSessions.reduce((acc: any, s) => { acc[s.id] = s; return acc; }, {});
            
            if (trySave(trimmedData)) {
                showToast("⚠️ 本地存储空间已满。系统已自动清理旧会话缓存 (云端存档不受影响)。");
            } else {
                showToast("❌ 无法保存：浏览器存储空间严重不足。请尝试清理浏览器数据。");
            }
        }
    }
    
    if (activeSessionId) {
      const lastIdKey = activePatient ? `logicmaster_last_active_session_${activePatient.id}` : 'logicmaster_last_active_session';
      try { localStorage.setItem(lastIdKey, activeSessionId); } catch(e) {}
      const msgs = sessions[activeSessionId]?.messages || [];
      setTokenCount(estimateTokens(msgs));
    }
  }, [sessions, activeSessionId, activePatient]);

  useEffect(() => {
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
      if (session.id.startsWith('medical_record_master_')) return;

      setIsSyncing(true);
      try {
          await saveCloudChatSession({
              id: session.id,
              title: session.title,
              messages: session.messages,
              medical_record: explicitMedicalRecord || session.medicalRecord || medicalRecordRef.current,
              patient_id: activePatient?.id, 
              created_at: session.createdAt
          }, settings);
          addLog('success', 'Chat', 'Session synced to cloud', { sessionId });
      } catch (e: any) {
          addLog('error', 'Chat', 'Session sync failed', { error: e.message });
      } finally {
          setIsSyncing(false);
      }
  };

  const handleManualCompress = async (keepCount: number) => {
      if (!activeSessionId) return;
      const history = sessions[activeSessionId].messages;
      if (history.length <= keepCount) {
          showToast(`当前消息数 (${history.length}) 未超过保留数 (${keepCount})，无需压缩。`);
          return;
      }

      setIsCompressing(true);
      addLog('action', 'Chat', `Manual compression: keeping last ${keepCount} messages`);
      
      const messagesToSummarize = history.slice(0, history.length - keepCount);
      const messagesToKeep = history.slice(history.length - keepCount);
      
      try {
          const summary = await summarizeMessages(messagesToSummarize, settings);
          const summaryMessage: Message = {
              role: 'system',
              text: `[SYSTEM: PREVIOUS CONVERSATION SUMMARY (COMPRESSED)]\n${summary}`
          };
          const compressedHistory = [summaryMessage, ...messagesToKeep];
          
          setSessions(prev => ({ 
              ...prev, 
              [activeSessionId]: { ...prev[activeSessionId], messages: compressedHistory } 
          }));
          showToast(`✅ 压缩完成！已合并旧消息为摘要。`);
      } catch(e: any) {
          addLog('error', 'Chat', 'Compression failed', e);
          showToast(`❌ 压缩失败: ${e.message}`);
      } finally {
          setIsCompressing(false);
      }
  };

  const handleSend = useCallback(async (text: string, files: ChatAttachment[]) => {
    if (isLoading) return;
    let currentSessionId = activeSessionId;
    if (!currentSessionId) {
        currentSessionId = createNewSession();
    }
    
    const userMsg: Message = { role: 'user', text: text, attachments: files };
    let updatedHistory: Message[] = [];
    
    setSessions(prev => {
        const sess = prev[currentSessionId!] ? { ...prev[currentSessionId!] } : null;
        if (!sess) return prev; 
        
        updatedHistory = [...sess.messages, userMsg];
        sess.messages = updatedHistory;
        if (sess.messages.length <= 2 && text) sess.title = text.slice(0, 20) + (text.length > 20 ? '...' : '');
        return { ...prev, [currentSessionId!]: sess };
    });

    // removed automatic compression call here, relying on manual trigger
    await runGeneration(currentSessionId!, updatedHistory);
  }, [activeSessionId, isLoading, settings]); 

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
              medicalRecordRef.current,
              customSystemPrompt
          );

          let fullText = '';
          
          for await (const chunk of stream) {
              // Handle Citations Payload
              if (chunk.citations) {
                  setSessions(prev => {
                      const sess = { ...prev[sessionId] };
                      const lastIdx = sess.messages.length - 1;
                      if (lastIdx >= 0 && sess.messages[lastIdx].role === 'model') {
                          // Merge citations instead of overwriting if already exists (though stream usually sends once)
                          sess.messages[lastIdx] = { 
                              ...sess.messages[lastIdx], 
                              citations: chunk.citations,
                              searchQuery: chunk.query
                          };
                      }
                      return { ...prev, [sessionId]: sess };
                  });
              }

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
          }
      } catch (e: any) {
          if (e.name !== 'AbortError') {
              console.error(e);
              
              let errorMsg = e.message;
              if (errorMsg === "SENSITIVE_CONTENT_DETECTED" || errorMsg.includes("sensitive words")) {
                  errorMsg = "⚠️ 内容包含敏感词，已被 AI 服务商拦截。请检查您的输入。";
              }

              setSessions(prev => {
                  const sess = { ...prev[sessionId] };
                  const lastIdx = sess.messages.length - 1;
                  sess.messages[lastIdx] = { 
                      ...sess.messages[lastIdx], 
                      text: sess.messages[lastIdx].text + `\n\n[System Error: ${errorMsg}]`, 
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
  
  // ... (initiateOrganization, handleOrganizeRecord, createNewSession, handleRegenerate, handleEditMessage, handleDeleteMessage, handleManualSync, loadCloudArchive, handleDeleteCloudSession, handleLoadCloudSession, handleStartEditTitle, handleSaveTitle, scrollToBottom, handleScroll, deleteSession, visibleSessions, activeMessages, SessionList remain largely same) ...
  const initiateOrganization = () => {
      if (!activeSessionId) {
          alert("请先开始一段对话，AI 才能从中整理病历。");
          return;
      }
      setShowOrganizeInstruction(true);
      setOrganizeInstruction('');
  };

  const handleOrganizeRecord = async () => {
      setShowOrganizeInstruction(false);
      if (!activeSessionId) return;
      
      const history = sessions[activeSessionId].messages;
      if (history.length === 0) {
          alert("没有对话历史可供整理。");
          return;
      }

      setIsOrganizing(true);
      addLog('info', 'Agent', 'Smart Agent: Analyzing context for medical record update...');
      
      try {
          const convoStr = history.map(m => `${m.role}: ${m.text}`).join('\n');
          const jsonString = await generateStructuredMedicalUpdate(
              convoStr, 
              medicalRecordRef.current, 
              settings, 
              organizeInstruction
          );
          
          if (!jsonString || jsonString.trim().length === 0) {
              throw new Error("Empty response from agent");
          }

          addLog('success', 'Agent', 'Structured JSON generated. Auto-navigating...');
          
          localStorage.setItem("logicmaster_medical_input_draft", jsonString);
          localStorage.setItem("logicmaster_auto_run_import", "true");
          
          if (onSwitchView) {
              showToast("AI 已整理完毕！正在跳转至病历界面进行智能归档...");
              setTimeout(() => {
                  onSwitchView(ViewMode.MEDICAL_RECORD);
              }, 800);
          }

      } catch (e: any) {
          addLog('error', 'Agent', `Organization failed: ${e.message}`);
          alert(`整理失败: ${e.message}`);
      } finally {
          setIsOrganizing(false);
      }
  };

  const createNewSession = () => {
    const newId = `session_${Date.now()}`;
    const initialRecord = activePatient && activePatient.medical_record ? activePatient.medical_record : createEmptyMedicalRecord();
    const newSession: Session = { 
        id: newId, 
        title: "新的研讨", 
        createdAt: Date.now(), 
        messages: [{ role: 'model', text: '我是您的 AI 中医助手。请详细描述您的症状或问题。' }], 
        medicalRecord: initialRecord,
        patientId: activePatient?.id 
    };
    setSessions(prev => ({ ...prev, [newId]: newSession }));
    setActiveSessionId(newId);
    setShowMobileSidebar(false);
    return newId;
  };

  const handleRegenerate = async (index: number) => { if (!activeSessionId || isLoading) return; const currentMessages = sessions[activeSessionId].messages; const targetMsg = currentMessages[index]; let newHistory: Message[] = []; if (targetMsg.role === 'user') newHistory = currentMessages.slice(0, index + 1); else newHistory = currentMessages.slice(0, index); setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: newHistory } })); await runGeneration(activeSessionId, newHistory); };
  const handleEditMessage = (index: number, newText: string, shouldResend: boolean) => { if (!activeSessionId) return; const currentMsgs = sessions[activeSessionId].messages; const updatedMsgs = [...currentMsgs]; updatedMsgs[index] = { ...updatedMsgs[index], text: newText }; setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: updatedMsgs } })); if (shouldResend) { const truncatedHistory = updatedMsgs.slice(0, index + 1); setSessions(prev => ({ ...prev, [activeSessionId]: { ...prev[activeSessionId], messages: truncatedHistory } })); runGeneration(activeSessionId, truncatedHistory); } else { saveCurrentSessionToCloud(activeSessionId); } };
  const handleDeleteMessage = (index: number) => { if (!activeSessionId) return; setSessions(prev => { const sess = { ...prev[activeSessionId] }; sess.messages = sess.messages.filter((_, i) => i !== index); return { ...prev, [activeSessionId]: sess }; }); saveCurrentSessionToCloud(activeSessionId); };
  const handleManualSync = () => { if (activeSessionId) saveCurrentSessionToCloud(activeSessionId); };
  const loadCloudArchive = async () => { setIsCloudArchiveLoading(true); try { const data = await fetchCloudChatSessions(settings, activePatient?.id); setCloudArchiveSessions(data); } finally { setIsCloudArchiveLoading(false); } };
  const handleDeleteCloudSession = async (id: string) => { if (isVisitorMode) return; if (await deleteCloudChatSession(id, settings)) { setCloudArchiveSessions(prev => prev.filter(s => s.id !== id)); if (sessions[id]) { const newSessions = {...sessions}; delete newSessions[id]; setSessions(newSessions); if (activeSessionId === id) setActiveSessionId(null); } } };
  
  // FIX: Normalize legacy content to text to prevent crash
  const handleLoadCloudSession = (cloudSession: CloudChatSession) => { 
      let record: MedicalRecord = cloudSession.medical_record || createEmptyMedicalRecord(); 
      
      let rawMessages: any[] = [];
      if (Array.isArray(cloudSession.messages)) {
          rawMessages = cloudSession.messages;
      } else if (typeof cloudSession.messages === 'string') {
          try {
              rawMessages = JSON.parse(cloudSession.messages);
          } catch(e) {
              console.warn("Failed to parse cloud messages", e);
              rawMessages = [];
          }
      }

      const safeMessages: Message[] = rawMessages.map(m => {
          // Sanitize Citations array elements
          const safeCitations = Array.isArray(m.citations) ? m.citations.filter((c:any) => c && c.content) : [];
          
          return {
              role: m.role || 'user',
              text: m.text || m.content || '', // Sanitize
              isError: m.isError || false,
              attachments: m.attachments || [],
              citations: safeCitations,
              searchQuery: m.searchQuery
          };
      });

      const newSession: Session = { 
          id: cloudSession.id, 
          title: cloudSession.title, 
          messages: safeMessages, 
          createdAt: cloudSession.created_at, 
          medicalRecord: record, 
          patientId: cloudSession.patient_id 
      }; 
      setSessions(prev => ({ ...prev, [newSession.id]: newSession })); 
      setActiveSessionId(newSession.id); 
      onUpdateMedicalRecord(record); 
      setShowCloudArchive(false); 
  };

  const handleStartEditTitle = (session: Session) => { setEditingSessionId(session.id); setEditingTitle(session.title); };
  const handleSaveTitle = () => { if (!editingSessionId || !editingTitle.trim()) { setEditingSessionId(null); return; } setSessions(prev => { const newSessions = { ...prev }; if (newSessions[editingSessionId]) { newSessions[editingSessionId].title = editingTitle.trim(); } return newSessions; }); setEditingSessionId(null); };
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  const handleScroll = () => { if (!messagesContainerRef.current) return; const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current; setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200); };
  const deleteSession = async (id: string, e: React.MouseEvent) => { e.stopPropagation(); if(isVisitorMode) return; if (window.confirm("Delete session?")) { const newSessions = {...sessions}; delete newSessions[id]; setSessions(newSessions); if(activeSessionId === id) setActiveSessionId(null); } };
  
  const visibleSessions: Session[] = (Object.values(sessions) as Session[])
      .filter((s) => !s.id.startsWith('medical_record_master_'))
      .sort((a, b) => b.createdAt - a.createdAt);
  
  // FIX: Memoize active messages to prevent unnecessary render cycles
  const activeMessages = useMemo(() => {
      return activeSessionId ? sessions[activeSessionId]?.messages || [] : [];
  }, [activeSessionId, sessions]);
  
  const SessionList = () => (
     <div className="flex flex-col h-full">
         <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
           <button onClick={() => createNewSession()} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"><span className="text-xl">+</span> 新的研讨</button>
           <div className="flex gap-2">
                {!isVisitorMode && (
                    <>
                        <button onClick={handleManualSync} disabled={isSyncing || !activeSessionId} className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1 ${isSyncing ? 'bg-emerald-50 text-emerald-600' : 'bg-white text-slate-500 hover:text-indigo-600'}`}>{isSyncing ? '备份中' : '同步'}</button>
                        <button onClick={() => { setShowCloudArchive(true); setShowMobileSidebar(false); loadCloudArchive(); }} className="flex-1 py-2.5 rounded-lg border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 text-xs font-bold transition-all flex items-center justify-center gap-1"><span>📂</span> 历史存档</button>
                    </>
                )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
           {visibleSessions.map((session: Session) => (
               <div key={session.id} onClick={() => { setActiveSessionId(session.id); setShowMobileSidebar(false); }} onDoubleClick={() => handleStartEditTitle(session)} className={`group flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border ${activeSessionId === session.id ? 'bg-white border-indigo-200 shadow-md' : 'hover:bg-white/80 border-transparent'}`}>
                 <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <span className="text-xl">💬</span>
                    {editingSessionId === session.id ? (
                        <input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} onBlur={handleSaveTitle} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingSessionId(null); }} className="text-sm font-bold bg-white border border-indigo-300 rounded-md px-2 py-1 w-full focus:ring-2 focus:ring-indigo-300 outline-none" autoFocus />
                    ) : (
                        <div className="flex flex-col overflow-hidden"><span className="text-sm font-bold truncate">{session.title}</span><span className="text-[10px] opacity-60 font-medium">{new Date(session.createdAt).toLocaleTimeString()}</span></div>
                    )}
                 </div>
                 <div className="flex items-center">
                    <button onClick={(e) => { e.stopPropagation(); handleStartEditTitle(session); }} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity" title="重命名"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id, e); }} disabled={isVisitorMode} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" title="删除">✕</button>
                 </div>
               </div>
             ))}
        </div>
     </div>
  );

  return (
    <div className="flex h-full w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 relative">
      <NotificationBubble message={notificationMsg} visible={showNotification} />
      <PromptEditorModal isOpen={showPromptEditor} onClose={() => setShowPromptEditor(false)} title="AI 问答系统提示词" defaultPrompt={customSystemPrompt} onSave={setCustomSystemPrompt} />
      <ChatMemoryModal 
          isOpen={showMemoryModal} 
          onClose={() => setShowMemoryModal(false)} 
          tokenCount={tokenCount} 
          messageCount={activeMessages.length}
          onCompress={handleManualCompress}
          isCompressing={isCompressing}
      />
      
      <CloudArchiveModal isOpen={showCloudArchive} onClose={() => setShowCloudArchive(false)} sessions={cloudArchiveSessions} onLoad={handleLoadCloudSession} onDelete={handleDeleteCloudSession} isLoading={isCloudArchiveLoading} isVisitorMode={isVisitorMode} />
      {showMobileSidebar && <div className="fixed inset-0 z-50 flex md:hidden"><div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileSidebar(false)}></div><div className="relative w-4/5 max-w-xs bg-slate-50 h-full shadow-2xl"><SessionList /></div></div>}
      
      {showOrganizeInstruction && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowOrganizeInstruction(false)}></div>
              <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                  <div className="p-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                      <h3 className="font-bold text-lg">AI 智能病历管家</h3>
                      <p className="text-xs text-indigo-100 opacity-80 mt-1">深度感知上下文，智能分析并更新病历</p>
                  </div>
                  <div className="p-6">
                      <textarea
                          value={organizeInstruction}
                          onChange={(e) => setOrganizeInstruction(e.target.value)}
                          placeholder="指令示例：&#10;- 重点记录今日新增的血压数据&#10;- 修正现病史中的日期错误&#10;- 忽略闲聊，只提取有效医疗信息"
                          className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none text-sm"
                      />
                      <div className="flex gap-3 mt-6">
                          <button onClick={() => setShowOrganizeInstruction(false)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition">取消</button>
                          <button onClick={handleOrganizeRecord} className="flex-1 py-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200 transition">
                              {isOrganizing ? '整理中...' : '开始智能更新'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="w-80 bg-[#f8fafc] border-r border-slate-200 hidden md:flex flex-col flex-shrink-0"><SessionList /></div>

      <div className="flex-1 flex flex-col relative bg-white h-full overflow-hidden w-full min-w-0">
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 bg-white/95 backdrop-blur z-20 shadow-sm shrink-0">
           <div className="flex items-center gap-3">
             <button className="md:hidden p-2 text-slate-500" onClick={() => setShowMobileSidebar(true)}>☰</button>
             <div>
                 <h3 className="font-bold text-slate-800 text-lg">智能研讨 (AI Chat)</h3>
                 <p className="text-[10px] text-slate-400 font-medium">支持 Markdown 渲染 • RAG 增强</p>
             </div>
           </div>
           
           <div className="flex items-center gap-2">
               <button 
                   onClick={initiateOrganization}
                   disabled={isOrganizing || !activeSessionId}
                   className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors flex items-center gap-1 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                   title="AI 助手：智能分析对话，按时间轴整理并更新病历"
               >
                   {isOrganizing ? <span className="animate-spin">⏳</span> : <span>🤖</span>}
                   {isOrganizing ? '智能分析中...' : 'AI 助手整理'}
               </button>

               {isAdminMode && (
                 <button onClick={() => setShowPromptEditor(true)} className="text-xs bg-slate-800 text-white px-2 py-1.5 rounded hover:bg-black transition-colors flex items-center gap-1"><span>🔧</span> 提示词</button>
               )}
           </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth custom-scrollbar relative bg-[#fafafa]" ref={messagesContainerRef} onScroll={handleScroll}>
           {activeMessages.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-6"><div className="text-5xl">🤖</div><div className="text-center"><h3 className="text-xl font-bold text-slate-700">欢迎使用 AI 研讨</h3><p className="text-sm mt-2 max-w-md mx-auto">本模式已启用 Markdown 渲染引擎。\n支持代码高亮、表格、列表等富文本格式。\n如需更新病历，请点击右上角的【AI 助手整理】按钮。</p></div></div>
           ) : (
             activeMessages.map((msg, i) => (
               <ChatMessageItem key={i} index={i} message={msg} isLoading={isLoading} isLast={i === activeMessages.length - 1} onDelete={handleDeleteMessage} onRegenerate={handleRegenerate} onEdit={handleEditMessage} onHerbClick={onHerbClick} herbRegex={herbRegex} />
             ))
           )}
           <div ref={messagesEndRef} className="h-4" />
           {showScrollButton && <button onClick={scrollToBottom} className="fixed bottom-40 right-10 z-30 w-10 h-10 bg-slate-900 text-white rounded-full shadow-xl flex items-center justify-center border-2 border-white">↓</button>}
        </div>

        <ChatInputArea 
            onSend={handleSend} 
            isLoading={isLoading} 
            onStop={() => abortControllerRef.current?.abort()} 
            tokenCount={tokenCount} 
            limit={200000} 
            messageCount={activeMessages.length}
            onOpenMemory={() => setShowMemoryModal(true)}
        />
      </div>
    </div>
  );
};
