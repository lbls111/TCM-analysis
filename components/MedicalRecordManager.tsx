
import React, { useState, useEffect, useRef } from 'react';
import { MedicalRecord, AISettings, MedicalKnowledgeChunk, CloudChatSession } from '../types';
import { createEmbedding, createEmptyMedicalRecord } from '../services/openaiService';
import { fetchCloudChatSessions, deleteCloudChatSession } from '../services/supabaseService';

interface Props {
  record: MedicalRecord;
  onUpdate: (record: MedicalRecord) => void;
  onSaveToCloud?: () => Promise<void>;
  isAdminMode?: boolean;
  settings: AISettings;
}

const LS_DRAFT_KEY = "logicmaster_medical_input_draft";

// ... (SchemaErrorAlert and MedicalHistoryModal remain the same) ...
const SchemaErrorAlert: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const copySql = () => {
        const sql = `alter table chat_sessions add column if not exists medical_record jsonb;
alter table chat_sessions add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());`;
        navigator.clipboard.writeText(sql);
        alert("SQL 代码已复制！请前往 Supabase Dashboard -> SQL Editor 粘贴并运行。");
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl border-4 border-red-500 animate-in zoom-in-95">
                <div className="flex items-start gap-4 mb-4">
                    <div className="text-4xl">🚨</div>
                    <div>
                        <h3 className="text-xl font-bold text-red-600">数据库结构需要更新</h3>
                        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                            即使您之前已经初始化过数据库，但为了支持<b>电子病历云端存档</b>功能，系统需要在 `chat_sessions` 表中追加新的字段（增量更新）。
                        </p>
                        <p className="text-xs text-slate-500 mt-2 bg-slate-100 p-2 rounded">
                            这不会删除您现有的数据，只是添加 `medical_record` 和 `updated_at` 两个新列。
                        </p>
                    </div>
                </div>
                
                <div className="bg-slate-900 rounded-lg p-4 mb-4 relative group">
                    <code className="text-emerald-400 font-mono text-xs break-all whitespace-pre-wrap">
{`alter table chat_sessions add column if not exists medical_record jsonb;
alter table chat_sessions add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());`}
                    </code>
                    <button 
                        onClick={copySql}
                        className="absolute top-2 right-2 bg-white/20 hover:bg-white/30 text-white text-xs px-2 py-1 rounded"
                    >
                        复制 SQL
                    </button>
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">关闭</button>
                    <button onClick={() => window.open('https://supabase.com/dashboard', '_blank')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">前往 Supabase</button>
                </div>
            </div>
        </div>
    );
};

const MedicalHistoryModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    settings: AISettings, 
    onLoad: (record: MedicalRecord) => void 
}> = ({ isOpen, onClose, settings, onLoad }) => {
    const [sessions, setSessions] = useState<CloudChatSession[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && settings.supabaseKey) {
            loadHistory();
        }
    }, [isOpen]);

    const loadHistory = async () => {
        setLoading(true);
        try {
            const allSessions = await fetchCloudChatSessions(settings);
            // Filter specifically for medical record archives
            const archives = allSessions.filter(s => 
                s.id.startsWith('medical_record_master_')
            );
            setSessions(archives);
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); 
        if (!window.confirm("确定删除此档案吗？此操作将永久删除该病历存档，无法撤销。")) return;
        setDeletingId(id);
        try {
            const success = await deleteCloudChatSession(id, settings);
            if (success) {
                setSessions(prev => prev.filter(s => s.id !== id));
            } else {
                alert("删除失败，请检查网络或权限。");
            }
        } catch (e) {
            console.error(e);
            alert("删除时发生错误。");
        } finally {
            setDeletingId(null);
        }
    };

    const handleLoadRecord = (s: CloudChatSession) => {
        try {
            if (window.confirm(`确定要加载存档 "${s.title}" 吗？\n当前未保存的编辑将被覆盖。`)) {
                // FIX: Defensive coding for potentially null or incomplete medical records
                let recordToLoad = s.medical_record;
                
                // Fallback if record is missing in DB
                if (!recordToLoad) {
                    console.warn("Medical record payload missing in archive, creating empty.");
                    recordToLoad = createEmptyMedicalRecord();
                }
                
                // Ensure array fields exist
                if (!recordToLoad.knowledgeChunks) recordToLoad.knowledgeChunks = [];
                if (!recordToLoad.basicInfo) recordToLoad.basicInfo = createEmptyMedicalRecord().basicInfo;
                if (!recordToLoad.diagnosis) recordToLoad.diagnosis = createEmptyMedicalRecord().diagnosis;

                onLoad(recordToLoad);
                onClose();
            }
        } catch (e) {
            console.error("Load failed", e);
            alert("加载存档失败：数据格式可能已损坏或不兼容。");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><span>📂</span> 病历历史档案库</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-white custom-scrollbar space-y-3">
                    {loading ? (
                        <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin"></div>
                            <span>正在同步云端数据...</span>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400">
                            <div className="text-4xl mb-2">📭</div>
                            暂无云端存档
                        </div>
                    ) : (
                        sessions.map((s) => (
                            <div 
                                key={s.id} 
                                className="p-4 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all group relative cursor-pointer shadow-sm"
                                onClick={() => handleLoadRecord(s)}
                            >
                                <div className="flex justify-between items-start mb-1 pr-8">
                                    <h4 className="font-bold text-slate-700 line-clamp-1">{s.title || "未命名档案"}</h4>
                                </div>
                                <div className="text-xs text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
                                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-100">
                                        📅 {new Date(s.created_at).toLocaleDateString()}
                                    </span>
                                    <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-medium">
                                        {(s.medical_record?.knowledgeChunks?.length || 0)} 条知识
                                    </span>
                                </div>
                                <div className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity text-center">
                                    <span className="text-xs font-bold text-indigo-600 bg-white px-3 py-1 rounded-full shadow-sm border border-indigo-100">
                                        点击加载此存档
                                    </span>
                                </div>
                                <button 
                                    onClick={(e) => handleDelete(s.id, e)}
                                    disabled={deletingId === s.id}
                                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg bg-white text-slate-300 hover:text-red-600 hover:bg-red-50 border border-slate-100 hover:border-red-100 transition-all shadow-sm z-10"
                                    title="永久删除"
                                >
                                    {deletingId === s.id ? (
                                        <div className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin"></div>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                    )}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export const MedicalRecordManager: React.FC<Props> = ({ record, onUpdate, onSaveToCloud, isAdminMode, settings }) => {
  const [rawInput, setRawInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: '' });
  const [logs, setLogs] = useState<string[]>([]);
  const [isListCollapsed, setIsListCollapsed] = useState(true);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showSchemaError, setShowSchemaError] = useState(false);
  
  // Edit Mode State
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Persistence: Load draft on mount
  useEffect(() => {
      const draft = localStorage.getItem(LS_DRAFT_KEY);
      if (draft) setRawInput(draft);
  }, []);

  // Persistence: Save draft on change
  useEffect(() => {
      localStorage.setItem(LS_DRAFT_KEY, rawInput);
  }, [rawInput]);

  // Auto-scroll logs
  useEffect(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg: string) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const handleStop = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
          addLog("⚠️ 用户手动停止任务");
          setIsProcessing(false);
          setProgress({ current: 0, total: 0, stage: '已停止' });
      }
  };

  const smartTextSplitter = (text: string): string[] => {
      if (!text) return [];
      const mergedText = text.replace(/(?<![。！？.!?;：:])\n(?!\s*[-•\d\u2022])/g, ' ');
      const rawParagraphs = mergedText.split(/\n\s*\n/);
      const chunks: string[] = [];
      let currentChunk = "";
      const TARGET_CHUNK_SIZE = 800; 
      const MIN_CHUNK_SIZE = 50;

      for (const para of rawParagraphs) {
          const trimmedPara = para.trim();
          if (!trimmedPara) continue;
          if (currentChunk.length + trimmedPara.length > TARGET_CHUNK_SIZE) {
              if (currentChunk.length > MIN_CHUNK_SIZE) {
                  chunks.push(currentChunk.trim());
                  currentChunk = "";
              }
              if (trimmedPara.length > TARGET_CHUNK_SIZE) {
                  const sentences = trimmedPara.split(/([。！？.!?]+)/);
                  let tempSent = "";
                  for (let i = 0; i < sentences.length; i+=2) {
                      const s = sentences[i];
                      const mark = sentences[i+1] || "";
                      const fullSent = s + mark;
                      if (tempSent.length + fullSent.length > TARGET_CHUNK_SIZE) {
                          chunks.push(tempSent.trim());
                          tempSent = fullSent;
                      } else {
                          tempSent += fullSent;
                      }
                  }
                  if (tempSent) currentChunk = tempSent; 
              } else {
                  currentChunk = trimmedPara;
              }
          } else {
              currentChunk += (currentChunk ? "\n" : "") + trimmedPara;
          }
      }
      if (currentChunk.length > MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
      }
      return chunks;
  };

  const handleDecomposeAndStore = async () => {
      if (!settings.apiKey) {
          alert("错误：请先在设置中配置 API Key。");
          return;
      }
      if (!rawInput.trim()) return;

      setIsProcessing(true);
      setLogs([]); 
      setProgress({ current: 0, total: 0, stage: '初始化' });
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
          addLog("🚀 开始处理...");
          addLog("⚡ 正在进行智能分段与 OCR 修复...");
          const textChunks = smartTextSplitter(rawInput);
          const total = textChunks.length;
          
          if (total === 0) throw new Error("未能识别有效文本");
          
          addLog(`✅ 文本预处理完成。共生成 ${total} 个语义片段。`);
          addLog(`ℹ️ 策略：使用大批量 (Batch Size: 20) 向量化，最大化利用 TPM。`);

          const newChunks: MedicalKnowledgeChunk[] = [];
          const BATCH_SIZE = 20; 
          
          setProgress({ current: 0, total: total, stage: '向量化中' });

          for (let i = 0; i < total; i += BATCH_SIZE) {
              if (controller.signal.aborted) {
                  addLog("🛑 任务已中断。");
                  break;
              }
              const batch = textChunks.slice(i, i + BATCH_SIZE);
              const batchIndexStart = i + 1;
              const batchIndexEnd = Math.min(i + BATCH_SIZE, total);
              
              addLog(`📡 [${batchIndexStart}-${batchIndexEnd}/${total}] 正在批量上传至 Embedding API...`);
              
              let batchEmbeddings: number[][] = [];
              let embeddingError = false;
              try {
                  const result = await createEmbedding(batch, settings);
                  if (result && Array.isArray(result) && result.length > 0) {
                      if (!Array.isArray(result[0])) {
                          batchEmbeddings = [result as any]; 
                      } else {
                          batchEmbeddings = result as number[][];
                      }
                  }
              } catch (err: any) {
                  const errMsg = err.message || '';
                  embeddingError = true;
                  if (errMsg.includes('503') || errMsg.includes('429')) {
                      addLog(`⚠️ API 繁忙 (Rate Limit)，本批次将仅保存文本，稍后可重试。`);
                      await new Promise(r => setTimeout(r, 3000));
                  } else {
                      addLog(`❌ 向量化出错: ${errMsg} (已自动降级为文本存储)`);
                  }
              }
              
              batch.forEach((text, idx) => {
                  newChunks.push({
                      id: `chunk-${Date.now()}-${i + idx}`,
                      content: text,
                      tags: ['病历导入', '自动分段', embeddingError ? '未向量化' : '已向量化'], 
                      embedding: batchEmbeddings[idx] || undefined, 
                      sourceType: 'manual',
                      createdAt: Date.now()
                  });
              });

              setProgress({ current: batchIndexEnd, total: total, stage: '向量化中' });
              await new Promise(r => setTimeout(r, 200));
          }

          if (newChunks.length > 0) {
              onUpdate({
                  ...record,
                  knowledgeChunks: [...(record.knowledgeChunks || []), ...newChunks]
              });
              
              setRawInput(''); 
              localStorage.removeItem(LS_DRAFT_KEY);
              addLog(`🎉 处理完成！耗时极短，已录入 ${newChunks.length} 条知识片段。`);
              alert(`✅ 成功！已将 ${newChunks.length} 个片段存入知识库。`);
          } else {
              addLog("⚠️ 未生成数据。");
          }

      } catch (e: any) {
          addLog(`❌ 错误: ${e.message}`);
      } finally {
          setIsProcessing(false);
          abortControllerRef.current = null;
          setProgress({ current: 0, total: 0, stage: '完成' });
      }
  };

  const handleSyncToCloud = async () => {
      if(onSaveToCloud) {
          addLog("☁️ 正在请求同步云端...");
          try {
              await onSaveToCloud();
          } catch(e: any) {
              if (String(e).includes("SCHEMA_ERROR")) {
                  addLog("❌ 数据库结构错误，需要修复。");
                  setShowSchemaError(true);
              } else {
                  addLog(`❌ 同步失败: ${e.message}`);
              }
          }
      }
  };

  const handleDeleteChunk = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onUpdate({
          ...record,
          knowledgeChunks: record.knowledgeChunks.filter(c => c.id !== id)
      });
  };

  const handleStartEdit = (chunk: MedicalKnowledgeChunk) => {
      setEditingChunkId(chunk.id);
      setEditContent(chunk.content);
  };

  const handleSaveEdit = () => {
      if (!editingChunkId) return;
      
      const newChunks = record.knowledgeChunks.map(c => {
          if (c.id === editingChunkId) {
              return {
                  ...c,
                  content: editContent,
                  tags: [...c.tags.filter(t => t !== '已向量化'), '已编辑', '待重算'],
                  embedding: undefined // Clear embedding as content changed
              };
          }
          return c;
      });
      
      onUpdate({ ...record, knowledgeChunks: newChunks });
      setEditingChunkId(null);
      setEditContent('');
  };

  const handleCancelEdit = () => {
      setEditingChunkId(null);
      setEditContent('');
  };

  const chunks = record.knowledgeChunks || [];
  const displayChunks = isListCollapsed ? chunks.slice(0, 5) : chunks;

  // ... (JSX render structure remains largely the same) ...
  return (
    <div className="h-full w-full flex flex-col md:flex-row gap-6 p-4 overflow-hidden relative">
      {showSchemaError && <SchemaErrorAlert onClose={() => setShowSchemaError(false)} />}
      
      <MedicalHistoryModal 
          isOpen={showHistoryModal} 
          onClose={() => setShowHistoryModal(false)} 
          settings={settings}
          onLoad={(loadedRecord) => {
              onUpdate(loadedRecord);
              addLog(`📂 已加载历史档案，包含 ${loadedRecord.knowledgeChunks.length} 条数据。`);
          }}
      />

      <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                  <h2 className="text-xl font-black font-serif-sc text-slate-800 flex items-center gap-2">
                    <span>📚</span> 病历知识库 (RAG Knowledge Base)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                      共收录 <span className="font-bold">{chunks.length}</span> 条知识片段
                  </p>
              </div>
              <div className="flex gap-2">
                  {isAdminMode && (
                      <>
                        <button 
                            onClick={handleSyncToCloud}
                            className="text-xs text-emerald-600 hover:text-emerald-800 font-bold px-3 py-1.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition flex items-center gap-1 active:scale-95"
                        >
                            <span>☁️</span> 存档到云端
                        </button>
                        <button 
                            onClick={() => setShowHistoryModal(true)}
                            className="text-xs text-slate-600 hover:text-slate-800 font-bold px-3 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 transition flex items-center gap-1"
                        >
                            <span>📂</span> 历史档案
                        </button>
                      </>
                  )}
                  <button 
                    onClick={() => { if(window.confirm('确定清空所有知识库吗？')) onUpdate({...record, knowledgeChunks: []}); }}
                    className="text-xs text-red-400 hover:text-red-600 font-bold px-3 py-1.5 rounded hover:bg-red-50 transition border border-transparent hover:border-red-200"
                  >
                      清空库
                  </button>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 space-y-3 relative">
              {chunks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                      <div className="text-4xl mb-4">📭</div>
                      <p>知识库为空</p>
                      <p className="text-xs mt-2">请在右侧录入病历文本</p>
                  </div>
              ) : (
                  <>
                    {displayChunks.map(chunk => (
                      <div key={chunk.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                          <div className="flex flex-wrap gap-2 mb-2 items-center">
                              {chunk.tags.map(tag => (
                                  <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tag.includes('AI整理') ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                      {tag}
                                  </span>
                              ))}
                              {chunk.embedding ? (
                                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                                      <span>⚡</span> 已向量化
                                  </span>
                              ) : (
                                  <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-1">
                                      <span>🔸</span> 仅文本
                                  </span>
                              )}
                              
                              <div className="ml-auto flex gap-2">
                                  {editingChunkId === chunk.id ? (
                                      <div className="flex gap-2">
                                          <button onClick={handleSaveEdit} className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded">保存</button>
                                          <button onClick={handleCancelEdit} className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded">取消</button>
                                      </div>
                                  ) : (
                                      <button 
                                          onClick={() => handleStartEdit(chunk)}
                                          className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                          ✎ 编辑
                                      </button>
                                  )}
                              </div>
                          </div>
                          
                          {editingChunkId === chunk.id ? (
                              <textarea 
                                  value={editContent}
                                  onChange={(e) => setEditContent(e.target.value)}
                                  className="w-full p-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                  rows={4}
                              />
                          ) : (
                              <p className="text-sm text-slate-700 leading-relaxed font-serif-sc whitespace-pre-wrap">
                                  {chunk.content}
                              </p>
                          )}
                          
                          <div className="text-[10px] text-slate-300 mt-2 font-mono">
                              ID: {chunk.id.slice(0, 8)} • len: {chunk.content.length}
                          </div>
                          <button 
                             onClick={(e) => handleDeleteChunk(chunk.id, e)}
                             className="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10"
                          >
                              ✕
                          </button>
                      </div>
                    ))}
                    
                    {chunks.length > 5 && (
                        <div className="sticky bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-100 via-slate-100/90 to-transparent flex justify-center">
                            <button 
                                onClick={() => setIsListCollapsed(!isListCollapsed)}
                                className="bg-white border border-slate-200 text-slate-600 px-6 py-2 rounded-full shadow-sm hover:shadow-md hover:text-indigo-600 font-bold text-xs transition-all flex items-center gap-2"
                            >
                                {isListCollapsed ? `展开剩余 ${chunks.length - 5} 条...` : '折叠列表'}
                                <span>{isListCollapsed ? '▼' : '▲'}</span>
                            </button>
                        </div>
                    )}
                  </>
              )}
          </div>
      </div>

      {/* Right: Input Area & Console */}
      <div className="w-full md:w-[420px] xl:w-[500px] bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden shrink-0 transition-all">
           {/* ... Input console remains largely same ... */}
           <div className="p-6 bg-indigo-600 text-white flex justify-between items-start">
               <div>
                   <h3 className="font-bold text-lg flex items-center gap-2">
                       <span>📥</span> 极速录入 (Bulk Import)
                   </h3>
                   <p className="text-indigo-200 text-xs mt-1">
                       高性能大批量处理 · 专为 2万+ 字长病历优化
                   </p>
               </div>
               {isProcessing && (
                   <div className="flex flex-col items-end">
                       <span className="text-xs font-mono font-bold">{progress.current}/{progress.total}</span>
                       <span className="text-xs opacity-75">{progress.stage}</span>
                   </div>
               )}
           </div>
           
           <div className="flex-1 flex flex-col min-h-0">
               {isProcessing && (
                   <div className="h-1 w-full bg-indigo-100">
                       <div 
                           className="h-full bg-amber-400 transition-all duration-300 ease-out" 
                           style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                       ></div>
                   </div>
               )}

               <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                   <textarea 
                       value={rawInput}
                       onChange={e => setRawInput(e.target.value)}
                       placeholder="在此粘贴超长病历文本 (支持 20k+ 字)...&#10;系统将自动合并断行并批量向量化。"
                       disabled={isProcessing}
                       className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono leading-relaxed disabled:opacity-50"
                   />
                   
                   <div className="h-40 bg-slate-900 rounded-xl p-3 overflow-y-auto custom-scrollbar border border-slate-800 font-mono text-[10px] leading-relaxed text-emerald-400 shadow-inner">
                       {logs.length === 0 ? (
                           <div className="text-slate-600 italic text-center mt-10">等待任务开始...</div>
                       ) : (
                           logs.map((log, i) => (
                               <div key={i} className="border-b border-white/5 pb-0.5 mb-0.5 last:border-0">{log}</div>
                           ))
                       )}
                       <div ref={logsEndRef} />
                   </div>
               </div>

               <div className="p-4 pt-0">
                   {isProcessing ? (
                        <button 
                            onClick={handleStop}
                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            🛑 停止任务
                        </button>
                   ) : (
                        <button 
                            onClick={handleDecomposeAndStore}
                            disabled={!rawInput.trim()}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                        >
                            <span>🚀</span> 极速存入 (Fast Vectorize)
                        </button>
                   )}
                   <p className="text-[10px] text-slate-400 text-center mt-3">
                       Batch Size: 20 | 自动 OCR 修复 | 智能分段
                   </p>
               </div>
           </div>
      </div>
    </div>
  );
};

export default MedicalRecordManager;