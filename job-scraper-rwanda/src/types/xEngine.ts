export interface XQuestion {
  id: string;
  question: string;
  category: string;
  mechanic: string;
  audience: string;
  replyGoal: string;
  debatePotential: string;
  platform: string;
  freshness: string;
  status: 'UNUSED' | 'USED';
  usedOn: string | null;
}

export interface XEngineSnapshot {
  questions: XQuestion[];
  workbookName: string;
  categories: string[];
}
