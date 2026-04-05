#!/usr/bin/env node

const assert = require("assert");
const {
  createIntakeSession,
  getCurrentField,
  applyAnswer,
  listMissingRequiredFields,
  buildTaskFromIntake,
} = require("./project-intake-workflow-v1");

const session = createIntakeSession(
  "Need to plan a Next.js app for mobile detailing with quote flow and dashboard.",
  "123",
);

assert.strictEqual(getCurrentField(session).key, "project_name");
applyAnswer(session, "Mobile Detailing App");
applyAnswer(session, "Service booking app for a mobile detailing business.");
applyAnswer(session, "Consumers and repeat fleet clients.");
applyAnswer(session, "Launch a planning-first v1 for bookings and quotes.");
applyAnswer(session, "Hero, quote form, contact form, testimonials.");

assert.deepStrictEqual(listMissingRequiredFields(session), []);

const task = buildTaskFromIntake(session);
assert.strictEqual(task.status, "Draft");
assert.strictEqual(task.workflow_stage, "Task Intake");
assert.strictEqual(task.current_prompt_template, "Project intake / planning prompt");
assert.strictEqual(task.planning_only, true);
assert.match(task.task_id, /^mobile-detailing-app-intake-\d{14}$/);
assert.match(task.body.full_context, /Users \/ Audience:/);
assert.match(task.body.proposed_action, /project plan/i);

const noisySession = {
  answers: {
    initial_prompt:
      "Need to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.",
    project_name: "/set project name: Mobiledets",
    short_description:
      "Need to plan a Next.js app for a mobile detailing business with iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat or large clients, single-page hero, image modal, testimonials, hosted on Vercel with MongoDB.",
    users_audience: "website for mobile detailer Miguel",
    core_goal:
      "Launch a polished single-page mobile detailing site that captures leads and supports quotes.",
    required_features:
      "email server built in, sanitized inputs from forms and submittals to db, place holder modal and testimonies",
    nice_to_have_features:
      "iPhone calendar sync, dark theme with light blue accents, quote/contact form, possible customer dashboard for repeat/large clients. Single page, hero, image modal, testimonies. Hosted on vercel with Mongodb",
    preferred_stack: "next.js",
    hosting_infra: "vercel",
    design_direction: "dark theme blue highlights",
    known_constraints:
      "All file writes must occur in \"E:\\Mobiledets\". Hosted on Vercel. MongoDB backend. Single-page v1.",
    unknowns_questions: "skip",
    allowed_assumptions:
      "Placeholder images and testimonials are allowed. Placeholder API keys may be used only in env example files until real credentials are provided.",
    escalate_if_missing: "no",
    definition_of_v1_done:
      "A deployable single-page Next.js app on Vercel with hero section, gallery modal, testimonials, quote/contact form, dark theme with blue accents, MongoDB-backed submissions.",
  },
};

const cleanedTask = buildTaskFromIntake(noisySession);
assert.strictEqual(cleanedTask.title, "Mobiledets - Project Intake");
assert.match(cleanedTask.task_id, /^mobiledets-intake-\d{14}$/);
assert.strictEqual(cleanedTask.planning_only, true);
assert.ok(cleanedTask.body.full_context.includes("Required Features:\niPhone calendar sync"));
assert.ok(cleanedTask.body.full_context.includes("Nice-to-Have Features:\nemail server built in"));
assert.ok(!cleanedTask.body.full_context.includes("Unknowns / Questions:\nskip"));
assert.ok(!cleanedTask.body.constraints_guardrails.includes("Open questions:\nskip"));
assert.ok(!cleanedTask.body.constraints_guardrails.includes("Definition of v1 done"));
assert.strictEqual(cleanedTask.operator_notes, "Created from Telegram project intake.");

console.log("project intake workflow smoke test passed");
