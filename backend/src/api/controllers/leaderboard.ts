import { MonkeyResponse } from "../../utils/monkey-response";
import * as LeaderboardsDAL from "../../dal/leaderboards";
import * as ConnectionsDal from "../../dal/connections";
import * as UserDAL from "../../dal/user";
import * as ResultDAL from "../../dal/result";
import MonkeyError from "../../utils/error";
import * as DailyLeaderboards from "../../utils/daily-leaderboards";
import * as WeeklyXpLeaderboard from "../../services/weekly-xp-leaderboard";
import {
  DailyLeaderboardQuery,
  GetDailyLeaderboardQuery,
  GetDailyLeaderboardRankQuery,
  GetDailyLeaderboardResponse,
  GetGhostRunParams,
  GetGhostRunResponse,
  GetLeaderboardDailyRankResponse,
  GetLeaderboardQuery,
  GetLeaderboardRankQuery,
  GetLeaderboardRankResponse,
  GetLeaderboardResponse,
  GetWeeklyXpLeaderboardQuery,
  GetWeeklyXpLeaderboardRankQuery,
  GetWeeklyXpLeaderboardRankResponse,
  GetWeeklyXpLeaderboardResponse,
} from "@monkeytype/contracts/leaderboards";
import { Configuration } from "@monkeytype/schemas/configuration";
import {
  getCurrentDayTimestamp,
  getCurrentWeekTimestamp,
  MILLISECONDS_IN_DAY,
} from "@monkeytype/util/date-and-time";
import { MonkeyRequest } from "../types";
import { omit } from "../../utils/misc";

export async function getLeaderboard(
  req: MonkeyRequest<GetLeaderboardQuery>,
): Promise<GetLeaderboardResponse> {
  const { language, mode, mode2, page, pageSize, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  if (
    mode !== "time" ||
    (mode2 !== "15" && mode2 !== "60") ||
    language !== "english"
  ) {
    throw new MonkeyError(404, "There is no leaderboard for this mode");
  }

  const friendsOnlyUid = getFriendsOnlyUid(uid, friendsOnly, connectionsConfig);

  const leaderboard = await LeaderboardsDAL.get(
    mode,
    mode2,
    language,
    page,
    pageSize,
    req.ctx.configuration.users.premium.enabled,
    friendsOnlyUid,
  );

  if (leaderboard === false) {
    throw new MonkeyError(
      503,
      "Leaderboard is currently updating. Please try again in a few seconds.",
    );
  }

  const count = await LeaderboardsDAL.getCount(
    mode,
    mode2,
    language,
    friendsOnlyUid,
  );
  const normalizedLeaderboard = leaderboard.map((it) => omit(it, ["_id"]));

  return new MonkeyResponse("Leaderboard retrieved", {
    count,
    entries: normalizedLeaderboard,
    pageSize,
  });
}

export async function getRankFromLeaderboard(
  req: MonkeyRequest<GetLeaderboardRankQuery>,
): Promise<GetLeaderboardRankResponse> {
  const { language, mode, mode2, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const data = await LeaderboardsDAL.getRank(
    mode,
    mode2,
    language,
    uid,
    getFriendsOnlyUid(uid, friendsOnly, connectionsConfig) !== undefined,
  );
  if (data === false) {
    throw new MonkeyError(
      503,
      "Leaderboard is currently updating. Please try again in a few seconds.",
    );
  }

  if (data === null) {
    return new MonkeyResponse("Rank retrieved", null);
  }

  return new MonkeyResponse("Rank retrieved", omit(data, ["_id"]));
}

function getDailyLeaderboardWithError(
  { language, mode, mode2, daysBefore }: DailyLeaderboardQuery,
  config: Configuration["dailyLeaderboards"],
): DailyLeaderboards.DailyLeaderboard {
  const customTimestamp =
    daysBefore === undefined
      ? -1
      : getCurrentDayTimestamp() - daysBefore * MILLISECONDS_IN_DAY;

  const dailyLeaderboard = DailyLeaderboards.getDailyLeaderboard(
    language,
    mode,
    mode2,
    config,
    customTimestamp,
  );
  if (!dailyLeaderboard) {
    throw new MonkeyError(404, "There is no daily leaderboard for this mode");
  }

  return dailyLeaderboard;
}

export async function getDailyLeaderboard(
  req: MonkeyRequest<GetDailyLeaderboardQuery>,
): Promise<GetDailyLeaderboardResponse> {
  const { page, pageSize, friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const dailyLeaderboard = getDailyLeaderboardWithError(
    req.query,
    req.ctx.configuration.dailyLeaderboards,
  );

  const results = await dailyLeaderboard.getResults(
    page,
    pageSize,
    req.ctx.configuration.dailyLeaderboards,
    req.ctx.configuration.users.premium.enabled,
    friendUids,
  );

  return new MonkeyResponse("Daily leaderboard retrieved", {
    entries: results?.entries ?? [],
    count: results?.count ?? 0,
    minWpm: results?.minWpm ?? 0,
    pageSize,
  });
}

export async function getDailyLeaderboardRank(
  req: MonkeyRequest<GetDailyLeaderboardRankQuery>,
): Promise<GetLeaderboardDailyRankResponse> {
  const { friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const dailyLeaderboard = getDailyLeaderboardWithError(
    req.query,
    req.ctx.configuration.dailyLeaderboards,
  );

  const rank = await dailyLeaderboard.getRank(
    uid,
    req.ctx.configuration.dailyLeaderboards,
    friendUids,
  );

  return new MonkeyResponse("Daily leaderboard rank retrieved", rank);
}

function getWeeklyXpLeaderboardWithError(
  config: Configuration["leaderboards"]["weeklyXp"],
  weeksBefore?: number,
): WeeklyXpLeaderboard.WeeklyXpLeaderboard {
  const customTimestamp =
    weeksBefore === undefined
      ? -1
      : getCurrentWeekTimestamp() - weeksBefore * MILLISECONDS_IN_DAY * 7;

  const weeklyXpLeaderboard = WeeklyXpLeaderboard.get(config, customTimestamp);
  if (!weeklyXpLeaderboard) {
    throw new MonkeyError(404, "XP leaderboard for this week not found.");
  }

  return weeklyXpLeaderboard;
}

export async function getWeeklyXpLeaderboard(
  req: MonkeyRequest<GetWeeklyXpLeaderboardQuery>,
): Promise<GetWeeklyXpLeaderboardResponse> {
  const { page, pageSize, weeksBefore, friendsOnly } = req.query;

  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const weeklyXpLeaderboard = getWeeklyXpLeaderboardWithError(
    req.ctx.configuration.leaderboards.weeklyXp,
    weeksBefore,
  );
  const results = await weeklyXpLeaderboard.getResults(
    page,
    pageSize,
    req.ctx.configuration.leaderboards.weeklyXp,
    req.ctx.configuration.users.premium.enabled,
    friendUids,
  );

  return new MonkeyResponse("Weekly xp leaderboard retrieved", {
    entries: results?.entries ?? [],
    count: results?.count ?? 0,
    pageSize,
  });
}

export async function getWeeklyXpLeaderboardRank(
  req: MonkeyRequest<GetWeeklyXpLeaderboardRankQuery>,
): Promise<GetWeeklyXpLeaderboardRankResponse> {
  const { friendsOnly } = req.query;
  const { uid } = req.ctx.decodedToken;
  const connectionsConfig = req.ctx.configuration.connections;

  const friendUids = await getFriendsUids(
    uid,
    friendsOnly === true,
    connectionsConfig,
  );

  const weeklyXpLeaderboard = getWeeklyXpLeaderboardWithError(
    req.ctx.configuration.leaderboards.weeklyXp,
    req.query.weeksBefore,
  );
  const rankEntry = await weeklyXpLeaderboard.getRank(
    uid,
    req.ctx.configuration.leaderboards.weeklyXp,
    friendUids,
  );

  return new MonkeyResponse("Weekly xp leaderboard rank retrieved", rankEntry);
}

async function getFriendsUids(
  uid: string,
  friendsOnly: boolean,
  friendsConfig: Configuration["connections"],
): Promise<string[] | undefined> {
  if (uid !== "" && friendsOnly) {
    if (!friendsConfig.enabled) {
      throw new MonkeyError(503, "This feature is currently unavailable.");
    }
    return await ConnectionsDal.getFriendsUids(uid);
  }
  return undefined;
}

function getFriendsOnlyUid(
  uid: string,
  friendsOnly: boolean | undefined,
  friendsConfig: Configuration["connections"],
): string | undefined {
  if (uid !== "" && friendsOnly === true) {
    if (!friendsConfig.enabled) {
      throw new MonkeyError(503, "This feature is currently unavailable.");
    }
    return uid;
  }
  return undefined;
}

const FALLBACK_WORDS = [
  "the",
  "be",
  "of",
  "and",
  "a",
  "to",
  "in",
  "he",
  "have",
  "it",
  "that",
  "for",
  "they",
  "I",
  "with",
  "as",
  "not",
  "on",
  "she",
  "at",
  "by",
  "this",
  "we",
  "you",
  "do",
  "but",
  "from",
  "or",
  "which",
  "one",
  "would",
  "all",
  "will",
  "there",
  "say",
  "who",
  "make",
  "when",
  "can",
  "more",
  "if",
  "no",
  "man",
  "out",
  "other",
  "so",
  "what",
  "time",
  "up",
  "go",
  "about",
  "than",
  "into",
  "could",
  "state",
  "only",
  "new",
  "year",
  "some",
  "take",
  "come",
  "these",
  "know",
  "see",
  "use",
  "get",
  "like",
  "then",
  "first",
  "any",
  "work",
  "now",
  "may",
  "such",
  "give",
  "over",
  "think",
  "most",
  "even",
  "find",
  "day",
  "also",
  "after",
  "way",
  "many",
  "must",
  "look",
  "before",
  "great",
  "back",
  "through",
  "long",
  "where",
  "much",
  "should",
  "well",
  "people",
  "down",
  "own",
  "just",
  "because",
  "good",
  "each",
  "those",
  "feel",
  "seem",
  "how",
  "high",
  "too",
  "place",
  "little",
  "world",
  "very",
  "still",
  "nation",
  "hand",
  "old",
  "life",
  "tell",
  "write",
  "become",
  "here",
  "show",
  "house",
  "both",
  "between",
  "need",
  "mean",
  "call",
  "develop",
  "under",
  "last",
  "right",
  "move",
  "thing",
  "general",
  "school",
  "never",
  "same",
  "another",
  "begin",
  "while",
  "number",
  "part",
  "turn",
  "real",
  "leave",
  "might",
  "want",
  "point",
  "form",
  "off",
  "child",
  "few",
  "small",
  "since",
  "against",
  "ask",
  "late",
  "home",
  "interest",
  "large",
  "person",
  "end",
  "open",
  "public",
  "follow",
  "during",
  "present",
  "without",
  "again",
  "hold",
  "govern",
  "around",
  "possible",
  "head",
  "consider",
  "word",
  "program",
  "problem",
  "however",
  "lead",
  "system",
  "set",
  "order",
  "eye",
  "plan",
  "run",
  "keep",
  "face",
  "fact",
  "group",
  "play",
  "stand",
  "increase",
  "early",
  "course",
  "change",
  "help",
  "line",
];

// the below function takes a number as a seed and generates random numbers
// the catch is for same seed it will generate same random numbers everytime it is called
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateFallbackWords(timestamp: number, mode2: string): string[] {
  const count = mode2 === "60" ? 250 : 100;
  const rng = seededRandom(timestamp);
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * FALLBACK_WORDS.length);
    words.push(FALLBACK_WORDS[idx] ?? "the");
  }
  return words;
}

export async function getGhostRun(
  req: MonkeyRequest<undefined, undefined, GetGhostRunParams>,
): Promise<GetGhostRunResponse> {
  const { mode, mode2, language, rank } = req.params;
  const { uid } = req.ctx.decodedToken;

  if (rank <= 5) {
    const isPremium = await UserDAL.checkIfUserIsPremium(uid);
    if (!isPremium) {
      throw new MonkeyError(
        403,
        "Ranks 1-5 require Monkeytype Supporter status",
      );
    }
  }

  const entry = await LeaderboardsDAL.getEntryByRank(
    mode,
    mode2,
    language,
    rank,
  );
  if (!entry) {
    throw new MonkeyError(404, "Leaderboard entry not found");
  }

  const result = await ResultDAL.getResultByTimestamp(
    entry.uid,
    entry.timestamp,
    mode,
    mode2,
    entry.wpm,
  );

  const words =
    result?.words && result.words.length > 0
      ? result.words
      : generateFallbackWords(entry.timestamp, mode2);

  return new MonkeyResponse("Ghost run retrieved", {
    rank,
    uid: entry.uid,
    name: entry.name,
    discordId: entry.discordId,
    discordAvatar: entry.discordAvatar,
    badgeId: entry.badgeId,
    isPremium: entry.isPremium,
    wpm: entry.wpm,
    acc: entry.acc,
    consistency: entry.consistency,
    chartData: result?.chartData ?? "toolong",
    words,
    mode,
    mode2,
    language,
    timestamp: entry.timestamp,
  });
}
