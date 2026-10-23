export interface MailboxMonitorStatus {
  mailboxId: string;
  mailboxName: string;
  email: string;
  running: boolean;
  connected: boolean;
  startedAt: Date | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

const statuses = new Map<string, MailboxMonitorStatus>();

export function updateMailboxStatus(
  mailboxId: string,
  update: Partial<MailboxMonitorStatus>,
): void {
  const previous = statuses.get(mailboxId);

  if (!previous) return;

  statuses.set(mailboxId, {
    ...previous,
    ...update,
  });
}

export function registerMailboxStatus(status: MailboxMonitorStatus): void {
  statuses.set(status.mailboxId, status);
}

export function getMailboxStatuses(): MailboxMonitorStatus[] {
  return [...statuses.values()].map((status) => ({ ...status }));
}
