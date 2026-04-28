export type RepositoryItemKind = "issue" | "pull_request";
export type RepositoryCloseReason =
  | "implemented_on_main"
  | "cannot_reproduce"
  | "clawhub"
  | "duplicate_or_superseded"
  | "not_actionable_in_repo"
  | "incoherent"
  | "stale_insufficient_info"
  | "none";

export interface RepositoryProfile {
  targetRepo: string;
  slug: string;
  displayName: string;
  checkoutDir: string;
  docsUrl?: string;
  communityUrl?: string;
  promptNote: string;
  applyCloseRules: Partial<Record<RepositoryItemKind, readonly RepositoryCloseReason[]>>;
}

const STANDARD_CLOSE_REASONS: readonly RepositoryCloseReason[] = [
  "implemented_on_main",
  "cannot_reproduce",
  "duplicate_or_superseded",
  "not_actionable_in_repo",
  "incoherent",
  "stale_insufficient_info",
];

export const DEFAULT_TARGET_REPO = "nearai/ironclaw";

export const REPOSITORY_PROFILES: readonly RepositoryProfile[] = [
  {
    targetRepo: DEFAULT_TARGET_REPO,
    slug: "nearai-ironclaw",
    displayName: "IronClaw",
    checkoutDir: "ironclaw",
    docsUrl: "https://github.com/nearai/ironclaw",
    promptNote:
      "Use the IronClaw source tree, repository docs, changelog, and current main branch. Close proposals may use the normal IronClaw stale/duplicate/not-in-repo/implemented-on-main policy when evidence is strong.",
    applyCloseRules: {
      issue: STANDARD_CLOSE_REASONS,
      pull_request: STANDARD_CLOSE_REASONS.filter((reason) => reason !== "stale_insufficient_info"),
    },
  },
  {
    targetRepo: "openclaw/clawhub",
    slug: "openclaw-clawhub",
    displayName: "ClawHub",
    checkoutDir: "clawhub",
    communityUrl: "https://clawhub.ai/",
    promptNote:
      "Use the ClawHub source tree and current main branch. Review every issue and PR with the same evidence standard, but only propose auto-close for pull requests that are certainly implemented on main. Keep everything else open.",
    applyCloseRules: {
      issue: [],
      pull_request: ["implemented_on_main"],
    },
  },
];

export function repositoryProfileFor(targetRepo: string): RepositoryProfile {
  const normalized = normalizeRepo(targetRepo);
  const profile = REPOSITORY_PROFILES.find((candidate) => candidate.targetRepo === normalized);
  if (!profile) {
    throw new Error(
      `Unsupported target repo: ${targetRepo}. Known repos: ${REPOSITORY_PROFILES.map((candidate) => candidate.targetRepo).join(", ")}`,
    );
  }
  return profile;
}

export function repositoryProfileForSlug(slug: string): RepositoryProfile | undefined {
  return REPOSITORY_PROFILES.find((candidate) => candidate.slug === slug);
}

export function normalizeRepo(targetRepo: string): string {
  return targetRepo.trim().toLowerCase();
}

export function isAutoCloseAllowed(
  profile: RepositoryProfile,
  kind: RepositoryItemKind,
  reason: RepositoryCloseReason,
): boolean {
  return Boolean(profile.applyCloseRules[kind]?.includes(reason));
}
