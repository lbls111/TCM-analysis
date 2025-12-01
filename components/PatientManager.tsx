
import React, { useState, useEffect } from 'react';
import { Patient, AISettings } from '../types';
import { fetchPatients, upsertPatient, deletePatient } from '../services/supabaseService';
import { createEmptyMedicalRecord } from '../services/openaiService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AISettings;
  activePatient: Patient | null;
  onSelectPatient: (patient: Patient | null) => void;
  onPatientUpdated?: () => void; // Trigger refresh
}

export const PatientManager: React.FC<Props> = ({ isOpen, onClose, settings, activePatient, onSelectPatient, onPatientUpdated }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [view, setView] = useState<'list' | 'create'>('list');
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientGender, setNewPatientGender] = useState('男');
  const [newPatientAge, setNewPatientAge] = useState('');
  const [showSqlError, setShowSqlError] = useState(false);

  useEffect(() => {
    if (isOpen && settings.supabaseKey) {
      loadPatients();
    }
  }, [isOpen, settings.supabaseKey]);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const data = await fetchPatients(settings);
      setPatients(data);
    } catch (e) {
        console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
      if (!newPatientName.trim()) return;
      setLoading(true);
      
      const emptyRecord = createEmptyMedicalRecord();
      emptyRecord.basicInfo.name = newPatientName;
      emptyRecord.basicInfo.gender = newPatientGender;
      emptyRecord.basicInfo.age = newPatientAge;

      try {
          const newPatient = await upsertPatient({
              name: newPatientName,
              gender: newPatientGender,
              age: newPatientAge,
              medical_record: emptyRecord
          }, settings);

          if (newPatient) {
              onSelectPatient(newPatient); // Auto select
              onClose();
              setView('list');
              setNewPatientName('');
              setNewPatientAge('');
          }
      } catch (e: any) {
          if (String(e).includes('SCHEMA_ERROR')) {
              setShowSqlError(true);
          } else {
              alert("创建失败: " + e.message);
          }
      } finally {
          setLoading(false);
      }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm("确定删除此患者吗？与之关联的所有病历和聊天记录可能无法直接访问（取决于数据库策略）。")) return;
      
      const success = await deletePatient(id, settings);
      if (success) {
          setPatients(prev => prev.filter(p => p.id !== id));
          if (activePatient?.id === id) {
              onSelectPatient(null);
          }
      } else {
          alert("删除失败");
      }
  };

  const filteredPatients = patients.filter(p => p.name.includes(searchTerm));

  const copySql = () => {
    const sql = `create table if not exists patients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  gender text,
  age text,
  medical_record jsonb,
  last_visit timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 安全策略
alter table patients enable row level security;
create policy "Public all access" on patients for all using (true) with check (true);

-- 关联更新
alter table chat_sessions add column if not exists patient_id uuid references patients(id);
alter table reports add column if not exists patient_id uuid references patients(id);`;
    navigator.clipboard.writeText(sql);
    alert("SQL 已复制，请去 Supabase 执行。");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
        <div className="relative bg-white w-full max-w-lg h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="bg-indigo-900 text-white p-5 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">👥</span>
                    <div>
                        <h3 className="font-bold text-lg">患者档案管理</h3>
                        <p className="text-indigo-200 text-xs">Cloud Patient Database</p>
                    </div>
                </div>
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">✕</button>
            </div>

            {showSqlError ? (
                <div className="p-8 flex flex-col items-center justify-center text-center h-full space-y-4">
                    <div className="text-4xl">🛠️</div>
                    <h3 className="text-xl font-bold text-slate-800">需要初始化数据库</h3>
                    <p className="text-sm text-slate-500 max-w-xs">您的 Supabase 缺少 `patients` 表。请运行 SQL 脚本进行初始化。</p>
                    <button onClick={copySql} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-indigo-700">复制初始化 SQL</button>
                    <button onClick={() => setShowSqlError(false)} className="text-slate-400 text-sm hover:underline">返回</button>
                </div>
            ) : view === 'list' ? (
                <>
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex gap-2">
                        <input 
                            type="text" 
                            placeholder="搜索姓名..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                        <button 
                            onClick={() => setView('create')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-1"
                        >
                            <span>+</span> 新建
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {loading ? (
                            <div className="text-center py-10 text-slate-400">加载中...</div>
                        ) : filteredPatients.length === 0 ? (
                            <div className="text-center py-10 text-slate-400">
                                {searchTerm ? '未找到匹配患者' : '暂无患者数据，请新建'}
                            </div>
                        ) : (
                            filteredPatients.map(p => (
                                <div 
                                    key={p.id} 
                                    onClick={() => { onSelectPatient(p); onClose(); }}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer group flex items-center justify-between ${
                                        activePatient?.id === p.id 
                                        ? 'bg-indigo-50 border-indigo-200 shadow-inner' 
                                        : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-md'
                                    }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                                            p.gender === '女' ? 'bg-rose-100 text-rose-500' : 'bg-blue-100 text-blue-500'
                                        }`}>
                                            {p.name[0]}
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800 flex items-center gap-2">
                                                {p.name}
                                                {activePatient?.id === p.id && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded">当前</span>}
                                            </div>
                                            <div className="text-xs text-slate-400 flex gap-2">
                                                <span>{p.gender}</span>
                                                <span>{p.age}岁</span>
                                                <span>• 最近: {new Date(p.last_visit).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={(e) => handleDelete(p.id, e)}
                                        className="w-8 h-8 rounded-full hover:bg-red-50 text-slate-300 hover:text-red-500 flex items-center justify-center transition opacity-0 group-hover:opacity-100"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </>
            ) : (
                <div className="p-8 flex flex-col gap-6">
                    <h3 className="text-xl font-bold text-slate-800">新建患者档案</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">姓名</label>
                            <input 
                                type="text" 
                                value={newPatientName}
                                onChange={e => setNewPatientName(e.target.value)}
                                className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="输入姓名"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">性别</label>
                                <select 
                                    value={newPatientGender}
                                    onChange={e => setNewPatientGender(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                    <option value="男">男</option>
                                    <option value="女">女</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">年龄</label>
                                <input 
                                    type="text" 
                                    value={newPatientAge}
                                    onChange={e => setNewPatientAge(e.target.value)}
                                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="例如: 45"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="mt-auto flex gap-3">
                        <button 
                            onClick={() => setView('list')}
                            className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleCreate}
                            disabled={loading || !newPatientName}
                            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg disabled:opacity-50 disabled:shadow-none"
                        >
                            {loading ? '创建中...' : '确认创建'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
