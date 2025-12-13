
import React, { useState, useEffect } from 'react';
import { MedicalRecord, AISettings } from '../types';
import { upsertPatient } from '../services/supabaseService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  record: MedicalRecord;
  onUpdate: (record: MedicalRecord) => void;
  settings: AISettings;
  activePatient?: any;
}

export const MedicalContextModal: React.FC<Props> = ({ isOpen, onClose, record, onUpdate, settings, activePatient }) => {
  const [text, setText] = useState(record.fullText || "");
  const [name, setName] = useState(record.basicInfo?.name || "");
  const [gender, setGender] = useState(record.basicInfo?.gender || "");
  const [age, setAge] = useState(record.basicInfo?.age || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
      if (isOpen) {
          setText(record.fullText || "");
          setName(record.basicInfo?.name || "");
          setGender(record.basicInfo?.gender || "");
          setAge(record.basicInfo?.age || "");
      }
  }, [isOpen, record]);

  const handleSave = async () => {
      setIsSaving(true);
      const updatedRecord: MedicalRecord = {
          ...record,
          fullText: text,
          basicInfo: {
              name,
              gender,
              age
          },
          knowledgeChunks: [] // Clear chunks to ensure we use fullText mode
      };

      onUpdate(updatedRecord);

      // Auto-save to cloud if patient is active
      if (activePatient && settings.supabaseKey) {
          try {
              await upsertPatient({
                  ...activePatient,
                  name: name || activePatient.name,
                  gender: gender || activePatient.gender,
                  age: age || activePatient.age,
                  medical_record: updatedRecord
              }, settings);
          } catch (e) {
              console.error("Cloud save failed", e);
          }
      }

      setIsSaving(false);
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-4xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6 flex justify-between items-center shrink-0 text-white">
           <div className="flex items-center gap-3">
             <span className="text-2xl">📋</span>
             <div>
               <h3 className="text-xl font-bold">完整病历管理 (Full Medical Record)</h3>
               <p className="text-indigo-100 text-xs mt-1">直接粘贴所有病历文本，AI 将读取完整上下文</p>
             </div>
           </div>
           <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition">✕</button>
        </div>

        <div className="flex-1 flex flex-col p-6 bg-slate-50 gap-4 overflow-hidden">
            
            {/* Basic Info Bar */}
            <div className="flex gap-4 bg-white p-4 rounded-xl border border-slate-200 shrink-0">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">姓名</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full font-bold text-slate-800 border-b border-slate-200 focus:border-indigo-500 outline-none pb-1" placeholder="患者姓名" />
                </div>
                <div className="w-24">
                    <label className="block text-xs font-bold text-slate-500 mb-1">性别</label>
                    <input type="text" value={gender} onChange={e => setGender(e.target.value)} className="w-full text-slate-800 border-b border-slate-200 focus:border-indigo-500 outline-none pb-1" placeholder="男/女" />
                </div>
                <div className="w-24">
                    <label className="block text-xs font-bold text-slate-500 mb-1">年龄</label>
                    <input type="text" value={age} onChange={e => setAge(e.target.value)} className="w-full text-slate-800 border-b border-slate-200 focus:border-indigo-500 outline-none pb-1" placeholder="岁" />
                </div>
            </div>

            {/* Full Text Area */}
            <div className="flex-1 flex flex-col relative bg-white rounded-xl border border-slate-200 shadow-inner overflow-hidden">
                <div className="absolute top-0 left-0 right-0 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-500 border-b border-slate-200 flex justify-between items-center">
                    <span>病历详细内容 (支持 Markdown / 纯文本)</span>
                    <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-500">已输入 {text.length} 字</span>
                </div>
                <textarea 
                    value={text} 
                    onChange={(e) => setText(e.target.value)} 
                    className="flex-1 w-full p-6 pt-10 resize-none outline-none font-mono text-sm leading-relaxed text-slate-800"
                    placeholder="在此处粘贴完整的病历信息...&#10;包含：主诉、现病史、既往史、检查报告、当前处方等。&#10;AI 将会读取这里的全部内容进行分析，无需分段。" 
                />
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex justify-between items-center shrink-0">
            <div className="text-xs text-slate-400">
                {activePatient ? `修改将自动同步至患者: ${activePatient.name}` : '未关联患者 (仅本地暂存)'}
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-5 py-2 rounded-lg text-slate-500 font-bold hover:bg-slate-100 transition">取消</button>
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-8 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition flex items-center gap-2"
                >
                    {isSaving ? <span className="animate-spin">⏳</span> : <span>💾</span>}
                    {isSaving ? '保存中...' : '保存并生效'}
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
