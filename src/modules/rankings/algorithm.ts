export const RANKING_ALGORITHM_VERSION = "ranking-v1";
export type PeriodKind = "weekly" | "monthly";
export type RankingScope = "overall" | "country" | "category" | "technology" | "improved" | "newcomer";
export type RankingCandidate = { siteId: string; score: number; lcpMs: number | null; cls: number | null; tbtMs: number | null; improvement?: number | null };

export function compareRankingCandidates(a: RankingCandidate, b: RankingCandidate, scope: RankingScope = "overall"): number {
  if (scope === "improved") {
    const improvement = (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity);
    if (improvement && !Number.isNaN(improvement)) return improvement;
  }
  return b.score-a.score || (a.lcpMs ?? Infinity)-(b.lcpMs ?? Infinity)
    || (a.cls ?? Infinity)-(b.cls ?? Infinity) || (a.tbtMs ?? Infinity)-(b.tbtMs ?? Infinity)
    || (a.siteId < b.siteId ? -1 : a.siteId > b.siteId ? 1 : 0);
}

export function getPeriodBounds(kind: PeriodKind, input: Date | string) {
  const date = typeof input === "string" ? new Date(input) : new Date(input.getTime());
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid competition date");
  date.setUTCHours(0,0,0,0);
  if (kind === "monthly") {
    const startAt = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1));
    const endAt = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));
    return { kind, periodKey: `${startAt.getUTCFullYear()}-${String(startAt.getUTCMonth()+1).padStart(2,"0")}`, startAt, endAt };
  }
  date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));
  const startAt = new Date(date), endAt = new Date(date.getTime()+7*86_400_000);
  const thursday = new Date(date.getTime()+3*86_400_000);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year,0,4));
  firstThursday.setUTCDate(firstThursday.getUTCDate()-((firstThursday.getUTCDay()+6)%7)+3);
  const week = 1+Math.round((thursday.getTime()-firstThursday.getTime())/(7*86_400_000));
  return { kind, periodKey: `${year}-W${String(week).padStart(2,"0")}`, startAt, endAt };
}

export function parsePeriodKey(kind: PeriodKind, key: string) {
  if (kind === "monthly" && /^\d{4}-(0[1-9]|1[0-2])$/.test(key)) {
    return getPeriodBounds(kind,new Date(`${key}-01T00:00:00Z`));
  }
  const match = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/.exec(key);
  if (kind !== "weekly" || !match) throw new Error("Invalid competition period key");
  const first = getPeriodBounds("weekly",new Date(`${match[1]}-01-04T00:00:00Z`));
  const result = getPeriodBounds("weekly",new Date(first.startAt.getTime()+(Number(match[2])-1)*7*86_400_000));
  if (result.periodKey !== key) throw new Error("Invalid ISO week");
  return result;
}
