/**
 * Runtime shim to broaden Keychain/DPAPI lookups without vendoring chrome-cookies-secure.
 * It tries a list of alternative service/account labels after the original call fails.
 * Configure via ORACLE_KEYCHAIN_LABELS='[{"service":"Microsoft Edge Safe Storage","account":"Microsoft Edge"},...]'
 */
import type keytarType from 'keytar';

type Label = { service: string; account: string };

const defaultLabels: Label[] = [
  { service: 'Chrome Safe Storage', account: 'Chrome' },
  { service: 'Chromium Safe Storage', account: 'Chromium' },
  { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  { service: 'Brave Safe Storage', account: 'Brave' },
  { service: 'Vivaldi Safe Storage', account: 'Vivaldi' },
];

function loadEnvLabels(): Label[] {
  const raw = process.env.ORACLE_KEYCHAIN_LABELS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry) => (entry && typeof entry === 'object' ? entry : null))
        .filter((entry): entry is Label => Boolean(entry?.service && entry?.account));
    }
  } catch {
    // ignore invalid env payload
  }
  return [];
}

const fallbackLabels = [...loadEnvLabels(), ...defaultLabels];

const disableKeytar = process.env.ORACLE_DISABLE_KEYTAR === '1' || process.env.CI === 'true';

let keytar: Pick<typeof keytarType, 'getPassword' | 'setPassword' | 'deletePassword'>;

if (disableKeytar) {
  keytar = {
    getPassword: async () => null,
    setPassword: async () => undefined,
    deletePassword: async () => false,
  } as Pick<typeof keytarType, 'getPassword' | 'setPassword' | 'deletePassword'>;
} else {
  const keytarModule = await import('keytar');
  keytar = (keytarModule.default ?? keytarModule) as typeof keytarType;
  const originalGetPassword = keytar.getPassword.bind(keytar);

  keytar.getPassword = async (service: string, account: string): Promise<string | null> => {
    const primary = await originalGetPassword(service, account);
    if (primary) {
      return primary;
    }
    for (const label of fallbackLabels) {
      if (label.service === service && label.account === account) {
        continue; // already tried
      }
      const value = await originalGetPassword(label.service, label.account);
      if (value) {
        return value;
      }
    }
    return null;
  };
}

export default keytar;
