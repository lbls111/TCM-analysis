import { MedicalRecord, LabResult, BloodPressureReading } from '../types';
import { createEmptyMedicalRecord } from '../services/openaiService';

// This file contains rule-based parsers to extract structured information
// from raw medical text before sending it to an AI for refinement.

function extractSection(text: string, startKeyword: string, allKeywords: string[]): string {
    const keywordsRegex = allKeywords.filter(k => k !== startKeyword).join('|');
    const startRegex = new RegExp(`(?:^|\\n)(${startKeyword})[:：\\s]`);
    const endRegex = new RegExp(`(?:^|\\n)(?:${keywordsRegex})[:：\\s]`);
    
    const startIndexMatch = text.match(startRegex);
    if (!startIndexMatch || startIndexMatch.index === undefined) return '';

    const contentStartIndex = startIndexMatch.index + startIndexMatch[0].length;
    const remainingText = text.substring(contentStartIndex);
    
    const endIndexMatch = remainingText.match(endRegex);
    const content = endIndexMatch && endIndexMatch.index !== undefined 
        ? remainingText.substring(0, endIndexMatch.index)
        : remainingText;

    return content.trim();
}

export const parseMedicalTextToRecord = (text: string): MedicalRecord => {
    const record = createEmptyMedicalRecord();

    const allKeywords = [
        "主诉", "现病史", "既往史", "过敏史", "刻下症",
        "体格检查", "辅助检查", "初步诊断", "诊断", "舌象", "脉象",
        "治疗意见", "治法"
    ];

    // Assign split text to record fields using the robust extractor
    record.chiefComplaint = extractSection(text, '主诉', allKeywords);
    record.historyOfPresentIllness = extractSection(text, '现病史', allKeywords);
    record.pastHistory = extractSection(text, '既往史', allKeywords);
    record.allergies = extractSection(text, '过敏史', allKeywords);
    record.currentSymptoms.coldHeat = extractSection(text, '刻下症', allKeywords);
    
    const physicalExamText = extractSection(text, '体格检查', allKeywords);
    record.physicalExam.tongue = extractSection(text, '舌象', allKeywords) || physicalExamText;
    record.physicalExam.pulse = extractSection(text, '脉象', allKeywords) || physicalExamText;
    
    record.auxExams.other = extractSection(text, '辅助检查', allKeywords);
    record.diagnosis.tcm = extractSection(text, '初步诊断', allKeywords) || extractSection(text, '诊断', allKeywords);
    
    // FIX: Correctly assign treatment plan to diagnosis.treatmentPlans array.
    const treatmentPlanText = extractSection(text, '治疗意见', allKeywords) || extractSection(text, '治法', allKeywords);
    if (treatmentPlanText) {
      record.diagnosis.treatmentPlans.push({
        id: `rule_parsed_${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        plan: treatmentPlanText,
      });
    }

    // More specific regex extractions from the entire text
    
    // 1. Basic Info Extraction
    const nameMatch = text.match(/(?:姓名|患者)[:：\s]*([^\s\n]+)/);
    if (nameMatch) record.basicInfo.name = nameMatch[1].trim();

    const genderMatch = text.match(/性别[:：\s]*(男|女)/);
    if (genderMatch) record.basicInfo.gender = genderMatch[1].trim();

    const ageMatch = text.match(/年龄[:：\s]*(\d+\.?\d*)/);
    if (ageMatch) record.basicInfo.age = ageMatch[1].trim();

    // If chief complaint is empty after section parsing, try a simpler regex
    if (!record.chiefComplaint) {
        const chiefComplaintMatch = text.match(/主诉[:：\s]*(.*)/);
        if (chiefComplaintMatch) record.chiefComplaint = chiefComplaintMatch[1].trim();
    }
    
    // 2. Blood Pressure Extraction from anywhere in the text
    const bpRegex = /((\d{4}[-./]\d{1,2}[-./]\d{1,2})|\b\d{1,2}[-./]\d{1,2}\b)?\s*(?:血压|BP)\s*[:：]?\s*(\d{2,3}\s*[/／]\s*\d{2,3})\s*(?:mmhg)?(?:\s*[,，]?\s*(?:心率|HR)\s*[:：]?\s*(\d{2,3}))?/gi;
    let bpMatch;
    while ((bpMatch = bpRegex.exec(text)) !== null) {
        record.physicalExam.bloodPressureReadings.push({
            id: `bp_${Date.now()}_${Math.random()}`,
            date: bpMatch[1] || '',
            reading: bpMatch[3].replace(/\s/g, ''),
            heartRate: bpMatch[4] || ''
        });
    }
    
    // 3. Lab Result Table Extraction is now fully deferred to the AI,
    // as it can better understand context and full item names.
    // The previous simplistic regex parser has been removed to avoid providing
    // bad initial data (like single-letter item names).

    // This returns a partially filled record, ready for AI refinement.
    return record;
};