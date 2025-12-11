
import React, { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';
import { MedicalRecord, AISettings, MedicalKnowledgeChunk, LabResult, TreatmentPlanEntry, BloodPressureReading, Patient, CloudChatSession } from '../types';
import { createEmbedding, createEmptyMedicalRecord, generateStructuredMedicalUpdate, extractMedicalRecordStream, extractJsonFromText } from '../services/openaiService';
import { upsertPatient, fetchCloudChatSessions, deleteCloudChatSession } from '../services/supabaseService';

interface Props {
  record: MedicalRecord;
  onUpdate: Dispatch<SetStateAction<MedicalRecord>>;
  onSaveToCloud?: () => Promise<void>;
  isAdminMode?: boolean;
  settings: AISettings;
  activePatient?: Patient | null;
  isVisible?: boolean; 
}

const LS_DRAFT_KEY = "logicmaster_medical_input_draft";
const LS_AUTO_RUN_KEY = "logicmaster_auto_run_import";

// --- Helper: Robust JSON Fixer ---
const tryParseOrFixJson = (jsonStr: string): any => {
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        // Attempt aggressive fixes
        let fixed = jsonStr.trim();
        fixed = fixed.replace(/,\s*([\]}])/g, '$1');
        const openBraces = (fixed.match(/{/g) || []).length;
        const closeBraces = (fixed.match(/}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        
        fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));
        fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
        fixed += '}'.repeat(Math.max(0, openBraces - closeBraces - (fixed.match(/}/g)||[]).length + closeBraces)); 

        try {
            return JSON.parse(fixed);
        } catch (e2) {
            console.warn("JSON fix failed:", e2);
            return null;
        }
    }
};

// --- Helper: Regex Fallback for Vitals ---
const extractVitalsByRegex = (text: string): any[] => {
    const results: any[] = [];
    const bpRegex = /(?:(\d{4}[-./年]\d{1,2}[-./月]\d{1,2}[日]?)|)\s*.*?(?:BP|血压|Bp).*?[:：]?\s*(\d{2,3}\s*[\/／]\s*\d{2,3})\s*(?:mmhg)?(?:\s*[,，]?\s*(?:HR|心率|P).*?[:：]?\s*(\d{2,3}))?/gi;
    
    let match;
    while ((match = bpRegex.exec(text)) !== null) {
        const contextStart = Math.max(0, match.index - 20);
        const contextEnd = Math.min(text.length, match.index + match[0].length + 10);
        const contextStr = text.substring(contextStart, contextEnd);
        
        let location = "";
        if (contextStr.includes("左")) location = "左侧";
        else if (contextStr.includes("右")) location = "右侧";
        
        results.push({
            date: match[1] ? match[1].replace(/[年/.]/g, '-').replace(/[月日]/g, '') : "Unknown",
            reading: match[2].replace(/\s/g, ''),
            heartRate: match[3] || "",
            location: location,
            context: "正则提取兜底"
        });
    }
    return results;
};

// --- Sub-Component: Cloud Archive Modal ---
const CloudRecordArchiveModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    settings: AISettings; 
    onLoad: (record: MedicalRecord) => void;
}> = ({ isOpen, onClose, settings, onLoad }) => {
    const [archives, setArchives] = useState<CloudChatSession[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && settings.supabaseKey) {
            loadArchives();
        }
    }, [isOpen, settings.supabaseKey]);

    const loadArchives = async () => {
        setLoading(true);
        try {
            const allSessions = await fetchCloudChatSessions(settings);
            const records = allSessions.filter(s => s.id.startsWith('medical_record_master_'));
            setArchives(records);
        } catch (e) {
            console.error("Failed to load archives", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm("确定删除此存档吗？")) {
            await deleteCloudChatSession(id, settings);
            setArchives(prev => prev.filter(a => a.id !== id));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><span>📂</span> 电子病历云端存档</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">加载中...</div>
                    ) : archives.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">暂无存档记录</div>
                    ) : (
                        archives.map(arch => (
                            <div 
                                key={arch.id} 
                                onClick={() => { onLoad(arch.medical_record || createEmptyMedicalRecord()); onClose(); }}
                                className="p-4 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer group relative"
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-slate-700 text-sm truncate pr-8">{arch.title}</h4>
                                    <span className="text-[10px] text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-100 whitespace-nowrap">
                                        {new Date(arch.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500 mt-1">
                                    包含了 {(arch.medical_record?.knowledgeChunks || []).length} 条知识片段
                                </div>
                                <button 
                                    onClick={(e) => handleDelete(arch.id, e)}
                                    className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-white text-slate-300 hover:text-red-500 hover:bg-red-50 border border-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                            为了支持电子病历云端存档功能，系统需要在数据库表中追加新的字段。
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

export const MedicalRecordManager: React.FC<Props> = ({ record, onUpdate, onSaveToCloud, isAdminMode, settings, activePatient, isVisible }) => {
  const [rawInput, setRawInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, stage: '' });
  const [logs, setLogs] = useState<string[]>([]);
  
  const [showSchemaError, setShowSchemaError] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showAutoRunToast, setShowAutoRunToast] = useState(false);
  
  // Archive Modal State
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Persistence
  useEffect(() => {
      const draft = localStorage.getItem(LS_DRAFT_KEY);
      if (draft) setRawInput(draft);
  }, []);

  useEffect(() => {
      localStorage.setItem(LS_DRAFT_KEY, rawInput);
  }, [rawInput]);

  useEffect(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // AUTO-SAVE to Patient Profile
  useEffect(() => {
    if (activePatient && record && settings.supabaseKey) {
        const timer = setTimeout(async () => {
            setIsAutoSaving(true);
            try {
                await upsertPatient({ ...activePatient, medical_record: record }, settings);
            } catch (e) { console.error("Auto-save failed", e); } 
            finally { setIsAutoSaving(false); }
        }, 3000);
        return () => clearTimeout(timer);
    }
  }, [record, activePatient]);

  // AUTO-RUN IMPORT
  useEffect(() => {
      if (!isVisible) return; 
      const shouldAutoRun = localStorage.getItem(LS_AUTO_RUN_KEY);
      if (shouldAutoRun === "true") {
          const draft = localStorage.getItem(LS_DRAFT_KEY);
          if (draft && draft.trim()) {
              console.log("[AutoRun] Triggering Seamless Import...");
              localStorage.removeItem(LS_AUTO_RUN_KEY);
              setRawInput(draft);
              setShowAutoRunToast(true);
              setTimeout(() => {
                  handleDecomposeAndStore(draft);
                  setShowAutoRunToast(false);
              }, 800);
          }
      }
  }, [isVisible]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

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
              currentChunk = trimmedPara;
          } else {
              currentChunk += (currentChunk ? "\n" : "") + trimmedPara;
          }
      }
      if (currentChunk.length > MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
      }
      return chunks;
  };

  const handleDecomposeAndStore = async (overrideInput?: string) => {
      if (!settings.apiKey) { alert("错误：请先配置 API Key。"); return; }
      const textToProcess = overrideInput || rawInput;
      if (!textToProcess.trim()) return;

      setIsProcessing(true);
      setLogs([]); 
      setProgress({ current: 0, total: 0, stage: '初始化' });
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
          // STEP 1: Check if input is ALREADY JSON (from Chat Agent) or needs Extraction
          let isJsonImport = false;
          let jsonPayload: any = null;
          
          try {
              jsonPayload = JSON.parse(textToProcess);
              // Simple check if it looks like our structured update payload
              // The new agent returns things like chiefComplaint, historyOfPresentIllness, etc.
              // Or the classic westernReports, etc.
              if (
                  jsonPayload.westernReports || 
                  jsonPayload.tcmTreatments || 
                  jsonPayload.vitalSigns || 
                  jsonPayload.chiefComplaint ||
                  jsonPayload.historyOfPresentIllness
              ) {
                  isJsonImport = true;
                  addLog("🧠 识别到结构化 JSON 数据，直接录入...");
              }
          } catch (e) {}

          // STEP 2: If input is raw text, try to extract structure via AI first
          if (!isJsonImport) {
              addLog("🧠 正在使用 AI 基于现有病历进行增量更新...");
              // Now uses the updated prompt which includes old record context
              const extractedJsonStr = await generateStructuredMedicalUpdate(textToProcess, record, settings);
              try {
                  jsonPayload = JSON.parse(extractedJsonStr);
                  isJsonImport = true;
                  addLog("✅ 增量更新数据生成成功！准备合并...");
              } catch(e) {
                  addLog("⚠️ 结构化提取失败，将仅作为普通文本存储。");
              }
          }

          let textChunks: string[] = [];
          
          if (isJsonImport && jsonPayload) {
              const newRecord = { ...record };
              
              // --- 1. Basic Info & History (Narrative fields overwrite because AI has merged them) ---
              if (jsonPayload.basicInfo && Object.keys(jsonPayload.basicInfo).length > 0) {
                  newRecord.basicInfo = { ...newRecord.basicInfo, ...jsonPayload.basicInfo };
                  // Note: usually don't need to RAG basic info updates unless it changed
              }
              if (jsonPayload.chiefComplaint) {
                  newRecord.chiefComplaint = jsonPayload.chiefComplaint;
                  textChunks.push(`【主诉更新】${jsonPayload.chiefComplaint}`);
              }
              if (jsonPayload.historyOfPresentIllness) {
                  newRecord.historyOfPresentIllness = jsonPayload.historyOfPresentIllness;
                  textChunks.push(`【现病史更新】${jsonPayload.historyOfPresentIllness}`);
              }
              if (jsonPayload.pastHistory) {
                  newRecord.pastHistory = jsonPayload.pastHistory;
                  textChunks.push(`【既往史更新】${jsonPayload.pastHistory}`);
              }
              if (jsonPayload.allergies) {
                  newRecord.allergies = jsonPayload.allergies;
                  textChunks.push(`【过敏史更新】${jsonPayload.allergies}`);
              }

              // --- 2. Symptoms (Overwrite because AI merged them) ---
              if (jsonPayload.currentSymptoms) {
                  const sym = jsonPayload.currentSymptoms;
                  // Merge deep fields if AI only returned partial (though prompt asks for full)
                  newRecord.currentSymptoms = { ...newRecord.currentSymptoms, ...sym };
                  let symText = "【刻下症更新】";
                  Object.entries(sym).forEach(([k, v]) => { if(v) symText += `${k}:${v}; `; });
                  textChunks.push(symText);
              }

              // --- 3. Physical Exam (Tongue/Pulse - Overwrite) ---
              if (jsonPayload.physicalExam) {
                  if (jsonPayload.physicalExam.tongue) {
                      newRecord.physicalExam.tongue = jsonPayload.physicalExam.tongue;
                      textChunks.push(`【舌象更新】${jsonPayload.physicalExam.tongue}`);
                  }
                  if (jsonPayload.physicalExam.pulse) {
                      newRecord.physicalExam.pulse = jsonPayload.physicalExam.pulse;
                      textChunks.push(`【脉象更新】${jsonPayload.physicalExam.pulse}`);
                  }
                  if (jsonPayload.physicalExam.general) {
                      newRecord.physicalExam.general = jsonPayload.physicalExam.general;
                      textChunks.push(`【查体更新】${jsonPayload.physicalExam.general}`);
                  }
              }

              // --- 4. Lists (Aggregated for RAG, Individual for Struct) ---
              
              // A. Western Reports (Labs) - Group by Date
              if (jsonPayload.westernReports?.length) {
                  const labsByDate = new Map<string, string[]>();
                  
                  jsonPayload.westernReports.forEach((item: any) => {
                      // 1. Structured Store (Keep Atomic)
                      const lab: LabResult = { id: `lab-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], item: item.item || '项目', result: item.result || '' };
                      newRecord.auxExams.labResults.push(lab);
                      
                      // 2. Prepare for Aggregation
                      if (!labsByDate.has(lab.date)) labsByDate.set(lab.date, []);
                      labsByDate.get(lab.date)!.push(`${lab.item}: ${lab.result}`);
                  });

                  // 3. Generate Aggregated Text Chunk
                  labsByDate.forEach((items, date) => {
                      textChunks.push(`【检查报告】${date} 汇总:\n${items.join('; ')}`);
                  });
                  addLog(`📊 录入 ${jsonPayload.westernReports.length} 条新检验报告`);
              }

              // B. TCM Treatments - Usually one per day, but safe to group
              if (jsonPayload.tcmTreatments?.length) {
                  const plansByDate = new Map<string, string[]>();
                  
                  jsonPayload.tcmTreatments.forEach((item: any) => {
                      // 1. Structured Store
                      const plan: TreatmentPlanEntry = { id: `plan-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], plan: item.plan || item.prescription || '' };
                      newRecord.diagnosis.treatmentPlans.push(plan);
                      
                      // 2. Prepare
                      if (!plansByDate.has(plan.date)) plansByDate.set(plan.date, []);
                      plansByDate.get(plan.date)!.push(plan.plan);
                  });
                  
                  // 3. Generate
                  plansByDate.forEach((items, date) => {
                      textChunks.push(`【中医方案】${date}:\n${items.join('\n')}`);
                  });
                  addLog(`🌿 录入 ${jsonPayload.tcmTreatments.length} 条新中医方案`);
              }

              // C. Vital Signs (Vitals) - Group by Date (Requested Feature)
              if (jsonPayload.vitalSigns?.length) {
                  const vitalsByDate = new Map<string, string[]>();

                  jsonPayload.vitalSigns.forEach((item: any) => {
                      // 1. Structured Store
                      const bp: BloodPressureReading = { id: `vital-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], reading: item.reading || '', heartRate: item.heartRate || '', context: `${item.type || ''} ${item.context || ''}`.trim() };
                      newRecord.physicalExam.bloodPressureReadings.push(bp);
                      
                      // 2. Prepare for Aggregation
                      const detail = `${bp.context ? bp.context + ' ' : ''}${bp.reading}${bp.heartRate ? ' (HR:'+bp.heartRate+')' : ''}`;
                      if (!vitalsByDate.has(bp.date)) vitalsByDate.set(bp.date, []);
                      vitalsByDate.get(bp.date)!.push(detail);
                  });

                  // 3. Generate Aggregated Text Chunk
                  vitalsByDate.forEach((items, date) => {
                      textChunks.push(`【体征追踪】${date} 监测记录:\n${items.join('; ')}`);
                  });
                  addLog(`❤️ 录入 ${jsonPayload.vitalSigns.length} 条新体征数据`);
              }
              
              onUpdate(newRecord); // Update structured UI immediately
              addLog("✅ 结构化数据已合并到当前界面。");
          } 
          
          if (!isJsonImport) {
              addLog("📄 执行全文向量化...");
              textChunks = smartTextSplitter(textToProcess);
          }

          // STEP 3: Vectorization (RAG) - Only if we have text chunks generated
          if (textChunks.length > 0) {
              const total = textChunks.length;
              addLog(`⚡ 生成 ${total} 个更新片段，存入向量库...`);
              const newChunks: MedicalKnowledgeChunk[] = [];
              const BATCH_SIZE = 20; 
              
              for (let i = 0; i < total; i += BATCH_SIZE) {
                  if (controller.signal.aborted) break;
                  const batch = textChunks.slice(i, i + BATCH_SIZE);
                  let batchEmbeddings: number[][] = [];
                  try {
                      const result = await createEmbedding(batch, settings);
                      if (result) batchEmbeddings = Array.isArray(result[0]) ? result as number[][] : [result as any];
                  } catch (err) { addLog(`⚠️ 向量化跳过部分片段`); }
                  
                  batch.forEach((text, idx) => {
                      newChunks.push({
                          id: `chunk-${Date.now()}-${i + idx}`,
                          content: text,
                          tags: isJsonImport ? ['AI更新', '结构化'] : ['手动导入'], 
                          embedding: batchEmbeddings[idx], 
                          sourceType: isJsonImport ? 'import' : 'manual',
                          createdAt: Date.now()
                      });
                  });
                  setProgress({ current: Math.min(i + BATCH_SIZE, total), total: total, stage: '向量化中' });
              }
              
              // Merge chunks
              onUpdate((prev) => ({ ...prev, knowledgeChunks: [...prev.knowledgeChunks, ...newChunks] }));
              addLog(`🎉 完成！病历已更新并归档。`);
          } else {
             if (isJsonImport) addLog("⚠️ 没有生成新的文本片段 (可能是纯数据更新)。");
          }
          
          setRawInput(''); 
          localStorage.removeItem(LS_DRAFT_KEY);

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
          addLog("☁️ 请求手动备份...");
          try { 
              await onSaveToCloud(); 
              addLog("✅ 备份成功！");
          } 
          catch(e: any) { 
              if (String(e).includes("SCHEMA_ERROR")) setShowSchemaError(true);
              else addLog(`❌ 同步失败: ${e.message}`); 
          }
      }
  };

  const handleDeleteChunk = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onUpdate({ ...record, knowledgeChunks: record.knowledgeChunks.filter(c => c.id !== id) });
  };
  const handleStartEdit = (chunk: MedicalKnowledgeChunk) => { setEditingChunkId(chunk.id); setEditContent(chunk.content); };
  const handleSaveEdit = () => { if (!editingChunkId) return; onUpdate({ ...record, knowledgeChunks: record.knowledgeChunks.map(c => c.id === editingChunkId ? { ...c, content: editContent, tags: [...c.tags, '已编辑'], embedding: undefined } : c) }); setEditingChunkId(null); setEditContent(''); };
  
  const renderEmptyState = (text: string) => (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 min-h-[300px]">
          <div className="text-4xl opacity-50">📭</div>
          <div className="text-sm font-bold">{text}</div>
          <p className="text-xs max-w-xs text-center opacity-70">
              请在“AI 问答”界面发送病历文本，并点击右上角的【整理】按钮自动录入。
          </p>
      </div>
  );

  return (
    <div className="h-full w-full flex flex-col md:flex-row gap-6 p-4 overflow-hidden relative">
      {showSchemaError && <SchemaErrorAlert onClose={() => setShowSchemaError(false)} />}
      <CloudRecordArchiveModal 
          isOpen={showArchiveModal} 
          onClose={() => setShowArchiveModal(false)} 
          settings={settings} 
          onLoad={(rec) => { onUpdate(rec); addLog("☁️ 已加载云端病历存档"); }} 
      />
      {showAutoRunToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span className="font-bold">收到 AI 整理数据，正在执行分流录入...</span>
          </div>
      )}

      {/* Main Content Area - Knowledge Base Only (Dashboard removed) */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden order-2 md:order-1">
          {/* Main Header */}
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <span className="text-2xl">📚</span> RAG 知识库
                  </h3>
                  {activePatient && (
                      <div className="flex items-center gap-2">
                          <span className="text-xs font-sans font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hidden md:inline-block font-bold">{activePatient.name}</span>
                          {isAutoSaving ? (
                              <span className="text-xs text-emerald-600 font-bold animate-pulse flex items-center gap-1">
                                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> 自动同步中...
                              </span>
                          ) : (
                              <span className="text-[10px] text-slate-400">已自动同步至云端</span>
                          )}
                      </div>
                  )}
              </div>
              <div className="flex gap-2">
                  {!activePatient && (
                      <button onClick={() => setShowArchiveModal(true)} className="text-xs text-indigo-600 font-bold px-3 py-1.5 rounded border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-1">
                          <span>📂</span> 历史
                      </button>
                  )}
                  {/* Manual Backup Button - Always show for reassurance, even if auto-save exists */}
                  {settings.supabaseKey && (
                      <button onClick={handleSyncToCloud} className="text-xs text-emerald-600 font-bold px-3 py-1.5 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1">
                          <span>☁️</span> 手动备份
                      </button>
                  )}
                  <button onClick={() => { if(window.confirm('确定清空所有记录吗？')) onUpdate(createEmptyMedicalRecord()); }} className="text-xs text-red-400 hover:text-red-600 font-bold px-3 py-1.5 rounded hover:bg-red-50">清空</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
              <div className="h-full overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 space-y-3">
                 {record.knowledgeChunks.length === 0 ? (
                     renderEmptyState("知识库为空")
                 ) : (
                     record.knowledgeChunks.map(chunk => (
                         <div key={chunk.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                             <div className="flex flex-wrap gap-2 mb-2 items-center">
                                 {chunk.tags.map(tag => (
                                     <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tag.includes('结构化') ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>{tag}</span>
                                 ))}
                                 {chunk.embedding ? <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">⚡ 已向量化</span> : <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">🔸 仅文本</span>}
                                 <button onClick={() => { setEditingChunkId(chunk.id); setEditContent(chunk.content); }} className="ml-auto text-[10px] font-bold text-indigo-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">✎ 编辑</button>
                             </div>
                             {editingChunkId === chunk.id ? (
                                 <div className="space-y-2"><textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm outline-none shadow-inner" rows={4}/><div className="flex gap-2 justify-end"><button onClick={() => setEditingChunkId(null)} className="text-xs px-2 py-1 rounded bg-slate-100">取消</button><button onClick={handleSaveEdit} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white">保存</button></div></div>
                             ) : (
                                 <p className="text-sm text-slate-700 leading-relaxed font-serif-sc whitespace-pre-wrap">{chunk.content}</p>
                             )}
                             <button onClick={(e) => handleDeleteChunk(chunk.id, e)} className="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10">✕</button>
                         </div>
                     ))
                 )}
              </div>
          </div>
      </div>

      {/* Fast Entry Sidebar */}
      <div className="w-full md:w-[400px] bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden shrink-0 order-1 md:order-2">
           <div className="p-6 bg-indigo-600 text-white flex justify-between items-start">
               <div>
                   <h3 className="font-bold text-lg flex items-center gap-2"><span>📥</span> 极速录入 (AI Import)</h3>
                   <p className="text-indigo-200 text-xs mt-1">智能识别文本 → 自动分流到三大板块</p>
               </div>
               {isProcessing && <div className="text-xs font-mono font-bold">{progress.current}/{progress.total}</div>}
           </div>
           
           <div className="flex-1 flex flex-col min-h-0">
               {isProcessing && <div className="h-1 w-full bg-indigo-100"><div className="h-full bg-amber-400 transition-all duration-300 ease-out" style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}></div></div>}
               <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                   <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="在此粘贴任意格式的病历文本。系统会自动提取：&#10;- 主诉/现病史/既往史&#10;- 血压/心率/体征&#10;- 检验报告/中医处方&#10;并生成向量知识库..." disabled={isProcessing} className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono leading-relaxed disabled:opacity-50" />
                   <div className="h-32 bg-slate-900 rounded-xl p-3 overflow-y-auto custom-scrollbar border border-slate-800 font-mono text-[10px] leading-relaxed text-emerald-400 shadow-inner">
                       {logs.length === 0 ? <div className="text-slate-600 italic text-center mt-8">等待开始...</div> : logs.map((log, i) => <div key={i} className="border-b border-white/5 pb-0.5 mb-0.5">{log}</div>)}
                       <div ref={logsEndRef} />
                   </div>
               </div>
               <div className="p-4 pt-0">
                   {isProcessing ? (
                        <button onClick={handleStop} className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition-all">🛑 停止任务</button>
                   ) : (
                        <button onClick={() => handleDecomposeAndStore()} disabled={!rawInput.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"><span>🚀</span> 智能识别并录入</button>
                   )}
               </div>
           </div>
      </div>
    </div>
  );
};
