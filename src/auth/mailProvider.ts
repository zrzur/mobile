/** Which webmail to open after "Check your email" (same list as the web app) */
const PROVIDERS: [string[], string, string][] = [
  [["gmail.com", "googlemail.com"], "Gmail", "https://gmail.com"],
  [["tuta.io"], "Tutanota", "https://mail.tutanota.com"],
  [
    ["outlook.com", "hotmail.com", "outlook.jp", "outlook.fr", "outlook.dk", "outlook.com.ar", "outlook.com.au", "outlook.at", "outlook.be", "outlook.com.br", "outlook.cl", "outlook.cz", "outlook.com.gr", "outlook.co.il", "outlook.in", "outlook.co.id", "outlook.ie", "outlook.it", "outlook.hu", "outlook.kr", "outlook.lv", "outlook.my", "outlook.co.nz", "outlook.com.pe", "outlook.ph", "outlook.pt", "outlook.sa", "outlook.sg", "outlook.sk", "outlook.es", "outlook.co.th", "outlook.com.tr", "outlook.com.vn"],
    "Outlook",
    "https://outlook.live.com",
  ],
  [["yahoo.com"], "Yahoo", "https://mail.yahoo.com"],
  [["wp.pl"], "WP Poczta", "https://poczta.wp.pl"],
  [["protonmail.com", "protonmail.ch", "pm.me"], "ProtonMail", "https://mail.protonmail.com"],
  [["seznam.cz", "email.cz", "post.cz"], "Seznam", "https://email.seznam.cz"],
  [["zoho.com"], "Zoho Mail", "https://mail.zoho.com/zm/"],
  [["aol.com", "aim.com"], "AOL Mail", "https://mail.aol.com/"],
  [["icloud.com"], "iCloud Mail", "https://mail.icloud.com/"],
  [["mail.com", "email.com"], "mail.com", "https://www.mail.com/mail/"],
  [["yandex.ru", "yandex.by", "yandex.ua", "yandex.com"], "Yandex Mail", "https://mail.yandex.com/"],
  [["hey.com"], "HEY", "https://app.hey.com/"],
  [["mail.ru", "bk.ru", "inbox.ru", "list.ru", "internet.ru"], "Mail.ru", "https://mail.ru/"],
  [["rambler.ru", "lenta.ru", "autorambler.ru", "myrambler.ru", "ro.ru", "rambler.ua"], "Rambler", "https://rambler.ru/"],
];

export function mapMailProvider(email?: string | null): [string, string] | undefined {
  const match = email ? /@(.+)/.exec(email) : null;
  if (!match) return undefined;
  const domain = match[1];
  for (const [domains, name, url] of PROVIDERS) {
    if (domains.includes(domain)) return [name, url];
  }
  return [domain, `https://${domain}`];
}
