// Exam format and pass marks from "Test imtahanında yoxlanılacaq bilik sahələri ... keçid balları"
// (VezifeQruplariUzreKechidBallari.pdf). The app only trains the "Qanunvericilik" section.
import type { Category } from './types';

export interface ExamFormat {
  category: Category;
  kind: 'rehber' | 'icraci';
  kindTitle: string;
  totalTasks: number;          // all four subjects
  totalMax: number;            // maximum points for the whole test
  openTotal: number;           // AT (açıq tapşırıq), worth 2 points each
  closedTotal: number;         // QT (qapalı tapşırıq), worth 1 point each
  lawOpen: number;
  lawClosed: number;
  lawMax: number;              // lawOpen * 2 + lawClosed
}

export const EXAM_FORMATS: Record<Category, ExamFormat> = {
  AB: { category: 'AB', kind: 'rehber', kindTitle: 'İnzibati rəhbər vəzifələr', totalTasks: 100, totalMax: 120, openTotal: 20, closedTotal: 80, lawOpen: 8, lawClosed: 32, lawMax: 48 },
  AC: { category: 'AC', kind: 'rehber', kindTitle: 'İnzibati rəhbər vəzifələr', totalTasks: 100, totalMax: 100, openTotal: 0, closedTotal: 100, lawOpen: 0, lawClosed: 40, lawMax: 40 },
  BA: { category: 'BA', kind: 'icraci', kindTitle: 'İnzibati icraçı vəzifələr', totalTasks: 100, totalMax: 120, openTotal: 20, closedTotal: 80, lawOpen: 8, lawClosed: 32, lawMax: 48 },
  BB: { category: 'BB', kind: 'icraci', kindTitle: 'İnzibati icraçı vəzifələr', totalTasks: 100, totalMax: 100, openTotal: 0, closedTotal: 100, lawOpen: 0, lawClosed: 40, lawMax: 40 },
};

export const SUBJECT_SPLIT = [
  { subject: 'Azərbaycan dili', tasks: 15 },
  { subject: 'Qanunvericilik', tasks: 40 },
  { subject: 'İnformatika', tasks: 15 },
  { subject: 'Məntiq', tasks: 30 },
];

export interface Subgroup {
  code: string;
  category: Category;
  classification: number;      // inzibati vəzifələrin təsnifatı
  passPercent: number;
  passPoints: number;
  positions: string[];
}

const S = (code: string, classification: number, passPercent: number, passPoints: number, positions: string[]): Subgroup =>
  ({ code, category: code.slice(0, 2) as Category, classification, passPercent, passPoints, positions });

export const SUBGROUPS: Subgroup[] = [
  S('AB1', 4, 85, 102, ['şöbə müdiri', 'sektor müdiri', 'regional bölmənin rəhbəri']),
  S('AB2', 4, 80, 96, ['şöbə müdirinin müavini', 'dövlət orqanı rəhbərinin müşaviri, köməkçisi', 'regional bölmənin rəhbərinin müavini']),
  S('AB3', 5, 75, 90, ['sektor müdiri', 'şöbə müdiri']),
  S('AB4', 5, 70, 84, ['şöbə müdirinin müavini']),
  S('AC1', 5, 80, 80, ['yerli bölmənin rəhbəri', 'mərkəzi icra hakimiyyəti orqanlarının yanında, tabeliyində olan orqanların rəhbərləri']),
  S('AC2', 6, 75, 75, ['sektor müdiri', 'yerli bölmənin rəhbəri']),
  S('AC3', 6, 70, 70, ['yerli bölmələrin rəhbərlərinin müavini', 'mərkəzi icra hakimiyyəti orqanlarının yanında, tabeliyində olan orqanların rəhbərlərinin müavinləri']),
  S('AC4', 7, 65, 65, ['sektor müdiri']),
  S('BA1', 4, 85, 102, ['baş məsləhətçi', 'baş mühasib', 'böyük məsləhətçi']),
  S('BA2', 4, 80, 96, ['aparıcı məsləhətçi', 'məsləhətçi']),
  S('BA3', 5, 75, 90, ['baş məsləhətçi', 'baş mühasib', 'böyük məsləhətçi']),
  S('BA4', 5, 70, 84, ['aparıcı məsləhətçi', 'məsləhətçi', 'hakim köməkçisi', 'məhkəmə iclasının katibi']),
  S('BB1', 6, 80, 80, ['baş məsləhətçi', 'baş mühasib', 'böyük məsləhətçi']),
  S('BB2', 6, 75, 75, ['aparıcı məsləhətçi', 'məsləhətçi', 'hakim köməkçisi', 'məhkəmə iclasının katibi']),
  S('BB3', 7, 70, 70, ['baş məsləhətçi', 'baş mühasib', 'böyük məsləhətçi']),
  S('BB4', 7, 65, 65, ['aparıcı məsləhətçi', 'məsləhətçi', 'hakim köməkçisi', 'məhkəmə iclasının katibi']),
];

export function subgroupsFor(category: Category): Subgroup[] {
  return SUBGROUPS.filter((s) => s.category === category);
}

export function findSubgroup(code: string | null | undefined): Subgroup | null {
  return SUBGROUPS.find((s) => s.code === code) ?? null;
}

/** Target pass percent for a learner: subgroup mark, or the category's lowest mark when unknown. */
export function targetPercent(category: Category | null, subgroup: string | null): number {
  const sg = findSubgroup(subgroup);
  if (sg) return sg.passPercent;
  if (!category) return 80;
  return Math.min(...subgroupsFor(category).map((s) => s.passPercent));
}

/** Mock exam duration for the law section. Assumption: DİM gives ~1.2 min per task. */
export const MOCK_MINUTES = 50;
