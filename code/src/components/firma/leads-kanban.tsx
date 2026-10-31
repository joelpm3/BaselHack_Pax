"use client";

import { Bot } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { setLeadStatus } from "@/app/[locale]/firma/actions";
import { Link } from "@/i18n/navigation";
import {
  LEAD_STATUSES,
  type LeadStatus,
  type LeadType,
  type Priority,
} from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";
import { PRIORITY_MARK } from "./badges";
import { LeadStatusSelect } from "./controls";
import { customerHref } from "./customer-link";

export interface KanbanLead {
  id: string;
  status: LeadStatus;
  type: LeadType;
  priority: Priority;
  score: number;
  name: string;
  city: string | null;
  reasonToCall: string;
  customerId: string;
  /** The person also has an open handover (wants a human). */
  hasOpenHandover: boolean;
  isSimulated: boolean;
  assignee: string | null;
}

/** Pipeline board: drag a card to another column (or use its status menu) to move the lead. */
export function LeadsKanban({ leads }: { leads: KanbanLead[] }) {
  const t = useTranslations("firma.leads");
  const tStatus = useTranslations("common.taxonomy.leadStatus");
  const tType = useTranslations("common.taxonomy.leadType");
  const tPriority = useTranslations("common.taxonomy.priority");
  const tKinds = useTranslations("firmaCustomers.kinds");
  const [, start] = useTransition();
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);
  const [optimistic, move] = useOptimistic(
    leads,
    (current, change: { id: string; status: LeadStatus }) =>
      current.map((l) => (l.id === change.id ? { ...l, status: change.status } : l)),
  );

  const drop = (status: LeadStatus, id: string) => {
    setDragOver(null);
    const lead = optimistic.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    start(async () => {
      move({ id, status });
      await setLeadStatus(id, status);
    });
  };

  return (
    <div className="-mx-4 min-w-0 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="grid min-w-[80rem] grid-cols-6 gap-3">
        {LEAD_STATUSES.map((status) => {
          const column = optimistic.filter((l) => l.status === status);
          return (
            <section
              key={status}
              aria-label={tStatus(status)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(status, e.dataTransfer.getData("text/plain"));
              }}
              className={cn(
                "grid min-w-0 grid-cols-1 content-start gap-2 rounded-xl bg-gray-1 p-2 transition-colors",
                dragOver === status && "bg-light-purple",
              )}
            >
              <h2 className="flex items-center justify-between px-1.5 pt-1 pb-0.5 font-bold">
                {tStatus(status)}
                <span className="font-normal tabular-nums text-fg-muted">{column.length}</span>
              </h2>
              {column.map((lead) => (
                <article
                  key={lead.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", lead.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="grid min-w-0 cursor-grab grid-cols-1 gap-2 rounded-m border border-line bg-surface p-3 active:cursor-grabbing"
                >
                  <div className="flex items-center gap-2">
                    <span
                      role="img"
                      aria-label={tPriority(lead.priority)}
                      title={tPriority(lead.priority)}
                      className={cn("size-2 shrink-0", PRIORITY_MARK[lead.priority])}
                    />
                    <Link
                      href={customerHref(lead.customerId, "leads")}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {lead.name}
                    </Link>
                    {lead.isSimulated ? (
                      <Bot
                        aria-label={t("simulated")}
                        className="size-3.5 shrink-0 text-fg-muted"
                      />
                    ) : null}
                    <span className="font-bold tabular-nums">{lead.score}</span>
                  </div>
                  <p className="text-xs text-fg-muted">
                    {tType(lead.type)}
                    {lead.city ? ` · ${lead.city}` : ""}
                  </p>
                  <p className="line-clamp-3 text-xs">{lead.reasonToCall}</p>
                  {lead.hasOpenHandover ? (
                    <Link
                      href={customerHref(lead.customerId, "handovers")}
                      className="justify-self-start rounded-full bg-warning-light px-2 py-0.5 text-xs font-medium text-warning-dark hover:underline"
                    >
                      {tKinds("handover.alsoOpen")}
                    </Link>
                  ) : null}
                  <p className="truncate text-xs text-fg-muted">
                    {lead.assignee ?? t("unassigned")}
                  </p>
                  <LeadStatusSelect
                    leadId={lead.id}
                    status={lead.status}
                    className="h-7 w-full text-xs"
                  />
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
