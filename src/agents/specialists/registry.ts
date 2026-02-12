/**
 * Specialist Agent Registry
 *
 * Defines domain-specific agent configurations for auto-delegation.
 * Each specialist focuses on a subset of Dewx platform routers and
 * DewBot core tools, enabling efficient task routing to the right expert.
 */

export type SpecialistConfig = {
  id: string;
  name: string;
  description: string;
  dewxRouters: string[];
  coreTools: string[];
  systemPromptAddition: string;
  preferredModel: string;
  keywords: string[];
};

export const SPECIALIST_REGISTRY: SpecialistConfig[] = [
  {
    id: "sales-agent",
    name: "Sales Specialist",
    description:
      "Handles CRM contacts, deals, pipeline management, lead scoring, competitive analysis, and sales coaching.",
    dewxRouters: [
      "crm_contacts",
      "crm_deals",
      "crm_pipeline",
      "crm_companies",
      "crm_activities",
      "crm_tasks",
      "sales_lead_scoring",
      "sales_deal_risk",
      "sales_competitive",
      "sales_coaching",
    ],
    coreTools: ["dewx_platform", "web_search", "web_fetch"],
    systemPromptAddition: [
      "You are a sales specialist agent with deep expertise in CRM operations, pipeline management, and deal strategy.",
      "Focus on actionable insights: lead prioritization, deal risk assessment, and next-best-action recommendations.",
      "When analyzing deals, always consider stage velocity, engagement recency, and competitive positioning.",
      "Use the Dewx platform CRM routers to fetch and update contacts, deals, companies, and activities.",
      "Proactively suggest follow-up actions and flag stale or at-risk deals.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "contact",
      "lead",
      "deal",
      "pipeline",
      "prospect",
      "close",
      "quota",
      "sales",
      "opportunity",
      "account",
    ],
  },
  {
    id: "finance-agent",
    name: "Finance Specialist",
    description:
      "Manages invoices, expenses, payments, quotes, financial reporting, and revenue forecasting.",
    dewxRouters: [
      "finance_invoices",
      "finance_expenses",
      "finance_payments",
      "finance_reports",
      "finance_advanced",
      "finance_quotes",
      "finance_forecasting",
    ],
    coreTools: ["dewx_platform", "web_search"],
    systemPromptAddition: [
      "You are a finance specialist agent with expertise in invoicing, expense management, and financial analysis.",
      "Ensure accuracy in all financial calculations and clearly communicate monetary values with proper formatting.",
      "When creating invoices or quotes, validate line items, tax rates, and payment terms before submission.",
      "Use the Dewx platform finance routers for all invoice, expense, payment, and reporting operations.",
      "Flag anomalies in spending patterns and provide clear summaries of financial health metrics.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "invoice",
      "expense",
      "payment",
      "budget",
      "revenue",
      "profit",
      "forecast",
      "accounting",
      "tax",
      "financial",
    ],
  },
  {
    id: "hr-agent",
    name: "HR Specialist",
    description:
      "Handles employee management, payroll, benefits administration, compliance, recruiting, and performance reviews.",
    dewxRouters: [
      "hr_employees",
      "hr_payroll",
      "hr_benefits",
      "hr_compliance",
      "hr_onboarding",
      "hr_recruiting",
      "hr_performance",
      "hr_leave",
      "hr_attendance",
      "hr_dashboard",
      "hr_self_service",
      "hr_documents",
      "hr_health",
      "hr_tax",
      "hr_departments",
    ],
    coreTools: ["dewx_platform"],
    systemPromptAddition: [
      "You are an HR specialist agent with expertise in employee lifecycle management, payroll, and compliance.",
      "Handle sensitive employee data with care and always respect privacy requirements.",
      "When processing payroll or benefits changes, double-check effective dates and eligibility criteria.",
      "Use the Dewx platform HR routers for employee records, leave management, attendance, and department operations.",
      "Provide clear guidance on company policies and flag any compliance concerns proactively.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "employee",
      "payroll",
      "benefit",
      "compliance",
      "hire",
      "onboard",
      "leave",
      "attendance",
      "performance",
      "recruiting",
    ],
  },
  {
    id: "marketing-agent",
    name: "Marketing Specialist",
    description:
      "Manages campaigns, content creation, SEO optimization, social media strategy, and A/B testing.",
    dewxRouters: [
      "marketing_campaigns",
      "marketing_content",
      "marketing_seo",
      "marketing_social",
      "marketing_email",
      "marketing_ab_testing",
    ],
    coreTools: ["dewx_platform", "web_search", "web_fetch"],
    systemPromptAddition: [
      "You are a marketing specialist agent with expertise in campaign management, content strategy, and growth optimization.",
      "Focus on data-driven recommendations: conversion rates, engagement metrics, and audience segmentation.",
      "When planning campaigns, consider channel mix, timing, budget allocation, and A/B testing opportunities.",
      "Use the Dewx platform marketing routers for campaign operations, content management, and analytics.",
      "Provide creative suggestions backed by performance data and industry best practices.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "campaign",
      "content",
      "seo",
      "social media",
      "marketing",
      "blog",
      "newsletter",
      "audience",
      "engagement",
      "brand",
    ],
  },
  {
    id: "devops-agent",
    name: "DevOps Specialist",
    description:
      "Handles CI/CD pipelines, deployment management, infrastructure monitoring, and server administration.",
    dewxRouters: [],
    coreTools: ["exec", "browser", "web_search", "web_fetch"],
    systemPromptAddition: [
      "You are a DevOps specialist agent with expertise in CI/CD, deployment, monitoring, and infrastructure management.",
      "Prioritize safety: always verify commands before execution, use dry-run modes when available, and avoid destructive operations without confirmation.",
      "When debugging infrastructure issues, gather logs and metrics systematically before suggesting fixes.",
      "Use the exec tool for server commands, and web tools for monitoring dashboards and documentation lookup.",
      "Provide clear rollback plans for any deployment or infrastructure changes.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "deploy",
      "ci",
      "cd",
      "server",
      "docker",
      "kubernetes",
      "monitoring",
      "logs",
      "infrastructure",
      "devops",
    ],
  },
  {
    id: "support-agent",
    name: "Support Specialist",
    description:
      "Manages support tickets, knowledge base queries, customer health monitoring, and SLA tracking.",
    dewxRouters: ["support_tickets", "support_knowledge", "support_sla", "support_chatbot"],
    coreTools: ["dewx_platform", "web_search"],
    systemPromptAddition: [
      "You are a support specialist agent with expertise in customer issue resolution, knowledge base management, and SLA compliance.",
      "Prioritize customer satisfaction: acknowledge the issue, investigate thoroughly, and provide clear resolution steps.",
      "When handling tickets, check for related past issues, knowledge base articles, and escalation requirements.",
      "Use the Dewx platform support routers for ticket operations, knowledge base queries, and SLA tracking.",
      "Track response and resolution times against SLA targets and flag potential breaches early.",
    ].join(" "),
    preferredModel: "claude-sonnet",
    keywords: [
      "ticket",
      "support",
      "customer issue",
      "bug report",
      "sla",
      "knowledge base",
      "help desk",
      "escalation",
    ],
  },
  {
    id: "research-agent",
    name: "Research Specialist",
    description:
      "Conducts deep research, competitive analysis, market studies, benchmarking, and comprehensive report generation.",
    dewxRouters: [],
    coreTools: ["web_search", "web_fetch", "browser"],
    systemPromptAddition: [
      "You are a research specialist agent with expertise in deep investigation, analysis, and report generation.",
      "Be thorough and methodical: gather information from multiple sources, cross-reference findings, and cite sources.",
      "When conducting research, structure your findings with clear sections, key takeaways, and actionable recommendations.",
      "Use web search and fetch tools extensively to gather current data, statistics, and expert opinions.",
      "Provide balanced analysis that considers multiple perspectives and highlights confidence levels in conclusions.",
    ].join(" "),
    preferredModel: "claude-opus",
    keywords: [
      "research",
      "analyze",
      "investigate",
      "compare",
      "study",
      "find out",
      "deep dive",
      "report",
      "benchmark",
    ],
  },
];

/**
 * Retrieve a specialist configuration by its ID.
 */
export function getSpecialist(id: string): SpecialistConfig | undefined {
  const normalized = id.trim().toLowerCase();
  return SPECIALIST_REGISTRY.find((s) => s.id === normalized);
}

/**
 * Find the best matching specialist based on keyword matches in the message.
 * Returns null if no specialist has at least 2 keyword matches.
 *
 * Multi-word keywords (e.g. "social media") are matched as exact substrings.
 * Single-word keywords are matched as whole words using word boundary detection.
 */
export function findSpecialistByKeywords(message: string): SpecialistConfig | null {
  const lower = message.toLowerCase();

  let bestSpecialist: SpecialistConfig | null = null;
  let bestScore = 0;

  for (const specialist of SPECIALIST_REGISTRY) {
    let matches = 0;

    for (const keyword of specialist.keywords) {
      if (keyword.includes(" ")) {
        // Multi-word keyword: match as substring
        if (lower.includes(keyword)) {
          matches++;
        }
      } else {
        // Single-word keyword: match with word boundaries
        const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
        if (pattern.test(lower)) {
          matches++;
        }
      }
    }

    if (matches > bestScore) {
      bestScore = matches;
      bestSpecialist = specialist;
    }
  }

  // Require at least 2 keyword matches to return a specialist
  if (bestScore < 2) {
    return null;
  }

  return bestSpecialist;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
