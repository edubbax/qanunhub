// Outgoing email. Until an email provider is chosen, messages go to the mail_outbox table (visible in
// the admin panel) and the server log, so the flows can be tested end to end.
import { config } from './config';
import type { Db } from './db';

export async function sendMail(sql: Db, to: string, subject: string, body: string) {
  await sql`insert into mail_outbox (to_email, subject, body) values (${to}, ${subject}, ${body})`;
  if (config.mailMode === 'console' || process.env.NODE_ENV !== 'test') console.log(`[mail] to=${to} subject="${subject}"\n${body}`);
}

export function verifyMail(link: string) {
  return {
    subject: 'QanunHub: email ünvanınızı təsdiqləyin',
    body: `Salam!\n\nQanunHub hesabınızı təsdiqləmək üçün bu linkə keçin:\n${link}\n\nLink 48 saat etibarlıdır. Bu hesabı siz yaratmamısınızsa, məktubu nəzərə almayın.`,
  };
}

export function resetMail(link: string) {
  return {
    subject: 'QanunHub: şifrənin bərpası',
    body: `Salam!\n\nYeni şifrə təyin etmək üçün bu linkə keçin:\n${link}\n\nLink 1 saat etibarlıdır. Bərpa istəməmisinizsə, heç nə etməyin: şifrəniz dəyişməyəcək.`,
  };
}
