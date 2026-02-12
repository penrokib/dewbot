/**
 * Workflow Templates
 *
 * Pre-built workflow definitions for common business operations.
 * These templates are used by the workflow engine and can be
 * triggered by cron schedules, events, or manually.
 */

import type { WorkflowDefinition } from "./engine.js";

// ---- Templates ------------------------------------------------------------

const dailyBusinessBriefing: WorkflowDefinition = {
  id: "daily-business-briefing",
  name: "Daily Business Briefing",
  description:
    "Generates a morning briefing with business health, pipeline status, overdue invoices, and today's meetings.",
  trigger: {
    type: "cron",
    config: { expr: "0 9 * * 1-5" },
  },
  steps: [
    {
      id: "health-score",
      name: "Get business health score",
      tool: "dewx_platform",
      params: {
        router: "business_health",
        action: "get_score",
      },
      onError: "skip",
    },
    {
      id: "pipeline-summary",
      name: "Get pipeline summary",
      tool: "dewx_platform",
      params: {
        router: "crm_pipeline",
        action: "get_stats",
      },
      onError: "skip",
    },
    {
      id: "overdue-invoices",
      name: "Get overdue invoices",
      tool: "dewx_platform",
      params: {
        router: "finance_invoices",
        action: "list",
        status: "overdue",
      },
      onError: "skip",
    },
    {
      id: "todays-meetings",
      name: "Get today's meetings",
      tool: "dewx_platform",
      params: {
        router: "scheduler",
        action: "list_today",
      },
      onError: "skip",
    },
  ],
};

const invoicePaymentReminder: WorkflowDefinition = {
  id: "invoice-payment-reminder",
  name: "Invoice Payment Reminder",
  description:
    "Checks for overdue invoices daily and sends escalating reminders based on how many days past due.",
  trigger: {
    type: "cron",
    config: { expr: "0 10 * * *" },
  },
  steps: [
    {
      id: "list-overdue",
      name: "List overdue invoices",
      tool: "dewx_platform",
      params: {
        router: "finance_invoices",
        action: "list",
        status: "overdue",
      },
      onError: "abort",
    },
    {
      id: "classify-overdue",
      name: "Classify invoices by days overdue",
      tool: "dewx_platform",
      params: {
        router: "finance_invoices",
        action: "classify_overdue",
        invoices: "{{steps.list-overdue.data}}",
        thresholds: [3, 7, 14],
      },
      condition: {
        field: "success",
        operator: "eq",
        value: true,
      },
      onError: "skip",
    },
    {
      id: "send-reminders",
      name: "Send payment reminders",
      tool: "dewx_platform",
      params: {
        router: "finance_invoices",
        action: "send_reminders",
        classified: "{{steps.classify-overdue.data}}",
      },
      condition: {
        field: "success",
        operator: "eq",
        value: true,
      },
      onError: "skip",
      retryCount: 2,
      retryDelayMs: 5_000,
    },
  ],
};

const newLeadNurture: WorkflowDefinition = {
  id: "new-lead-nurture",
  name: "New Lead Nurture",
  description:
    "Automatically enriches, scores, and routes new leads when they are created in the CRM.",
  trigger: {
    type: "event",
    config: { event: "lead_created" },
  },
  variables: {
    scoreThreshold: 70,
  },
  steps: [
    {
      id: "get-lead",
      name: "Get lead details",
      tool: "dewx_platform",
      params: {
        router: "crm_contacts",
        action: "get",
        id: "{{leadId}}",
      },
      onError: "abort",
    },
    {
      id: "search-knowledge",
      name: "Search knowledge base for relevant info",
      tool: "knowledge_search",
      params: {
        query: "{{steps.get-lead.data.company}} {{steps.get-lead.data.industry}}",
        limit: 5,
      },
      onError: "skip",
    },
    {
      id: "score-lead",
      name: "Score the lead",
      tool: "dewx_platform",
      params: {
        router: "sales_lead_scoring",
        action: "score",
        contactId: "{{steps.get-lead.data.id}}",
        context: "{{steps.search-knowledge.data}}",
      },
      onError: "skip",
    },
    {
      id: "assign-rep",
      name: "Assign to sales rep if score > 70",
      tool: "dewx_platform",
      params: {
        router: "crm_contacts",
        action: "assign",
        contactId: "{{steps.get-lead.data.id}}",
        autoAssign: true,
      },
      condition: {
        field: "data.score",
        operator: "gt",
        value: 70,
      },
      onError: "skip",
    },
  ],
};

const employeeOnboarding: WorkflowDefinition = {
  id: "employee-onboarding",
  name: "Employee Onboarding",
  description:
    "Automates the new employee onboarding process: creates tasks, sends welcome email, enrolls in benefits, and schedules orientation.",
  trigger: {
    type: "event",
    config: { event: "employee_created" },
  },
  steps: [
    {
      id: "create-tasks",
      name: "Create onboarding task list",
      tool: "dewx_platform",
      params: {
        router: "hr_onboarding",
        action: "create",
        employeeId: "{{employeeId}}",
      },
      onError: "abort",
    },
    {
      id: "welcome-email",
      name: "Send welcome email",
      tool: "dewx_platform",
      params: {
        router: "hr_onboarding",
        action: "send_welcome",
        employeeId: "{{employeeId}}",
        onboardingId: "{{steps.create-tasks.data.id}}",
      },
      onError: "skip",
      retryCount: 2,
      retryDelayMs: 3_000,
    },
    {
      id: "benefits-enrollment",
      name: "Add to benefits enrollment",
      tool: "dewx_platform",
      params: {
        router: "hr_benefits",
        action: "enroll",
        employeeId: "{{employeeId}}",
      },
      onError: "skip",
    },
    {
      id: "schedule-orientation",
      name: "Schedule orientation meeting",
      tool: "dewx_platform",
      params: {
        router: "scheduler",
        action: "create",
        title: "New Employee Orientation",
        attendees: ["{{employeeId}}", "{{managerId}}"],
        durationMinutes: 60,
        schedulingWindow: "next_3_days",
      },
      onError: "skip",
    },
  ],
};

const weeklyPipelineReview: WorkflowDefinition = {
  id: "weekly-pipeline-review",
  name: "Weekly Pipeline Review",
  description:
    "Runs every Friday afternoon: gathers pipeline stats, identifies stagnant deals, debates strategy with the AI council, and generates a report.",
  trigger: {
    type: "cron",
    config: { expr: "0 14 * * 5" },
  },
  steps: [
    {
      id: "pipeline-stats",
      name: "Get pipeline stats",
      tool: "dewx_platform",
      params: {
        router: "crm_pipeline",
        action: "get_stats",
      },
      onError: "skip",
    },
    {
      id: "stagnant-deals",
      name: "Get stagnant deals (> 7 days no update)",
      tool: "dewx_platform",
      params: {
        router: "crm_pipeline",
        action: "list_stagnant",
        staleDays: 7,
      },
      onError: "skip",
    },
    {
      id: "council-debate",
      name: "Run council debate on pipeline strategy",
      tool: "council_debate",
      params: {
        topic: "Weekly pipeline review and strategy recommendations",
        context: {
          pipelineStats: "{{steps.pipeline-stats.data}}",
          stagnantDeals: "{{steps.stagnant-deals.data}}",
        },
      },
      onError: "skip",
    },
    {
      id: "generate-report",
      name: "Generate weekly pipeline report",
      tool: "dewx_platform",
      params: {
        router: "crm_pipeline",
        action: "generate_report",
        stats: "{{steps.pipeline-stats.data}}",
        stagnant: "{{steps.stagnant-deals.data}}",
        recommendations: "{{steps.council-debate.data}}",
      },
      onError: "skip",
    },
  ],
};

// ---- Exports --------------------------------------------------------------

export const WORKFLOW_TEMPLATES: WorkflowDefinition[] = [
  dailyBusinessBriefing,
  invoicePaymentReminder,
  newLeadNurture,
  employeeOnboarding,
  weeklyPipelineReview,
];

/**
 * Look up a workflow template by its ID.
 */
export function getWorkflowTemplate(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
