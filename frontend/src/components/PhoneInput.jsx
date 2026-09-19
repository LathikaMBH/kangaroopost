import { useState, useRef, useEffect } from 'react';

// [ISO code, name, dial code] — Finland first because it is the default
export const COUNTRIES = [
  ['FI', 'Finland', '358'], ['SE', 'Sweden', '46'], ['NO', 'Norway', '47'], ['DK', 'Denmark', '45'], ['EE', 'Estonia', '372'],
  ['LV', 'Latvia', '371'], ['LT', 'Lithuania', '370'], ['IS', 'Iceland', '354'], ['GB', 'United Kingdom', '44'], ['IE', 'Ireland', '353'],
  ['DE', 'Germany', '49'], ['FR', 'France', '33'], ['NL', 'Netherlands', '31'], ['BE', 'Belgium', '32'], ['CH', 'Switzerland', '41'],
  ['AT', 'Austria', '43'], ['ES', 'Spain', '34'], ['PT', 'Portugal', '351'], ['IT', 'Italy', '39'], ['GR', 'Greece', '30'],
  ['PL', 'Poland', '48'], ['CZ', 'Czechia', '420'], ['SK', 'Slovakia', '421'], ['HU', 'Hungary', '36'], ['RO', 'Romania', '40'],
  ['BG', 'Bulgaria', '359'], ['HR', 'Croatia', '385'], ['UA', 'Ukraine', '380'], ['RU', 'Russia', '7'], ['TR', 'Turkey', '90'],
  ['US', 'United States / Canada', '1'], ['MX', 'Mexico', '52'], ['BR', 'Brazil', '55'], ['AR', 'Argentina', '54'], ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'], ['IN', 'India', '91'], ['LK', 'Sri Lanka', '94'], ['PK', 'Pakistan', '92'], ['BD', 'Bangladesh', '880'],
  ['NP', 'Nepal', '977'], ['CN', 'China', '86'], ['JP', 'Japan', '81'], ['KR', 'South Korea', '82'], ['SG', 'Singapore', '65'],
  ['MY', 'Malaysia', '60'], ['TH', 'Thailand', '66'], ['VN', 'Vietnam', '84'], ['PH', 'Philippines', '63'], ['ID', 'Indonesia', '62'],
  ['AU', 'Australia', '61'], ['NZ', 'New Zealand', '64'], ['AE', 'United Arab Emirates', '971'], ['SA', 'Saudi Arabia', '966'],
  ['QA', 'Qatar', '974'], ['IL', 'Israel', '972'], ['EG', 'Egypt', '20'], ['ZA', 'South Africa', '27'], ['NG', 'Nigeria', '234'],
  ['KE', 'Kenya', '254'],
];

const DEFAULT_DIAL = '358';

// small dropdown arrow drawn next to the text (the native arrow sits far right of a wide select)
const CHEVRON = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M2 4.5l4 4 4-4" fill="none" stroke="#8A8AA0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>')}")`;

// "+358401234567" -> { dial: '358', nat: '401234567' }.
// A number without "+" (older data such as "0417419350") is treated as a national number in the default country.
export function parsePhone(value) {
  const v = String(value || '').trim();
  if (!v) return { dial: DEFAULT_DIAL, nat: '' };
  const digits = v.replace(/\D/g, '');
  if (v.startsWith('+')) {
    const match = COUNTRIES.map(c => c[2]).filter(d => digits.startsWith(d)).sort((a, b) => b.length - a.length)[0];
    if (match) return { dial: match, nat: digits.slice(match.length) };
  }
  return { dial: DEFAULT_DIAL, nat: digits.replace(/^0+/, '') };
}

// national number typed by the user -> "+<dial><digits>", dropping the local leading 0
export function buildPhone(dial, nat) {
  const digits = String(nat || '').replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${dial}${digits}` : '';
}

// normalise any stored value to the "+<code><number>" form ('' stays '')
export const toE164 = value => { const { dial, nat } = parsePhone(value); return buildPhone(dial, nat); };

export default function PhoneInput({ value, onChange, placeholder = 'Phone number' }) {
  const [{ dial, nat }, setState] = useState(() => parsePhone(value));
  const inputRef = useRef(null);

  const digits = nat.replace(/\D/g, '').replace(/^0+/, '');
  const problem = digits && (digits.length < 4 ? 'Phone number is too short' : dial.length + digits.length > 15 ? 'Phone number is too long' : '');
  useEffect(() => { inputRef.current?.setCustomValidity(problem || ''); }, [problem]);

  const update = (d, n) => { setState({ dial: d, nat: n }); onChange(buildPhone(d, n)); };

  return (
    <div style={{ display:'flex', gap:8 }}>
      <select className="input" aria-label="Country code" value={dial} onChange={e => update(e.target.value, nat)}
        style={{ width:98, flexShrink:0, paddingLeft:12, paddingRight:26, appearance:'none', WebkitAppearance:'none', MozAppearance:'none',
          backgroundImage:CHEVRON, backgroundRepeat:'no-repeat', backgroundPosition:'right 9px center', backgroundSize:'12px', cursor:'pointer' }}>
        {COUNTRIES.map(([iso, name, code]) => <option key={iso} value={code} title={name}>{iso} +{code}</option>)}
      </select>
      <input ref={inputRef} className="input" type="tel" inputMode="tel" autoComplete="tel-national" placeholder={placeholder}
        value={nat} onChange={e => update(dial, e.target.value.replace(/[^\d\s-]/g, ''))} style={{ minWidth:0 }} />
    </div>
  );
}
