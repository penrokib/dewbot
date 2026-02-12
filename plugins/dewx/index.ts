/**
 * DewBot Plugin — Dewx business tools for DewBot
 *
 * Registers 32 business tools (CRM, outreach, inbox, finance, HR, analytics, workflow),
 * a proactive monitoring service, and DewBot system prompt injection.
 */

import type { DewBotPluginDefinition } from "../../src/plugin-sdk/index.js";
import { DewxApiClient } from "./dewx-client.js";
// Services
import { createProactiveService } from "./services/proactive.js";
import { DEWBOT_SYSTEM_PROMPT } from "./system-prompt.js";
// Tool imports — Analytics (4)
import { createBusinessHealthTool } from "./tools/analytics/business-health.js";
import { createMetricsTool } from "./tools/analytics/metrics.js";
import { createReportsTool } from "./tools/analytics/reports.js";
import { createTrendsTool } from "./tools/analytics/trends.js";
import { createActivitiesTool } from "./tools/crm/activities.js";
import { createCompaniesTool } from "./tools/crm/companies.js";
import { createCompetitorTool } from "./tools/crm/competitor.js";
// Tool imports — CRM (10)
import { createContactsTool } from "./tools/crm/contacts.js";
import { createDealRiskTool } from "./tools/crm/deal-risk.js";
import { createDealsTool } from "./tools/crm/deals.js";
import { createLeadScoringTool } from "./tools/crm/lead-scoring.js";
import { createPipelineTool } from "./tools/crm/pipeline.js";
import { createSalesCoachingTool } from "./tools/crm/sales-coaching.js";
import { createCrmTasksTool } from "./tools/crm/tasks.js";
import { createExpensesTool } from "./tools/finance/expenses.js";
// Tool imports — Finance (3)
import { createInvoicesTool } from "./tools/finance/invoices.js";
import { createPaymentsTool } from "./tools/finance/payments.js";
import { createAttendanceTool } from "./tools/hr/attendance.js";
import { createDepartmentsTool } from "./tools/hr/departments.js";
// Tool imports — HR (4)
import { createEmployeesTool } from "./tools/hr/employees.js";
import { createLeaveTool } from "./tools/hr/leave.js";
import { createClassifyTool } from "./tools/inbox/classify.js";
// Tool imports — Inbox (4)
import { createInboxConversationsTool } from "./tools/inbox/conversations.js";
import { createInboxMessagesTool } from "./tools/inbox/messages.js";
import { createSmartReplyTool } from "./tools/inbox/smart-reply.js";
import { createCampaignsTool } from "./tools/outreach/campaigns.js";
import { createEmailsTool } from "./tools/outreach/emails.js";
// Tool imports — Outreach (5)
import { createSequencesTool } from "./tools/outreach/sequences.js";
import { createSocialActionsTool } from "./tools/outreach/social-actions.js";
import { createTemplatesTool } from "./tools/outreach/templates.js";
// Tool imports — Workflow (2)
import { createAutomationTool } from "./tools/workflow/automation.js";
import { createNotificationsTool } from "./tools/workflow/notifications.js";

const plugin: DewBotPluginDefinition = {
  id: "dewx",
  name: "Dewx Business Tools",
  description:
    "32 business tools for CRM, outreach, inbox, finance, HR, analytics, and workflow automation",
  version: "1.0.0",

  register: (api) => {
    const config = api.config;

    // Read Dewx config: prefer per-plugin config (plugins.entries.dewx.config), fallback to top-level dewx key
    const pluginEntryConfig = config.plugins?.entries?.["dewx"]?.config as
      | { baseUrl?: string; orgId?: string; jwt?: string; proactive?: Record<string, unknown> }
      | undefined;
    const topLevelConfig = (config as Record<string, unknown>).dewx as
      | { baseUrl?: string; orgId?: string; jwt?: string; proactive?: Record<string, unknown> }
      | undefined;
    const dewxConfig = pluginEntryConfig ?? topLevelConfig;

    if (!dewxConfig?.baseUrl || !dewxConfig?.orgId) {
      api.logger.warn(
        "Dewx plugin: missing dewx.baseUrl or dewx.orgId in config — tools will not be registered",
      );
      return;
    }

    const client = new DewxApiClient({
      baseUrl: dewxConfig.baseUrl,
      orgId: dewxConfig.orgId,
      jwt: dewxConfig.jwt,
    });

    // Register all 32 tools
    const tools = [
      // CRM (10)
      createContactsTool(client),
      createDealsTool(client),
      createCompaniesTool(client),
      createActivitiesTool(client),
      createCrmTasksTool(client),
      createPipelineTool(client),
      createLeadScoringTool(client),
      createDealRiskTool(client),
      createCompetitorTool(client),
      createSalesCoachingTool(client),
      // Outreach (5)
      createSequencesTool(client),
      createCampaignsTool(client),
      createEmailsTool(client),
      createSocialActionsTool(client),
      createTemplatesTool(client),
      // Inbox (4)
      createInboxConversationsTool(client),
      createInboxMessagesTool(client),
      createSmartReplyTool(client),
      createClassifyTool(client),
      // Finance (3)
      createInvoicesTool(client),
      createExpensesTool(client),
      createPaymentsTool(client),
      // HR (4)
      createEmployeesTool(client),
      createDepartmentsTool(client),
      createAttendanceTool(client),
      createLeaveTool(client),
      // Analytics (4)
      createBusinessHealthTool(client),
      createReportsTool(client),
      createMetricsTool(client),
      createTrendsTool(client),
      // Workflow (2)
      createAutomationTool(client),
      createNotificationsTool(client),
    ];

    for (const tool of tools) {
      api.registerTool(tool);
    }

    api.logger.info(`Dewx plugin: registered ${tools.length} business tools`);

    // Inject DewBot system prompt into every agent session
    api.on("before_agent_start", (_event, _ctx) => {
      return { prependContext: DEWBOT_SYSTEM_PROMPT };
    });

    // Register proactive monitoring service
    const proactiveConfig = dewxConfig.proactive as
      | {
          enabled?: boolean;
          staleDealDays?: number;
          dailySummaryHour?: number;
          alertChannel?: string;
        }
      | undefined;

    if (proactiveConfig?.enabled !== false) {
      api.registerService(
        createProactiveService(client, {
          staleDealDays: proactiveConfig?.staleDealDays ?? 7,
          dailySummaryHour: proactiveConfig?.dailySummaryHour ?? 9,
          alertChannel: proactiveConfig?.alertChannel ?? "whatsapp",
        }),
      );
    }

    api.logger.info("Dewx plugin: fully initialized");
  },
};

export default plugin;
