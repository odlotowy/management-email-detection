export interface MailboxConfig {
  id: string;
  name: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  passwordEnv: string;
  discordChannelId: string;
}

export interface ParsedEmailData {
  messageUid: number;
  mailboxId: string;
  mailboxName: string;
  mailboxAddress: string;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  preview: string;
  date: Date;
  attachments: string[];
}
