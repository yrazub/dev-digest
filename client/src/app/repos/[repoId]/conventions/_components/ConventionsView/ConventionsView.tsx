/* ConventionsView — /repos/:repoId/conventions (design: Conventions (N7) and
   Conventions · empty). Run Scan on an empty repo, ReScan once a scan exists
   (#45); candidate cards with Accept / Reject / Edit (#46 #47 #49); rejected
   cards are hidden and survive reloads (#48); Create skill appears once one
   candidate is accepted (#50) and opens the merged-skill modal. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import type { ConventionCandidate, ConventionUpdate, Skill } from "@devdigest/shared";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { CreateConventionSkillModal } from "../CreateConventionSkillModal";
import { s } from "./styles";

export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const toast = useToast();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [showRejected, setShowRejected] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState<Skill | null>(null);

  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const candidates = data?.candidates ?? [];
  const open = candidates.filter((c) => c.status !== "rejected");
  const rejected = candidates.filter((c) => c.status === "rejected");
  const accepted = open.filter((c) => c.status === "accepted");
  // Any candidate means a scan ran, even if its scan info is missing.
  const scanned = data?.scan.last_scan_at != null || candidates.length > 0;

  const patch = (c: ConventionCandidate, change: ConventionUpdate) => update.mutate({ id: c.id, patch: change });
  const scan = () =>
    extract.mutate(undefined, {
      onSuccess: (res) => {
        const fresh = res.candidates.filter((c) => c.status === "pending").length;
        toast.success(t("page.scanDone", { count: fresh }));
      },
    });
  const deselectAll = () => accepted.forEach((c) => patch(c, { status: "pending" }));

  const card = (c: ConventionCandidate) => (
    <ConventionCard
      key={c.id}
      candidate={c}
      onToggleAccept={() => patch(c, { status: c.status === "accepted" ? "pending" : "accepted" })}
      onReject={() => patch(c, { status: "rejected" })}
      onRestore={() => patch(c, { status: "pending" })}
      onSave={(edit) => patch(c, edit)}
    />
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div style={s.stack}>
        <Skeleton height={150} />
        <Skeleton height={150} />
      </div>
    );
  } else if (isError) {
    body = <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  } else if (!scanned) {
    body = (
      <>
        <EmptyState
          icon="ListChecks"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={extract.isPending ? t("page.scanning") : t("page.runScan")}
          onCta={scan}
          ctaLoading={extract.isPending}
        />
        {extract.isPending && <p style={{ ...s.scanning, textAlign: "center" }}>{t("page.scanHint")}</p>}
      </>
    );
  } else {
    body = (
      <>
        <div style={s.toolbar}>
          <Button size="sm" icon="X" onClick={deselectAll} disabled={accepted.length === 0}>
            {t("page.deselectAll")}
          </Button>
          <span style={s.count}>{t("page.acceptedCount", { accepted: accepted.length, total: open.length })}</span>
          {accepted.length > 0 && (
            <Button size="sm" kind="primary" icon="Sparkles" onClick={() => setCreating(true)}>
              {t("page.createSkill")}
            </Button>
          )}
        </div>
        {open.length === 0 && <div style={s.muted}>{t("page.allDecided")}</div>}
        {open.map(card)}
        {rejected.length > 0 && (
          <div style={s.rejectedList}>
            <button type="button" style={s.linkButton} onClick={() => setShowRejected((v) => !v)}>
              {showRejected ? t("page.hideRejected") : t("page.showRejected", { count: rejected.length })}
            </button>
            {showRejected && rejected.map(card)}
          </div>
        )}
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.titleBlock}>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repo}>
                {repoName}
              </span>
            </h1>
            {data?.scan.last_scan_at && (
              <p style={s.subtitle}>
                {t("page.scanInfo", {
                  count: data.scan.sampled_files ?? 0,
                  ago: format.relativeTime(new Date(data.scan.last_scan_at)),
                })}
              </p>
            )}
            {extract.data && (
              <p style={s.stats}>
                {t("page.stats", {
                  sampled: extract.data.stats.sampled_files,
                  proposed: extract.data.stats.proposed,
                  verified: extract.data.stats.verified,
                  dropped: extract.data.stats.dropped,
                  model: extract.data.stats.model,
                })}
              </p>
            )}
            {extract.isPending && scanned && <p style={s.scanning}>{t("page.scanHint")}</p>}
          </div>
          {scanned && (
            <Button size="sm" icon="RefreshCw" onClick={scan} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>
        {created && (
          <div style={s.created} role="status">
            <span style={s.createdText}>{t("page.createdBanner", { name: created.name })}</span>
            <Link href={`/skills/${created.id}`} style={s.createdLink}>
              {t("page.openSkill")}
            </Link>
            <Link href="/agents" style={s.createdLink}>
              {t("page.addToAgent")}
            </Link>
            <button type="button" style={s.dismiss} onClick={() => setCreated(null)} aria-label={t("page.dismiss")}>
              ×
            </button>
          </div>
        )}
        {body}
      </div>

      {creating && (
        <CreateConventionSkillModal
          repoId={repoId}
          repoName={repoName}
          candidateIds={accepted.map((c) => c.id)}
          onCreated={(skill) => {
            toast.success(t("page.created", { name: skill.name }));
            setCreated(skill);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </AppShell>
  );
}
