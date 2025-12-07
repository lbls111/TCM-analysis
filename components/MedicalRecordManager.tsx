
import React, { useState, useEffect, useRef } from 'react';
import { MedicalRecord, AISettings, MedicalKnowledgeChunk, LabResult, TreatmentPlanEntry, BloodPressureReading, Patient } from '../types';
import { createEmbedding, createEmptyMedicalRecord, generateStructuredMedicalUpdate, extractMedicalRecordStream } from '../services/openaiService';
import { upsertPatient } from '../services/supabaseService';

interface Props {
  record: MedicalRecord;
  onUpdate: (record: MedicalRecord) => void;
  onSaveToCloud?: () => Promise<void>;
  isAdminMode?: boolean;
  settings: AISettings;
  activePatient?: Patient | null;
  isVisible?: boolean; 
}

const LS_DRAFT_KEY = "logicmaster_medical_input_draft";
const LS_AUTO_RUN_KEY = "logicmaster_auto_run_import";

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
  
  // Tabs State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'knowledge'>('dashboard');
  const [dashboardSection, setDashboardSection] = useState<'timeline' | 'vitals' | 'western' | 'tcm'>('timeline');

  const [showSchemaError, setShowSchemaError] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showAutoRunToast, setShowAutoRunToast] = useState(false);
  const [isDeepExtracting, setIsDeepExtracting] = useState(false);
  const [deepExtractProgress, setDeepExtractProgress] = useState('');
  
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const deepExtractAbortControllerRef = useRef<AbortController | null>(null);
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

  const handleStopDeepExtraction = () => {
      if (deepExtractAbortControllerRef.current) {
          deepExtractAbortControllerRef.current.abort();
          deepExtractAbortControllerRef.current = null;
          addLog("🛑 用户手动停止深度提取");
          setIsDeepExtracting(false);
          setDeepExtractProgress('');
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

  // === NEW: Single-Shot Fast Extraction ===
  const handleFastExtraction = async () => {
      if (record.knowledgeChunks.length === 0) {
          alert("知识库为空，无法进行提取。");
          return;
      }
      if (!settings.apiKey) {
          alert("请先配置 API Key");
          return;
      }

      setIsDeepExtracting(true);
      setDeepExtractProgress('连接 AI...');
      
      const controller = new AbortController();
      deepExtractAbortControllerRef.current = controller;

      // Combine all text (Limit to 40k chars for safety, usually covers entire history)
      const allText = record.knowledgeChunks.map(c => c.content).join('\n\n').slice(0, 40000);
      const newRecord = JSON.parse(JSON.stringify(record));
      
      let receivedBytes = 0;
      let rawJsonBuffer = "";

      try {
          addLog(`🚀 启动极速全量扫描 (Context: ${allText.length} chars)...`);
          
          // Use Streaming to keep connection alive and bypass browser timeouts
          for await (const chunk of extractMedicalRecordStream(allText, settings, controller.signal)) {
              rawJsonBuffer += chunk;
              receivedBytes += chunk.length;
              setDeepExtractProgress(`接收数据中... (${(receivedBytes/1024).toFixed(1)} KB)`);
          }

          addLog(`⚡ 数据接收完成，正在解析 JSON...`);
          
          // Extract JSON from potential Markdown wrappers
          const jsonStr = rawJsonBuffer.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || 
                          (rawJsonBuffer.includes('{') ? rawJsonBuffer.substring(rawJsonBuffer.indexOf('{'), rawJsonBuffer.lastIndexOf('}') + 1) : "{}");
          
          let jsonPayload: any = {};
          try {
              jsonPayload = JSON.parse(jsonStr);
          } catch (e) {
              console.warn("JSON Parse Failed, trying simplified clean...");
              // Fallback: try to clean common issues
              try { jsonPayload = JSON.parse(jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')); } catch(e2) {}
          }

          let updateCount = 0;
          if (jsonPayload.westernReports?.length) {
              jsonPayload.westernReports.forEach((item: any) => {
                  newRecord.auxExams.labResults.push({ id: `lab-fast-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], item: item.item, result: item.result });
              });
              updateCount += jsonPayload.westernReports.length;
          }
          if (jsonPayload.tcmTreatments?.length) {
              jsonPayload.tcmTreatments.forEach((item: any) => {
                  newRecord.diagnosis.treatmentPlans.push({ id: `plan-fast-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], plan: item.plan });
              });
              updateCount += jsonPayload.tcmTreatments.length;
          }
          if (jsonPayload.vitalSigns?.length) {
              jsonPayload.vitalSigns.forEach((item: any) => {
                  newRecord.physicalExam.bloodPressureReadings.push({ id: `vital-fast-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], reading: item.reading, heartRate: '', context: `${item.type || ''} ${item.context || ''}`.trim() });
              });
              updateCount += jsonPayload.vitalSigns.length;
          }

          if (updateCount > 0) {
              onUpdate(newRecord);
              addLog(`🎉 极速提取完成！共发现 ${updateCount} 条结构化数据。`);
          } else {
              addLog("⚠️ 提取完成，但未发现符合格式的数据。");
          }

      } catch (e: any) {
          if (e.name === 'AbortError') {
              addLog("🛑 用户中断了扫描。");
          } else {
              addLog(`❌ 提取出错: ${e.message}`);
              console.error(e);
          }
      } finally {
          setIsDeepExtracting(false);
          setDeepExtractProgress('');
          deepExtractAbortControllerRef.current = null;
      }
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
              if (jsonPayload.westernReports || jsonPayload.tcmTreatments || jsonPayload.vitalSigns) {
                  isJsonImport = true;
                  addLog("🧠 识别到结构化 JSON 数据，直接录入...");
              }
          } catch (e) {}

          // STEP 2: If input is raw text, try to extract structure via AI first
          if (!isJsonImport) {
              addLog("🧠 正在使用 AI 提取结构化数据 (血压/检验/处方)...");
              const extractedJsonStr = await generateStructuredMedicalUpdate(textToProcess, record, settings);
              try {
                  jsonPayload = JSON.parse(extractedJsonStr);
                  isJsonImport = true;
                  addLog("✅ 结构化提取成功！准备分流数据...");
              } catch(e) {
                  addLog("⚠️ 结构化提取失败，将仅作为普通文本存储。");
              }
          }

          let textChunks: string[] = [];
          
          if (isJsonImport && jsonPayload) {
              const newRecord = { ...record };
              
              if (jsonPayload.westernReports?.length) {
                  jsonPayload.westernReports.forEach((item: any) => {
                      const lab: LabResult = { id: `lab-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], item: item.item || '项目', result: item.result || '' };
                      newRecord.auxExams.labResults.push(lab);
                      textChunks.push(`【检查】${lab.date} ${lab.item}: ${lab.result}`);
                  });
                  addLog(`📊 录入 ${jsonPayload.westernReports.length} 条检验报告`);
              }

              if (jsonPayload.tcmTreatments?.length) {
                  jsonPayload.tcmTreatments.forEach((item: any) => {
                      const plan: TreatmentPlanEntry = { id: `plan-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], plan: item.plan || '' };
                      newRecord.diagnosis.treatmentPlans.push(plan);
                      textChunks.push(`【中医】${plan.date} 方案: ${plan.plan}`);
                  });
                  addLog(`🌿 录入 ${jsonPayload.tcmTreatments.length} 条中医方案`);
              }

              if (jsonPayload.vitalSigns?.length) {
                  jsonPayload.vitalSigns.forEach((item: any) => {
                      const bp: BloodPressureReading = { id: `vital-${Date.now()}-${Math.random()}`, date: item.date || new Date().toISOString().split('T')[0], reading: item.reading || '', heartRate: '', context: `${item.type || ''} ${item.context || ''}`.trim() };
                      newRecord.physicalExam.bloodPressureReadings.push(bp);
                      textChunks.push(`【体征】${bp.date} ${bp.context}: ${bp.reading}`);
                  });
                  addLog(`❤️ 录入 ${jsonPayload.vitalSigns.length} 条体征数据`);
              }
              onUpdate(newRecord); // Update structured UI immediately
          } 
          
          if (!isJsonImport) {
              addLog("📄 执行全文向量化...");
              textChunks = smartTextSplitter(textToProcess);
          }

          // STEP 3: Vectorization (RAG)
          if (textChunks.length > 0) {
              const total = textChunks.length;
              addLog(`⚡ 生成 ${total} 个知识片段，存入向量库...`);
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
                          tags: isJsonImport ? ['AI提取', '结构化'] : ['手动导入'], 
                          embedding: batchEmbeddings[idx], 
                          sourceType: isJsonImport ? 'import' : 'manual',
                          createdAt: Date.now()
                      });
                  });
                  setProgress({ current: Math.min(i + BATCH_SIZE, total), total: total, stage: '向量化中' });
              }
              
              // Merge chunks
              onUpdate(prev => ({ ...prev, knowledgeChunks: [...prev.knowledgeChunks, ...newChunks] }));
              addLog(`🎉 完成！结构化数据已归档，知识库已更新。`);
          } else {
             addLog("✅ 结构化数据已录入 (无新增文本片段)。");
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
          addLog("☁️ 请求同步云端...");
          try { await onSaveToCloud(); } 
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
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-3">
          <div className="text-3xl opacity-50">📭</div>
          <div className="text-sm">{text}</div>
          {record.knowledgeChunks.length > 0 && (
              <div className="mt-2 flex flex-col items-center gap-2">
                  <button 
                      onClick={isDeepExtracting ? handleStopDeepExtraction : handleFastExtraction}
                      className={`text-xs px-4 py-2 rounded-full border flex items-center gap-2 font-bold transition-all shadow-sm ${
                          isDeepExtracting 
                          ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' 
                          : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                      }`}
                  >
                      {isDeepExtracting ? <span className="animate-spin">🛑</span> : <span>⚡</span>}
                      {isDeepExtracting ? '停止' : '一键全量提取 (Fast)'}
                  </button>
                  {isDeepExtracting && deepExtractProgress && (
                      <span className="text-[10px] text-indigo-500 font-mono animate-pulse">{deepExtractProgress}</span>
                  )}
              </div>
          )}
      </div>
  );

  const renderTimeline = () => {
    // Combine all events
    const events: { date: string, type: string, content: string, sub: string, color: string }[] = [];
    
    record.physicalExam.bloodPressureReadings.forEach(bp => events.push({
        date: bp.date, type: '体征', content: bp.reading, sub: bp.context || '常规测量', color: 'border-rose-400 bg-rose-50 text-rose-700'
    }));
    record.auxExams.labResults.forEach(lab => events.push({
        date: lab.date, type: '检查', content: lab.item, sub: lab.result, color: 'border-blue-400 bg-blue-50 text-blue-700'
    }));
    record.diagnosis.treatmentPlans.forEach(plan => events.push({
        date: plan.date, type: '中医', content: '中医诊疗方案', sub: plan.plan, color: 'border-emerald-400 bg-emerald-50 text-emerald-700'
    }));

    // Sort descending by date
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (events.length === 0) return renderEmptyState("暂无历史数据记录");

    return (
        <div className="space-y-6 pl-4 border-l-2 border-slate-200 ml-4 py-4 relative">
            {events.map((evt, i) => (
                <div key={i} className="relative animate-in slide-in-from-left-2 duration-300">
                    <div className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm box-content ${evt.color.split(' ')[0].replace('border-', 'bg-')}`}></div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-black text-slate-500 font-mono">{evt.date}</span>
                        <span className={`text-[10px] font-bold px-1.5 rounded ${evt.color.split(' ')[1]} ${evt.color.split(' ')[2]}`}>{evt.type}</span>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm hover:shadow-md transition-shadow">
                        <div className="font-bold text-slate-800">{evt.content}</div>
                        <div className="text-slate-500 mt-1 text-xs leading-relaxed whitespace-pre-wrap">{evt.sub}</div>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  const renderDashboard = () => {
      return (
          <div className="h-full flex flex-col bg-slate-50/50">
             <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
                 <button onClick={() => setDashboardSection('timeline')} className={`flex-1 py-3 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${dashboardSection === 'timeline' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>📅 综合时间轴</button>
                 <button onClick={() => setDashboardSection('vitals')} className={`flex-1 py-3 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${dashboardSection === 'vitals' ? 'border-rose-500 text-rose-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>❤️ 体征</button>
                 <button onClick={() => setDashboardSection('western')} className={`flex-1 py-3 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${dashboardSection === 'western' ? 'border-blue-500 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>🧪 检查</button>
                 <button onClick={() => setDashboardSection('tcm')} className={`flex-1 py-3 px-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${dashboardSection === 'tcm' ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>🌿 中医</button>
             </div>
             
             <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                 {dashboardSection === 'timeline' && renderTimeline()}
                 
                 {dashboardSection === 'vitals' && (
                     <div className="space-y-4">
                         {record.physicalExam.bloodPressureReadings.length === 0 ? renderEmptyState("暂无体征数据") : (
                             record.physicalExam.bloodPressureReadings.map((bp, i) => (
                                 <div key={i} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                                     <div>
                                         <div className="text-xs text-slate-400 font-bold">{bp.date}</div>
                                         <div className="text-sm font-bold text-slate-700 mt-1">{bp.context || '常规测量'}</div>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-xl font-black text-rose-600 font-mono">{bp.reading}</div>
                                         <div className="text-xs text-slate-400">{bp.heartRate ? `HR: ${bp.heartRate}` : 'mmHg'}</div>
                                     </div>
                                 </div>
                             ))
                         )}
                     </div>
                 )}
                 {dashboardSection === 'western' && (
                     <div className="space-y-3">
                         {record.auxExams.labResults.length === 0 ? renderEmptyState("暂无检查报告") : (
                             record.auxExams.labResults.map((lab, i) => (
                                 <div key={i} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm text-sm">
                                     <div className="flex justify-between mb-1">
                                         <span className="font-bold text-slate-700">{lab.item}</span>
                                         <span className="text-xs font-mono text-slate-400">{lab.date}</span>
                                     </div>
                                     <div className="text-slate-600 bg-slate-50 p-2 rounded">{lab.result}</div>
                                 </div>
                             ))
                         )}
                     </div>
                 )}
                 {dashboardSection === 'tcm' && (
                     <div className="space-y-6 pl-4 border-l-2 border-emerald-100 ml-2 py-2">
                         {record.diagnosis.treatmentPlans.length === 0 ? renderEmptyState("暂无中医方案") : (
                             record.diagnosis.treatmentPlans.map((plan, i) => (
                                 <div key={i} className="relative">
                                     <div className="absolute -left-[21px] top-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm"></div>
                                     <div className="text-xs font-bold text-emerald-600 mb-1">{plan.date}</div>
                                     <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm text-sm text-slate-700 leading-relaxed">
                                         {plan.plan}
                                     </div>
                                 </div>
                             ))
                         )}
                     </div>
                 )}
             </div>
          </div>
      );
  };

  return (
    <div className="h-full w-full flex flex-col md:flex-row gap-6 p-4 overflow-hidden relative">
      {showSchemaError && <SchemaErrorAlert onClose={() => setShowSchemaError(false)} />}
      {showAutoRunToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-indigo-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-in slide-in-from-top-4 fade-in">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span className="font-bold">收到 AI 整理数据，正在执行分流录入...</span>
          </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden order-2 md:order-1">
          {/* Main Header */}
          <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                  <div className="flex gap-1 bg-slate-200/50 p-1 rounded-lg">
                      <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>全览看板</button>
                      <button onClick={() => setActiveTab('knowledge')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'knowledge' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>RAG 知识库</button>
                  </div>
                  {activePatient && <span className="text-xs font-sans font-normal bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hidden md:inline-block">{activePatient.name}</span>}
                  {isAutoSaving && <span className="text-xs text-indigo-500 animate-pulse">☁️ 同步中...</span>}
              </div>
              <div className="flex gap-2">
                  {isAdminMode && !activePatient && (
                      <button onClick={handleSyncToCloud} className="text-xs text-emerald-600 font-bold px-3 py-1.5 rounded border border-emerald-200 bg-emerald-50">
                          <span>☁️</span> 存档
                      </button>
                  )}
                  <button onClick={() => { if(window.confirm('确定清空所有记录吗？')) onUpdate(createEmptyMedicalRecord()); }} className="text-xs text-red-400 hover:text-red-600 font-bold px-3 py-1.5 rounded hover:bg-red-50">清空</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-hidden relative">
              {activeTab === 'dashboard' ? renderDashboard() : (
                  <div className="h-full overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 space-y-3">
                     {record.knowledgeChunks.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center text-slate-400">
                             <div className="text-4xl mb-4">📭</div>
                             <p>知识库为空</p>
                         </div>
                     ) : (
                         record.knowledgeChunks.map(chunk => (
                             <div key={chunk.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative">
                                 <div className="flex flex-wrap gap-2 mb-2 items-center">
                                     {chunk.tags.map(tag => (
                                         <span key={tag} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tag.includes('结构化') ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>{tag}</span>
                                     ))}
                                     {chunk.embedding ? <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100">⚡ 已向量化</span> : <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full border border-amber-100">🔸 仅文本</span>}
                                     <button onClick={() => setEditingChunkId(chunk.id) || setEditContent(chunk.content)} className="ml-auto text-[10px] font-bold text-indigo-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">✎ 编辑</button>
                                 </div>
                                 {editingChunkId === chunk.id ? (
                                     <div className="space-y-2"><textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="w-full p-2 border border-indigo-200 rounded-lg text-sm outline-none" rows={4}/><div className="flex gap-2 justify-end"><button onClick={() => setEditingChunkId(null)} className="text-xs px-2 py-1 rounded bg-slate-100">取消</button><button onClick={handleSaveEdit} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white">保存</button></div></div>
                                 ) : (
                                     <p className="text-sm text-slate-700 leading-relaxed font-serif-sc whitespace-pre-wrap">{chunk.content}</p>
                                 )}
                                 <button onClick={(e) => handleDeleteChunk(chunk.id, e)} className="absolute top-2 right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 z-10">✕</button>
                             </div>
                         ))
                     )}
                  </div>
              )}
          </div>
      </div>

      {/* Fast Entry Sidebar */}
      <div className="w-full md:w-[400px] bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden shrink-0 order-1 md:order-2">
           <div className="p-6 bg-indigo-600 text-white flex justify-between items-start">
               <div>
                   <h3 className="font-bold text-lg flex items-center gap-2"><span>📥</span> 极速录入 (AI Import)</h3>
                   <p className="text-indigo-200 text-xs mt-1">智能识别文本 -> 自动分流到三大板块</p>
               </div>
               {isProcessing && <div className="text-xs font-mono font-bold">{progress.current}/{progress.total}</div>}
           </div>
           
           <div className="flex-1 flex flex-col min-h-0">
               {isProcessing && <div className="h-1 w-full bg-indigo-100"><div className="h-full bg-amber-400 transition-all duration-300 ease-out" style={{ width: progress.total ? `${(progress.current / progress.total) * 100}%` : '0%' }}></div></div>}
               <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                   <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="在此粘贴任意格式的病历文本。系统会自动提取：&#10;- 血压/心率&#10;- 检验报告&#10;- 中医处方&#10;并生成向量知识库..." disabled={isProcessing} className="flex-1 w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none resize-none font-mono leading-relaxed disabled:opacity-50" />
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
