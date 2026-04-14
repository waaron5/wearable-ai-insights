import type { AuthUser } from "./auth";
import type {
  Baseline,
  ChatMessage,
  ChatReply,
  ChatSession,
  DataSource,
  Debrief,
  EmergencyReply,
  Feedback,
  Metric,
  PaginatedResponse,
  SurveyQuestion,
  SurveyResponse,
  User,
  UserUpdate,
  WeeklySummary,
} from "./api";

const DEMO_USER_ID = "demo-user";
const DEMO_SOURCE_ID = "source-healthkit";
const EMERGENCY_KEYWORDS = [
  "suicide",
  "kill myself",
  "hurt myself",
  "harm myself",
  "self harm",
  "self-harm",
  "emergency",
];

function isoDateTimeDaysAgo(daysAgo: number, hour = 9): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function dateOnlyDaysAgo(daysAgo: number): string {
  return isoDateTimeDaysAgo(daysAgo).slice(0, 10);
}

function currentWeekRange() {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const day = end.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(end);
  start.setDate(end.getDate() - daysSinceMonday);
  const weekEnd = new Date(start);
  weekEnd.setDate(start.getDate() + 6);

  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
  };
}

function paginate<T>(
  items: T[],
  params?: { limit?: number; offset?: number }
): PaginatedResponse<T> {
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? items.length;

  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildMetrics(): Metric[] {
  const rows: Metric[] = [];
  const sleep = [7.1, 7.4, 7.6, 7.2, 7.9, 8.0, 7.7, 7.5, 7.8, 8.1, 7.9, 8.0, 7.6, 7.8];
  const hrv = [42, 44, 45, 43, 47, 48, 49, 46, 50, 52, 51, 49, 50, 53];
  const restingHr = [61, 60, 60, 59, 58, 58, 57, 58, 57, 56, 57, 56, 56, 55];
  const steps = [7200, 8100, 9300, 8800, 10100, 11300, 10900, 9800, 10500, 11800, 12100, 11400, 11000, 12400];

  const series = [
    { metricType: "sleep_hours" as const, values: sleep },
    { metricType: "hrv" as const, values: hrv },
    { metricType: "resting_hr" as const, values: restingHr },
    { metricType: "steps" as const, values: steps },
  ];

  series.forEach(({ metricType, values }) => {
    values.forEach((value, index) => {
      const daysAgo = values.length - 1 - index;
      rows.push({
        id: `${metricType}-${daysAgo}`,
        user_id: DEMO_USER_ID,
        source_id: DEMO_SOURCE_ID,
        date: dateOnlyDaysAgo(daysAgo),
        metric_type: metricType,
        value,
        created_at: isoDateTimeDaysAgo(daysAgo, 7),
      });
    });
  });

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function buildDebriefs(): Debrief[] {
  const currentWeek = currentWeekRange();

  return [
    {
      id: "debrief-current",
      user_id: DEMO_USER_ID,
      week_start: currentWeek.weekStart,
      week_end: currentWeek.weekEnd,
      narrative:
        "Your recovery trend improved this week, led by steadier sleep and a small lift in HRV.\n\nYou were most resilient on your highest-activity days, which suggests your training load is landing well. Resting heart rate also stayed a touch below baseline, a good sign that overall stress is manageable.\n\nThe next best move is consistency. Protect your first 90 minutes before bed and aim for one lighter activity day after your most intense step count day.",
      highlights: [
        { label: "Recovery", value: "82", delta_vs_baseline: "+6%" },
        { label: "Sleep", value: "7.8 hrs", delta_vs_baseline: "+0.5 hrs" },
        { label: "HRV", value: "53 ms", delta_vs_baseline: "+8%" },
        { label: "Resting HR", value: "55 bpm", delta_vs_baseline: "-4%" },
      ],
      status: "generated",
      email_sent_at: null,
      created_at: isoDateTimeDaysAgo(0, 8),
      updated_at: isoDateTimeDaysAgo(0, 8),
      disclaimer:
        "For informational purposes only. This is not medical advice.",
    },
    {
      id: "debrief-last-week",
      user_id: DEMO_USER_ID,
      week_start: dateOnlyDaysAgo(13),
      week_end: dateOnlyDaysAgo(7),
      narrative:
        "Last week showed a stable baseline with moderate activity and decent sleep coverage.\n\nThere were no major warning signals, but recovery looked flatter than this week, mainly because HRV did not rebound as strongly after your busiest days.",
      highlights: [
        { label: "Recovery", value: "76", delta_vs_baseline: "+1%" },
        { label: "Sleep", value: "7.4 hrs", delta_vs_baseline: "+0.1 hrs" },
        { label: "HRV", value: "47 ms", delta_vs_baseline: "+1%" },
        { label: "Resting HR", value: "58 bpm", delta_vs_baseline: "-1%" },
      ],
      status: "sent",
      email_sent_at: isoDateTimeDaysAgo(6, 10),
      created_at: isoDateTimeDaysAgo(7, 9),
      updated_at: isoDateTimeDaysAgo(7, 9),
      disclaimer:
        "For informational purposes only. This is not medical advice.",
    },
    {
      id: "debrief-two-weeks-ago",
      user_id: DEMO_USER_ID,
      week_start: dateOnlyDaysAgo(20),
      week_end: dateOnlyDaysAgo(14),
      narrative:
        "Two weeks ago your activity was strong, but sleep was less consistent.\n\nThat pattern likely kept recovery from fully compounding through the week, even though step totals were high.",
      highlights: [
        { label: "Recovery", value: "71", delta_vs_baseline: "-3%" },
        { label: "Sleep", value: "7.0 hrs", delta_vs_baseline: "-0.3 hrs" },
        { label: "HRV", value: "44 ms", delta_vs_baseline: "-4%" },
        { label: "Resting HR", value: "60 bpm", delta_vs_baseline: "+2%" },
      ],
      status: "generated",
      email_sent_at: null,
      created_at: isoDateTimeDaysAgo(14, 9),
      updated_at: isoDateTimeDaysAgo(14, 9),
      disclaimer:
        "For informational purposes only. This is not medical advice.",
    },
  ];
}

function buildSummary(): WeeklySummary {
  const currentWeek = currentWeekRange();

  return {
    week: currentWeek.weekStart,
    insufficient_data: false,
    composite_scores: {
      recovery: 82,
      sleep: 79,
      activity: 88,
    },
    per_metric: [
      {
        type: "sleep_hours",
        current_avg: 7.8,
        current_min: 7.2,
        current_max: 8.1,
        days_with_data: 7,
        baseline: 7.3,
        std_deviation: 0.4,
        delta_pct_vs_baseline: 6.8,
        weekly_z_score: 1.1,
        wow_delta_pct: 5.4,
        trend: "improving",
      },
      {
        type: "hrv",
        current_avg: 50.1,
        current_min: 46,
        current_max: 53,
        days_with_data: 7,
        baseline: 46.2,
        std_deviation: 2.7,
        delta_pct_vs_baseline: 8.4,
        weekly_z_score: 1.2,
        wow_delta_pct: 6.0,
        trend: "improving",
      },
      {
        type: "resting_hr",
        current_avg: 56.4,
        current_min: 55,
        current_max: 58,
        days_with_data: 7,
        baseline: 57.8,
        std_deviation: 1.4,
        delta_pct_vs_baseline: -2.4,
        weekly_z_score: -1.0,
        wow_delta_pct: -2.1,
        trend: "improving",
      },
      {
        type: "steps",
        current_avg: 11257,
        current_min: 9800,
        current_max: 12400,
        days_with_data: 7,
        baseline: 9800,
        std_deviation: 900,
        delta_pct_vs_baseline: 14.8,
        weekly_z_score: 1.6,
        wow_delta_pct: 9.2,
        trend: "improving",
      },
    ],
    notable_days: [
      {
        date: dateOnlyDaysAgo(0),
        metric_type: "steps",
        value: 12400,
        z_score: 1.8,
        flag: "high",
      },
      {
        date: dateOnlyDaysAgo(2),
        metric_type: "sleep_hours",
        value: 8.1,
        z_score: 1.6,
        flag: "high",
      },
    ],
    prior_week_avgs: {
      sleep_hours: 7.4,
      hrv: 47.3,
      resting_hr: 57.6,
      steps: 10300,
    },
    disclaimer: "For informational purposes only. This is not medical advice.",
  };
}

function buildSurveyQuestions(): SurveyQuestion[] {
  return [
    {
      id: "survey-1",
      category: "energy",
      question_text: "How has your daytime energy felt over the last week?",
      response_type: "single_choice",
      options: {
        choices: ["Very low", "Low", "Okay", "Good", "Excellent"],
      },
      display_order: 1,
    },
    {
      id: "survey-2",
      category: "stress",
      question_text: "How manageable has your stress felt recently?",
      response_type: "single_choice",
      options: {
        choices: ["Not manageable", "A bit heavy", "Neutral", "Manageable", "Very manageable"],
      },
      display_order: 2,
    },
  ];
}

let demoUser: User = {
  id: DEMO_USER_ID,
  email: "demo@vitalview.app",
  name: "Demo User",
  timezone: "America/Denver",
  notification_email: "demo@vitalview.app",
  email_notifications_enabled: true,
  push_notifications_enabled: true,
  onboarded_at: isoDateTimeDaysAgo(5, 11),
  data_sharing_consent: true,
  data_sharing_consented_at: isoDateTimeDaysAgo(5, 11),
  created_at: isoDateTimeDaysAgo(21, 9),
};

let demoSources: DataSource[] = [
  {
    id: DEMO_SOURCE_ID,
    user_id: DEMO_USER_ID,
    source_type: "healthkit",
    config: null,
    last_synced_at: isoDateTimeDaysAgo(0, 7),
    is_active: true,
    created_at: isoDateTimeDaysAgo(18, 12),
  },
];

const demoBaselines: Baseline[] = [
  {
    id: "baseline-sleep",
    user_id: DEMO_USER_ID,
    metric_type: "sleep_hours",
    baseline_value: 7.3,
    std_deviation: 0.4,
    calculated_at: isoDateTimeDaysAgo(1, 6),
  },
  {
    id: "baseline-hrv",
    user_id: DEMO_USER_ID,
    metric_type: "hrv",
    baseline_value: 46.2,
    std_deviation: 2.7,
    calculated_at: isoDateTimeDaysAgo(1, 6),
  },
  {
    id: "baseline-rhr",
    user_id: DEMO_USER_ID,
    metric_type: "resting_hr",
    baseline_value: 57.8,
    std_deviation: 1.4,
    calculated_at: isoDateTimeDaysAgo(1, 6),
  },
  {
    id: "baseline-steps",
    user_id: DEMO_USER_ID,
    metric_type: "steps",
    baseline_value: 9800,
    std_deviation: 900,
    calculated_at: isoDateTimeDaysAgo(1, 6),
  },
];

const demoMetrics = buildMetrics();
let demoDebriefs = buildDebriefs();
const demoSummary = buildSummary();
const demoSurveyQuestions = buildSurveyQuestions();
let demoSurveyResponses: SurveyResponse[] = [];

let chatSessionCounter = 2;
let chatMessageCounter = 4;

let demoChatSessions: ChatSession[] = [
  {
    id: "session-1",
    user_id: DEMO_USER_ID,
    title: "Weekly check-in",
    created_at: isoDateTimeDaysAgo(1, 8),
    updated_at: isoDateTimeDaysAgo(0, 10),
  },
];

let demoChatMessages: Record<string, ChatMessage[]> = {
  "session-1": [
    {
      id: "message-1",
      session_id: "session-1",
      user_id: DEMO_USER_ID,
      role: "user",
      content: "How did I sleep this week?",
      created_at: isoDateTimeDaysAgo(0, 9),
    },
    {
      id: "message-2",
      session_id: "session-1",
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "Your sleep averaged 7.8 hours this week, which is above your recent baseline. The strongest nights came after your lighter evenings, so keeping bedtime consistent looks like your best lever.",
      created_at: isoDateTimeDaysAgo(0, 9),
    },
    {
      id: "message-3",
      session_id: "session-1",
      user_id: DEMO_USER_ID,
      role: "user",
      content: "What are my HRV trends?",
      created_at: isoDateTimeDaysAgo(0, 10),
    },
    {
      id: "message-4",
      session_id: "session-1",
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "HRV has been trending upward over the last two weeks, with the latest readings sitting above baseline. That usually lines up with improving recovery and manageable training stress.",
      created_at: isoDateTimeDaysAgo(0, 10),
    },
  ],
};

function nextChatSessionId() {
  const id = `session-${chatSessionCounter}`;
  chatSessionCounter += 1;
  return id;
}

function nextChatMessageId() {
  const id = `message-${chatMessageCounter}`;
  chatMessageCounter += 1;
  return id;
}

function touchSession(sessionId: string, title?: string | null) {
  demoChatSessions = demoChatSessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          title: title ?? session.title,
          updated_at: new Date().toISOString(),
        }
      : session
  );
}

function makeAssistantReply(content: string): string {
  const normalized = content.toLowerCase();

  if (normalized.includes("sleep")) {
    return "Sleep has looked solid in the demo data. You are averaging just under 8 hours, and your best recovery days come after the most consistent bedtimes.";
  }
  if (normalized.includes("hrv")) {
    return "HRV is trending up in the demo profile. The latest values are above baseline, which usually suggests recovery is moving in the right direction.";
  }
  if (normalized.includes("recovery")) {
    return "Recovery looks stronger this week than last week. The main contributors are steadier sleep and a slightly lower resting heart rate.";
  }
  if (normalized.includes("activity") || normalized.includes("step")) {
    return "Activity is a strength in this demo account. Daily steps are elevated without a matching drop in recovery, which is a good sign that load is tolerable.";
  }

  return "The demo profile looks broadly healthy this week. Recovery is up, HRV is improving, and the clearest recommendation is to keep sleep timing consistent.";
}

export function getDemoAuthUser(): AuthUser {
  return {
    id: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
    timezone: demoUser.timezone,
    onboarded_at: demoUser.onboarded_at,
    data_sharing_consent: demoUser.data_sharing_consent,
    email_notifications_enabled: demoUser.email_notifications_enabled,
    push_notifications_enabled: demoUser.push_notifications_enabled,
    created_at: demoUser.created_at,
  };
}

export function getDemoUser(): User {
  return clone(demoUser);
}

export function updateDemoUser(data: UserUpdate): User {
  demoUser = {
    ...demoUser,
    ...data,
  };
  return getDemoUser();
}

export function updateDemoConsent(value: boolean): Record<string, unknown> {
  demoUser = {
    ...demoUser,
    data_sharing_consent: value,
    data_sharing_consented_at: value
      ? new Date().toISOString()
      : demoUser.data_sharing_consented_at,
  };

  return {
    ok: true,
    data_sharing_consent: value,
  };
}

export function getDemoMetrics(params?: {
  start_date?: string;
  end_date?: string;
  metric_type?: string;
  limit?: number;
  offset?: number;
}): PaginatedResponse<Metric> {
  const filtered = demoMetrics.filter((metric) => {
    if (params?.metric_type && metric.metric_type !== params.metric_type) {
      return false;
    }
    if (params?.start_date && metric.date < params.start_date) {
      return false;
    }
    if (params?.end_date && metric.date > params.end_date) {
      return false;
    }
    return true;
  });

  return paginate(filtered, params);
}

export function getDemoBaselines(): Baseline[] {
  return clone(demoBaselines);
}

export function getDemoSources(): DataSource[] {
  return clone(demoSources);
}

export function createDemoSource(data: {
  source_type: string;
  config?: Record<string, unknown>;
}): DataSource {
  const source: DataSource = {
    id: `source-${demoSources.length + 1}`,
    user_id: DEMO_USER_ID,
    source_type: data.source_type,
    config: data.config ?? null,
    last_synced_at: new Date().toISOString(),
    is_active: true,
    created_at: new Date().toISOString(),
  };
  demoSources = [source, ...demoSources];
  return clone(source);
}

export function getDemoDebriefs(params?: {
  limit?: number;
  offset?: number;
}): PaginatedResponse<Debrief> {
  return paginate(
    [...demoDebriefs].sort((a, b) => b.week_start.localeCompare(a.week_start)),
    params
  );
}

export function getDemoCurrentDebrief(): Debrief {
  return clone(demoDebriefs[0]);
}

export function getDemoWeeklySummary(): WeeklySummary {
  return clone(demoSummary);
}

export function triggerDemoDebrief(): Debrief {
  demoDebriefs[0] = {
    ...demoDebriefs[0],
    status: "generated",
    updated_at: new Date().toISOString(),
  };
  return clone(demoDebriefs[0]);
}

export function submitDemoFeedback(
  debriefId: string,
  data: { rating: number; comment?: string }
): Feedback {
  return {
    id: `feedback-${Date.now()}`,
    debrief_id: debriefId,
    user_id: DEMO_USER_ID,
    rating: data.rating,
    comment: data.comment ?? null,
    created_at: new Date().toISOString(),
  };
}

export function getDemoChatSessions(params?: {
  limit?: number;
  offset?: number;
}): PaginatedResponse<ChatSession> {
  const sorted = [...demoChatSessions].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  );
  return paginate(sorted, params);
}

export function createDemoChatSession(data?: { title?: string }): ChatSession {
  const session: ChatSession = {
    id: nextChatSessionId(),
    user_id: DEMO_USER_ID,
    title: data?.title ?? "New Chat",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  demoChatSessions = [session, ...demoChatSessions];
  demoChatMessages[session.id] = [];
  return clone(session);
}

export function getDemoChatMessages(
  sessionId: string,
  params?: { limit?: number; offset?: number }
): PaginatedResponse<ChatMessage> {
  const messages = [...(demoChatMessages[sessionId] ?? [])].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  return paginate(messages, params);
}

export function sendDemoMessage(
  sessionId: string,
  content: string
): ChatReply | EmergencyReply {
  const timestamp = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: nextChatMessageId(),
    session_id: sessionId,
    user_id: DEMO_USER_ID,
    role: "user",
    content,
    created_at: timestamp,
  };

  const isEmergency = EMERGENCY_KEYWORDS.some((keyword) =>
    content.toLowerCase().includes(keyword)
  );

  if (isEmergency) {
    const assistantMessage: ChatMessage = {
      id: nextChatMessageId(),
      session_id: sessionId,
      user_id: DEMO_USER_ID,
      role: "assistant",
      content:
        "If you are in immediate danger or thinking about harming yourself, call emergency services now. You can also contact 988 for immediate crisis support.",
      created_at: timestamp,
    };

    demoChatMessages[sessionId] = [
      ...(demoChatMessages[sessionId] ?? []),
      userMessage,
      assistantMessage,
    ];
    touchSession(sessionId, "Support");

    return {
      emergency: true,
      message: assistantMessage.content,
      hotlines: [
        { name: "988 Suicide & Crisis Lifeline", number: "988" },
        { name: "Emergency Services", number: "911" },
      ],
      disclaimer:
        "This demo response is informational only and not a substitute for emergency care.",
      user_message: clone(userMessage),
      assistant_message: clone(assistantMessage),
    };
  }

  const assistantMessage: ChatMessage = {
    id: nextChatMessageId(),
    session_id: sessionId,
    user_id: DEMO_USER_ID,
    role: "assistant",
    content: makeAssistantReply(content),
    created_at: timestamp,
  };

  demoChatMessages[sessionId] = [
    ...(demoChatMessages[sessionId] ?? []),
    userMessage,
    assistantMessage,
  ];
  touchSession(sessionId, content.slice(0, 36));

  return {
    answer: assistantMessage.content,
    disclaimer: "This demo response is informational only and not medical advice.",
    user_message: clone(userMessage),
    assistant_message: clone(assistantMessage),
  };
}

export function getDemoSurveyQuestions(): SurveyQuestion[] {
  return clone(demoSurveyQuestions);
}

export function submitDemoSurveyResponses(data: {
  answers: { question_id: string; response_value: string }[];
  survey_context: "onboarding" | "periodic_checkin";
}): SurveyResponse[] {
  const respondedAt = new Date().toISOString();

  demoSurveyResponses = data.answers.map((answer, index) => ({
    id: `survey-response-${index + 1}`,
    question_id: answer.question_id,
    response_value: answer.response_value,
    survey_context: data.survey_context,
    responded_at: respondedAt,
  }));

  return clone(demoSurveyResponses);
}

export function getDemoSurveyResponses(): SurveyResponse[] {
  return clone(demoSurveyResponses);
}

export function seedDemoData(): DataSource {
  if (!demoSources.length) {
    return createDemoSource({ source_type: "healthkit" });
  }

  demoSources[0] = {
    ...demoSources[0],
    last_synced_at: new Date().toISOString(),
    is_active: true,
  };

  return clone(demoSources[0]);
}

export function completeDemoOnboarding(): Record<string, unknown> {
  demoUser = {
    ...demoUser,
    onboarded_at: new Date().toISOString(),
  };

  return { ok: true };
}
