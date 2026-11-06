export const COUNTRIES: Array<[string, string]> = [
  ["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["DE", "Germany"], ["FR", "France"], ["MT", "Malta"],
  ["BR", "Brazil"], ["NG", "Nigeria"], ["CA", "Canada"], ["AU", "Australia"], ["JP", "Japan"], ["KR", "South Korea"],
  ["SG", "Singapore"], ["AE", "United Arab Emirates"], ["CN", "China"], ["RU", "Russia"], ["UA", "Ukraine"], ["TR", "Türkiye"],
  ["IR", "Iran"], ["IL", "Israel"], ["SA", "Saudi Arabia"], ["EG", "Egypt"], ["ZA", "South Africa"], ["KE", "Kenya"],
  ["MX", "Mexico"], ["AR", "Argentina"], ["CO", "Colombia"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"],
  ["PL", "Poland"], ["SE", "Sweden"], ["CH", "Switzerland"], ["PK", "Pakistan"], ["BD", "Bangladesh"], ["ID", "Indonesia"],
  ["PH", "Philippines"], ["VN", "Vietnam"], ["TH", "Thailand"], ["BY", "Belarus"],
];

export function flag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const label = (code: string) => `${flag(code)} ${code}`;
