/**
 * Proactive Insights Handler
 *
 * Monitors business events and generates proactive notifications
 * when conditions require attention (deal stuck, invoice overdue, etc.)
 *
 * Each check function calls Dewx internal tool router APIs to gather
 * data and produces ProactiveInsight objects sorted by severity.
 * All HTTP calls use 10-second timeouts and graceful error handling
 * (returning empty arrays on failure).
 */

// ─── Types ────────────────────────────────────────────────────

export interface ProactiveInsight {
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  domain: string;
  actionSuggestion?: string;
  timestamp: number;
}

interface DewxExecuteResult {
  success: boolean;
  data?: unknown;
  error?: string;
  message?: string;
}

// ─── Configuration ────────────────────────────────────────────

const DEWX_AI_URL = process.env.DEWBOT_DEWX_AI_URL || "http://localhost:4010";
const SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "";

const REQUEST_TIMEOUT = 10_000; // 10 seconds

// ─── Helpers ──────────────────────────────────────────────────

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SERVICE_SECRET) {
    headers["x-service-secret"] = SERVICE_SECRET;
  }
  return headers;
}

/**
 * Execute a Dewx tool router action via the internal API.
 * Returns null on any failure (network, timeout, non-200, etc.)
 */
async function callToolRouter(
  router: string,
  action: string,
  params: Record<string, unknown>,
  orgId: string,
): Promise<DewxExecuteResult | null> {
  try {
    const response = await fetch(`${DEWX_AI_URL}/internal/tools/${router}/execute`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        orgId,
        action,
        params,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as DewxExecuteResult;
  } catch {
    return null;
  }
}

/**
 * Calculate the number of days between a date string and now.
 */
function daysSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) {
    return 0;
  }
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

// ─── Deal Stagnation Check ───────────────────────────────────

/**
 * Check for deals that haven't been updated in 7+ days.
 *
 * Calls the CRM deals router to list active deals, then identifies
 * those with no activity in the past week.
 *
 * @param orgId - Organization ID
 * @returns Array of insights for stagnant deals
 */
export async function checkDealStagnation(orgId: string): Promise<ProactiveInsight[]> {
  const result = await callToolRouter(
    "crm_deals",
    "list",
    {
      status: "active",
      limit: 50,
    },
    orgId,
  );

  if (!result?.success || !result.data) {
    return [];
  }

  const deals = Array.isArray(result.data)
    ? result.data
    : ((result.data as { items?: unknown[] })?.items ?? []);

  const insights: ProactiveInsight[] = [];
  const now = Date.now();

  for (const deal of deals) {
    if (!deal || typeof deal !== "object") {
      continue;
    }
    const d = deal as Record<string, unknown>;

    const updatedAt = d.updatedAt ?? d.lastActivityAt ?? d.updated_at;
    if (typeof updatedAt !== "string") {
      continue;
    }

    const stagnantDays = daysSince(updatedAt);
    if (stagnantDays < 7) {
      continue;
    }

    const dealName = (d.name ?? d.title ?? "Unknown deal") as string;
    const dealValue = d.value ?? d.amount;
    const valueStr = typeof dealValue === "number" ? ` ($${dealValue.toLocaleString()})` : "";

    let severity: ProactiveInsight["severity"] = "warning";
    if (stagnantDays >= 14) {
      severity = "critical";
    }

    insights.push({
      type: "deal_stagnation",
      severity,
      title: `Deal stagnant: ${dealName}`,
      message: `"${dealName}"${valueStr} has had no activity for ${stagnantDays} days.`,
      domain: "crm",
      actionSuggestion:
        stagnantDays >= 14
          ? `This deal has been inactive for ${stagnantDays} days. Consider reaching out to the contact or re-evaluating the deal stage.`
          : `Follow up on this deal. It has been ${stagnantDays} days since the last update.`,
      timestamp: now,
    });
  }

  return insights;
}

// ─── Overdue Invoices Check ──────────────────────────────────

/**
 * Check for overdue invoices across severity categories.
 *
 * Calls the finance invoices router to list overdue invoices,
 * then categorizes them by days overdue: 3, 7, and 14+ days.
 *
 * @param orgId - Organization ID
 * @returns Array of insights for overdue invoices
 */
export async function checkOverdueInvoices(orgId: string): Promise<ProactiveInsight[]> {
  const result = await callToolRouter(
    "finance_invoices",
    "list",
    {
      status: "overdue",
      limit: 50,
    },
    orgId,
  );

  if (!result?.success || !result.data) {
    return [];
  }

  const invoices = Array.isArray(result.data)
    ? result.data
    : ((result.data as { items?: unknown[] })?.items ?? []);

  const insights: ProactiveInsight[] = [];
  const now = Date.now();

  for (const invoice of invoices) {
    if (!invoice || typeof invoice !== "object") {
      continue;
    }
    const inv = invoice as Record<string, unknown>;

    const dueDate = inv.dueDate ?? inv.due_date;
    if (typeof dueDate !== "string") {
      continue;
    }

    const overdueDays = daysSince(dueDate);
    if (overdueDays < 3) {
      continue;
    }

    const invoiceNumber = (inv.number ?? inv.invoiceNumber ?? "Unknown") as string;
    const amount = inv.amount ?? inv.total;
    const amountStr = typeof amount === "number" ? ` for $${amount.toLocaleString()}` : "";
    const contactName = (inv.contactName ?? inv.customerName ?? "") as string;
    const contactStr = contactName ? ` (${contactName})` : "";

    let severity: ProactiveInsight["severity"];
    let suggestion: string;

    if (overdueDays >= 14) {
      severity = "critical";
      suggestion = `Invoice ${invoiceNumber} is ${overdueDays} days overdue. Consider sending a final notice or escalating to collections.`;
    } else if (overdueDays >= 7) {
      severity = "warning";
      suggestion = `Invoice ${invoiceNumber} is ${overdueDays} days overdue. Send a follow-up reminder to the customer.`;
    } else {
      severity = "info";
      suggestion = `Invoice ${invoiceNumber} is ${overdueDays} days overdue. A gentle payment reminder may be appropriate.`;
    }

    insights.push({
      type: "overdue_invoice",
      severity,
      title: `Overdue invoice: ${invoiceNumber}`,
      message: `Invoice ${invoiceNumber}${amountStr}${contactStr} is ${overdueDays} days past due.`,
      domain: "finance",
      actionSuggestion: suggestion,
      timestamp: now,
    });
  }

  return insights;
}

// ─── Leave Overlap Check ─────────────────────────────────────

interface LeaveEntry {
  employeeId?: string;
  employeeName?: string;
  departmentId?: string;
  departmentName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}

/**
 * Check for overlapping leave periods within the same department.
 *
 * Calls the HR leave router to list upcoming approved leaves,
 * then detects date overlaps among employees in the same department.
 *
 * @param orgId - Organization ID
 * @returns Array of insights for overlapping leave periods
 */
export async function checkLeaveOverlaps(orgId: string): Promise<ProactiveInsight[]> {
  const result = await callToolRouter(
    "hr_leave",
    "list",
    {
      status: "approved",
      upcoming: true,
      limit: 100,
    },
    orgId,
  );

  if (!result?.success || !result.data) {
    return [];
  }

  const leaves = Array.isArray(result.data)
    ? result.data
    : ((result.data as { items?: unknown[] })?.items ?? []);

  // Group leaves by department
  const byDepartment = new Map<string, LeaveEntry[]>();

  for (const leave of leaves) {
    if (!leave || typeof leave !== "object") {
      continue;
    }
    const l = leave as LeaveEntry;

    const deptKey = l.departmentId ?? l.departmentName ?? "unknown";
    if (!deptKey) {
      continue;
    }

    const existing = byDepartment.get(deptKey) ?? [];
    existing.push(l);
    byDepartment.set(deptKey, existing);
  }

  const insights: ProactiveInsight[] = [];
  const now = Date.now();

  // Check for overlaps within each department
  for (const [deptKey, deptLeaves] of Array.from(byDepartment.entries())) {
    if (deptLeaves.length < 2) {
      continue;
    }

    for (let i = 0; i < deptLeaves.length; i++) {
      for (let j = i + 1; j < deptLeaves.length; j++) {
        const a = deptLeaves[i];
        const b = deptLeaves[j];

        if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) {
          continue;
        }

        const aStart = new Date(a.startDate).getTime();
        const aEnd = new Date(a.endDate).getTime();
        const bStart = new Date(b.startDate).getTime();
        const bEnd = new Date(b.endDate).getTime();

        // Check for date overlap: A starts before B ends AND B starts before A ends
        if (aStart <= bEnd && bStart <= aEnd) {
          const nameA = a.employeeName ?? a.employeeId ?? "Employee A";
          const nameB = b.employeeName ?? b.employeeId ?? "Employee B";
          const deptName = a.departmentName ?? deptKey;

          // Calculate overlap duration
          const overlapStart = Math.max(aStart, bStart);
          const overlapEnd = Math.min(aEnd, bEnd);
          const overlapDays = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;

          insights.push({
            type: "leave_overlap",
            severity: overlapDays >= 3 ? "warning" : "info",
            title: `Leave overlap in ${deptName}`,
            message: `${nameA} and ${nameB} have overlapping leave for ${overlapDays} day(s) in the ${deptName} department.`,
            domain: "hr",
            actionSuggestion: `Review staffing coverage for ${deptName} during the overlap period. Consider adjusting schedules or arranging temporary coverage.`,
            timestamp: now,
          });
        }
      }
    }
  }

  return insights;
}

// ─── Aggregated Proactive Check ──────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Run all proactive checks and aggregate results.
 *
 * Executes deal stagnation, overdue invoice, and leave overlap
 * checks in parallel. Results are sorted by severity (critical first,
 * then warning, then info).
 *
 * @param orgId - Organization ID
 * @returns Combined and sorted insights array
 */
export async function runProactiveCheck(orgId: string): Promise<ProactiveInsight[]> {
  const [dealInsights, invoiceInsights, leaveInsights] = await Promise.all([
    checkDealStagnation(orgId),
    checkOverdueInvoices(orgId),
    checkLeaveOverlaps(orgId),
  ]);

  const allInsights = [...dealInsights, ...invoiceInsights, ...leaveInsights];

  // Sort by severity: critical > warning > info
  allInsights.sort((a, b) => {
    const aOrder = SEVERITY_ORDER[a.severity] ?? 99;
    const bOrder = SEVERITY_ORDER[b.severity] ?? 99;
    return aOrder - bOrder;
  });

  return allInsights;
}

// ─── Channel Formatting ──────────────────────────────────────

/**
 * Get an emoji indicator for insight severity.
 */
function severityEmoji(severity: ProactiveInsight["severity"]): string {
  switch (severity) {
    case "critical":
      return "\u{1F534}"; // red circle
    case "warning":
      return "\u{26A0}\u{FE0F}"; // warning sign
    case "info":
      return "\u{2139}\u{FE0F}"; // info sign
    default:
      return "\u{2022}"; // bullet
  }
}

/**
 * Format insights list for messaging channels.
 *
 * Produces a concise, readable list with emoji severity indicators.
 * Limits output to maxItems to keep channel messages manageable.
 *
 * @param insights - Array of proactive insights to format
 * @param maxItems - Maximum number of insights to include (default: 10)
 * @returns Formatted string suitable for chat channels
 */
export function formatInsightsForChannel(insights: ProactiveInsight[], maxItems?: number): string {
  if (insights.length === 0) {
    return "\u{2705} **All clear** - No issues requiring attention at this time.";
  }

  const limit = maxItems ?? 10;
  const displayed = insights.slice(0, limit);

  const lines: string[] = [];

  // Summary header
  const criticalCount = insights.filter((i) => i.severity === "critical").length;
  const warningCount = insights.filter((i) => i.severity === "warning").length;
  const infoCount = insights.filter((i) => i.severity === "info").length;

  const parts: string[] = [];
  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning`);
  }
  if (infoCount > 0) {
    parts.push(`${infoCount} info`);
  }

  lines.push(`**Proactive Insights** (${insights.length} items: ${parts.join(", ")})`);
  lines.push("");

  // Group by domain for readability
  const byDomain = new Map<string, ProactiveInsight[]>();
  for (const insight of displayed) {
    const existing = byDomain.get(insight.domain) ?? [];
    existing.push(insight);
    byDomain.set(insight.domain, existing);
  }

  for (const [domain, domainInsights] of Array.from(byDomain.entries())) {
    const displayDomain = domain.toUpperCase();
    lines.push(`**${displayDomain}:**`);
    for (const insight of domainInsights) {
      lines.push(`  ${severityEmoji(insight.severity)} ${insight.title}`);
      lines.push(`    ${insight.message}`);
      if (insight.actionSuggestion) {
        lines.push(`    _\u{2192} ${insight.actionSuggestion}_`);
      }
    }
    lines.push("");
  }

  if (insights.length > limit) {
    lines.push(`_...and ${insights.length - limit} more items not shown._`);
  }

  return lines.join("\n");
}
