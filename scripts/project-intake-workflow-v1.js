#!/usr/bin/env node

const {
  STATUS,
  STAGE,
  APPROVAL_GATE,
  normalizeTask,
  sanitizeText,
} = require("./reviews-approvals-workflow-v1");

const PROJECT_INTAKE_TEMPLATE = "Project intake / planning prompt";

const INTAKE_FIELDS = Object.freeze([
  {
    key: "project_name",
    label: "Project Name",
    prompt: "Project name?",
    required: true,
  },
  {
    key: "short_description",
    label: "Short Description",
    prompt: "Short description? One short paragraph is enough.",
    required: true,
  },
  {
    key: "users_audience",
    label: "Users / Audience",
    prompt: "Who is this for?",
    required: true,
  },
  {
    key: "core_goal",
    label: "Core Goal",
    prompt: "Core goal? What must this project accomplish?",
    required: true,
  },
  {
    key: "required_features",
    label: "Required Features",
    prompt: "Required features? Reply as bullets, commas, or one paragraph.",
    required: true,
  },
  {
    key: "nice_to_have_features",
    label: "Nice-to-Have Features",
    prompt: "Nice-to-have features? Reply or send /skip.",
    required: false,
  },
  {
    key: "preferred_stack",
    label: "Preferred Stack",
    prompt: "Preferred stack?",
    required: false,
  },
  {
    key: "hosting_infra",
    label: "Hosting / Infra",
    prompt: "Hosting / infra preferences?",
    required: false,
  },
  {
    key: "design_direction",
    label: "Design Direction",
    prompt: "Design direction, theme, or visual constraints?",
    required: false,
  },
  {
    key: "known_constraints",
    label: "Known Constraints",
    prompt: "Known constraints or hard boundaries?",
    required: false,
  },
  {
    key: "unknowns_questions",
    label: "Unknowns / Questions",
    prompt: "Unknowns or open questions? Reply or send /skip.",
    required: false,
  },
  {
    key: "allowed_assumptions",
    label: "Allowed Assumptions",
    prompt: "What placeholders or assumptions are allowed?",
    required: false,
  },
  {
    key: "escalate_if_missing",
    label: "Escalate To Operator If Missing",
    prompt: "What missing information should force escalation instead of guessing?",
    required: false,
  },
  {
    key: "definition_of_v1_done",
    label: "Definition of v1 Done",
    prompt: "Definition of v1 done?",
    required: false,
  },
]);

const FIELD_ALIAS_MAP = new Map(
  INTAKE_FIELDS.flatMap((field) => {
    const normalizedLabel = normalizeFieldName(field.label);
    const normalizedKey = normalizeFieldName(field.key);
    return [
      [normalizedLabel, field.key],
      [normalizedKey, field.key],
    ];
  }),
);

const OPTIONAL_SKIP_VALUES = /^(?:\/?skip|none|n\/a|na|nothing|unknown|no)$/i;
const PRIMARY_FEATURE_HINTS = [
  "hero",
  "gallery",
  "image modal",
  "modal",
  "testimonial",
  "quote",
  "contact",
  "calendar",
  "dashboard",
  "single page",
  "single-page",
  "form",
  "booking",
  "dark theme",
  "vercel",
  "mongodb",
  "next.js",
];
const ANCILLARY_FEATURE_HINTS = [
  "email server",
  "email notification",
  "sanitized",
  "sanitize",
  "placeholder",
  "place holder",
  "copy",
  "legal",
  "analytics",
  "favicon",
  "seo",
];

function createIntakeSession(initialPrompt, chatId) {
  const answers = {};
  const seed = sanitizeText(initialPrompt).trim();
  if (seed) {
    answers.initial_prompt = seed;
    answers.short_description = seed;
  }

  return {
    version: "v1",
    type: "project_intake",
    chat_id: String(chatId || ""),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    current_index: 0,
    editing_field: "",
    answers,
  };
}

function getCurrentField(session) {
  const answers = (session && session.answers) || {};
  const startIndex = Number.isFinite(Number(session.current_index))
    ? Number(session.current_index)
    : 0;

  for (let index = startIndex; index < INTAKE_FIELDS.length; index += 1) {
    const field = INTAKE_FIELDS[index];
    if (!sanitizeText(answers[field.key]).trim()) {
      session.current_index = index;
      return field;
    }
  }

  session.current_index = INTAKE_FIELDS.length;
  return null;
}

function applyAnswer(session, rawAnswer) {
  const field = session.editing_field
    ? getFieldDefinition(session.editing_field)
    : getCurrentField(session);
  if (!field) {
    return session;
  }

  const answer = sanitizeText(rawAnswer).trim();
  session.answers[field.key] = answer;
  session.updated_at = new Date().toISOString();
  session.editing_field = "";
  session.current_index = Math.max(
    Number(session.current_index || 0),
    INTAKE_FIELDS.indexOf(field) + 1,
  );
  getCurrentField(session);
  return session;
}

function skipCurrentField(session) {
  const field = session.editing_field
    ? getFieldDefinition(session.editing_field)
    : getCurrentField(session);
  if (!field) {
    return session;
  }
  session.answers[field.key] = "";
  session.updated_at = new Date().toISOString();
  session.editing_field = "";
  session.current_index = INTAKE_FIELDS.indexOf(field) + 1;
  getCurrentField(session);
  return session;
}

function listMissingRequiredFields(session) {
  const answers = (session && session.answers) || {};
  return INTAKE_FIELDS.filter((field) => field.required)
    .filter((field) => !sanitizeText(answers[field.key]).trim())
    .map((field) => field.label);
}

function isSessionComplete(session) {
  return listMissingRequiredFields(session).length === 0 && !getCurrentField(session);
}

function buildTaskFromIntake(session) {
  const answers = sanitizeAnswers(session.answers || {});
  const featureBuckets = normalizeFeatureBuckets(
    answers.required_features,
    answers.nice_to_have_features,
  );
  const projectName = sanitizeProjectName(answers.project_name || "") || "New Project";
  const taskId = buildTaskId(projectName);
  const features = joinFieldLines(
    "Required Features",
    featureBuckets.required,
    "Nice-to-Have Features",
    featureBuckets.niceToHave,
  );
  const context = [
    fieldBlock(
      "Initial Prompt",
      shouldKeepInitialPrompt(answers.initial_prompt, answers.short_description)
        ? answers.initial_prompt
        : "",
    ),
    fieldBlock("Short Description", answers.short_description),
    fieldBlock("Users / Audience", answers.users_audience),
    fieldBlock("Core Goal", answers.core_goal),
    features,
    fieldBlock("Preferred Stack", answers.preferred_stack),
    fieldBlock("Hosting / Infra", answers.hosting_infra),
    fieldBlock("Design Direction", answers.design_direction),
    fieldBlock("Known Constraints", answers.known_constraints),
    fieldBlock("Allowed Assumptions", normalizeListText(answers.allowed_assumptions)),
    fieldBlock(
      "Escalate To Operator If Missing",
      normalizeListText(answers.escalate_if_missing),
    ),
    fieldBlock("Unknowns / Questions", answers.unknowns_questions),
    fieldBlock("Definition of v1 Done", answers.definition_of_v1_done),
  ]
    .filter(Boolean)
    .join("\n\n");

  const constraints = [
    "- Plan first. Do not implement until the project plan is approved.",
    "- Break approved implementation work into bounded tasks small enough for codex-mini to complete safely.",
    "- Do not invent secrets, credentials, legal text, or production-only values.",
    "- Escalate if missing information changes architecture, integrations, auth, real assets, or production readiness.",
    answers.known_constraints ? `Known constraints:\n${normalizeListText(answers.known_constraints)}` : "",
    answers.allowed_assumptions
      ? `Allowed assumptions:\n${normalizeListText(answers.allowed_assumptions)}`
      : "",
    answers.escalate_if_missing
      ? `Escalate to operator if missing:\n${normalizeListText(answers.escalate_if_missing)}`
      : "",
  ].filter(Boolean).join("\n\n");

  const operatorNotes = "Created from Telegram project intake.";

  return normalizeTask({
    task_id: taskId,
    title: `${projectName} - Project Intake`,
    status: STATUS.DRAFT,
    planning_only: true,
    route_target: "Architect/GPT",
    decision: null,
    risk: inferRisk(answers),
    needs_approval: true,
    execution_allowed: false,
    trigger_reason: `Telegram project intake for ${projectName}`,
    operator_notes: operatorNotes,
    revised_instructions: "",
    sync_status: "Not Synced",
    workflow_stage: STAGE.TASK_INTAKE,
    attempt_count: 1,
    stage_retry_count: 0,
    current_prompt_template: PROJECT_INTAKE_TEMPLATE,
    approval_gate: APPROVAL_GATE.PROMPT,
    metadata: {
      project: "OS-V1",
      owner: "Telegram Intake",
      task_type: "project_intake",
    },
    body: {
      summary: answers.short_description || `Plan the ${projectName} project.`,
      full_context: context,
      proposed_action: [
        `Produce a project plan for ${projectName}.`,
        "Return product scope, architecture, phased roadmap, open questions, and a bounded implementation backlog sized for codex-mini.",
      ].join("\n"),
      why_this_was_triggered: `Telegram intake created a new planning request for ${projectName}.`,
      risk_assessment: `${inferRisk(answers)}. ${riskRationale(answers)}`,
      suggested_route:
        "Architect/GPT for planning, then Qwen/local execution through bounded follow-up tasks after approval.",
      affected_components: buildAffectedComponents({
        ...answers,
        required_features: featureBuckets.required,
        nice_to_have_features: featureBuckets.niceToHave,
      }),
      constraints_guardrails: constraints,
      operator_notes: "",
    },
  });
}

function sanitizeAnswers(answers) {
  return Object.fromEntries(
    Object.entries(answers || {}).map(([key, value]) => {
      const clean = sanitizeText(value).trim();
      if (key === "project_name") {
        return [key, sanitizeProjectName(clean)];
      }
      if (isOptionalField(key) && OPTIONAL_SKIP_VALUES.test(clean)) {
        return [key, ""];
      }
      return [key, clean];
    }),
  );
}

function inferRisk(answers) {
  const haystack = [
    answers.required_features,
    answers.preferred_stack,
    answers.hosting_infra,
    answers.known_constraints,
  ]
    .map((entry) => sanitizeText(entry).toLowerCase())
    .join(" ");

  if (/(payment|auth|oauth|calendar|sync|dashboard|database|mongodb|vercel|deployment|file delete|delete file|production)/i.test(haystack)) {
    return "Medium";
  }
  return "Low";
}

function riskRationale(answers) {
  const risk = inferRisk(answers);
  if (risk === "Medium") {
    return "Integrations, data, deployment, or account-sensitive decisions affect scope and require explicit review.";
  }
  return "Bounded planning-only intake with no direct implementation authorized yet.";
}

function buildAffectedComponents(answers) {
  const features = [answers.required_features, answers.nice_to_have_features]
    .map((entry) => sanitizeText(entry).trim())
    .filter(Boolean)
    .join("\n");

  return [
    answers.preferred_stack ? `- Preferred stack: ${answers.preferred_stack}` : "",
    answers.hosting_infra ? `- Hosting / infra: ${answers.hosting_infra}` : "",
    features ? `- Feature surface: ${features}` : "",
  ].filter(Boolean).join("\n");
}

function fieldBlock(label, value) {
  const clean = sanitizeText(value).trim();
  if (!clean) {
    return "";
  }
  return `${label}:\n${clean}`;
}

function joinFieldLines(...parts) {
  return parts
    .map((entry, index) => (index % 2 === 0 ? null : fieldBlock(parts[index - 1], entry)))
    .filter(Boolean)
    .join("\n\n");
}

function normalizeListText(value) {
  const clean = sanitizeText(value).trim();
  if (!clean) {
    return "";
  }
  const lines = clean
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (lines.length <= 1) {
    return clean;
  }
  return lines.map((entry) => `- ${entry.replace(/^-+\s*/, "")}`).join("\n");
}

function sanitizeProjectName(value) {
  return sanitizeText(value)
    .replace(/^\/set\s+project\s+name\s*:\s*/i, "")
    .trim();
}

function isOptionalField(fieldKey) {
  const field = getFieldDefinition(fieldKey);
  return Boolean(field && !field.required);
}

function normalizeFeatureBuckets(requiredFeatures, niceToHaveFeatures) {
  const required = sanitizeText(requiredFeatures).trim();
  const niceToHave = sanitizeText(niceToHaveFeatures).trim();
  if (!required || !niceToHave) {
    return { required, niceToHave };
  }

  const requiredPrimary = scoreHints(required, PRIMARY_FEATURE_HINTS);
  const requiredAncillary = scoreHints(required, ANCILLARY_FEATURE_HINTS);
  const nicePrimary = scoreHints(niceToHave, PRIMARY_FEATURE_HINTS);
  const niceAncillary = scoreHints(niceToHave, ANCILLARY_FEATURE_HINTS);

  const shouldSwap =
    nicePrimary > requiredPrimary &&
    requiredAncillary >= requiredPrimary &&
    nicePrimary >= Math.max(2, niceAncillary);

  if (!shouldSwap) {
    return { required, niceToHave };
  }

  return {
    required: niceToHave,
    niceToHave: required,
  };
}

function scoreHints(value, hints) {
  const haystack = sanitizeText(value).toLowerCase();
  return hints.reduce((score, hint) => score + (haystack.includes(hint) ? 1 : 0), 0);
}

function shouldKeepInitialPrompt(initialPrompt, shortDescription) {
  const prompt = sanitizeText(initialPrompt).trim();
  const description = sanitizeText(shortDescription).trim();
  if (!prompt) {
    return false;
  }
  if (prompt === description) {
    return false;
  }
  if (prompt.length < 8 && !/\s/.test(prompt)) {
    return false;
  }
  return true;
}

function buildTaskId(projectName) {
  const slug = sanitizeText(projectName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "project";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${slug}-intake-${stamp}`;
}

function formatSessionStatus(session) {
  const field = getCurrentField(session);
  const remainingRequired = listMissingRequiredFields(session);
  const answered = INTAKE_FIELDS.filter((entry) =>
    sanitizeText(session.answers && session.answers[entry.key]).trim(),
  ).length;

  return [
    `Project intake in progress.`,
    `Answered fields: ${answered}/${INTAKE_FIELDS.length}`,
    field ? `Current field: ${field.label}` : "Current field: complete",
    remainingRequired.length > 0
      ? `Required still missing: ${remainingRequired.join(", ")}`
      : "Required still missing: none",
  ].join("\n");
}

function formatSessionReview(session) {
  const answers = sanitizeAnswers(session.answers || {});
  return INTAKE_FIELDS.map((field) => {
    const value = answers[field.key];
    return `${field.label}: ${value || "[blank]"}`;
  }).join("\n\n");
}

function normalizeFieldName(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function resolveFieldKey(value) {
  const normalized = normalizeFieldName(value);
  return FIELD_ALIAS_MAP.get(normalized) || "";
}

function getFieldDefinition(fieldKey) {
  return INTAKE_FIELDS.find((field) => field.key === fieldKey) || null;
}

module.exports = {
  INTAKE_FIELDS,
  PROJECT_INTAKE_TEMPLATE,
  createIntakeSession,
  getCurrentField,
  applyAnswer,
  skipCurrentField,
  listMissingRequiredFields,
  isSessionComplete,
  buildTaskFromIntake,
  formatSessionStatus,
  formatSessionReview,
  resolveFieldKey,
  getFieldDefinition,
};
