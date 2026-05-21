// Whether this is a first-time application or a renewal
export type PermitOperation = 'NEW' | 'RENEWAL';

// Top-level permit category
export type ResidencePermitCategory =
  | 'PRECHODNY_POBYT'        // Temporary residence
  | 'TRVALY_POBYT'           // Permanent residence
  | 'TOLEROVANY_POBYT'       // Tolerated residence
  | 'EU_CITIZEN_REGISTERED'  // EU citizen registered stay
  | 'EU_CITIZEN_PERMANENT';  // EU citizen permanent stay

// Purpose codes for temporary residence (prechodný pobyt) — Law 404/2011
export type TemporaryResidencePurpose =
  | 'PODNIKANIE'            // Business / entrepreneurship §22
  | 'ZAMESTNANIE'           // Employment §23
  | 'STUDIUM'               // Study §24
  | 'OSOBITNA_CINNOST'      // Special activities §25
  | 'VYSKUM_A_VYVOJ'        // Research & development §26
  | 'ZLUCENIE_RODINY'       // Family reunification §27
  | 'OBCIANSKE_POVINNOSTI'  // Civil / armed service obligations §28
  | 'SLOVAK_V_ZAHRANICI'    // Slovak living abroad §29
  | 'MODRA_KARTA'           // EU Blue Card (highly qualified work)
  | 'DLHODOBY_POBYT_EU';    // Long-term EU resident status

// Sub-type codes for permanent residence (trvalý pobyt)
export type PermanentResidenceType =
  | 'NA_PAT_ROKOV'        // 5-year permanent residence
  | 'NA_NEOBMEDZENY_CAS'  // Unlimited-duration permanent residence
  | 'DLHODOBY';           // Long-term residence

// Discriminated union identifying any specific Slovak living permit
export type PermitType =
  | { category: 'PRECHODNY_POBYT'; purpose: TemporaryResidencePurpose }
  | { category: 'TRVALY_POBYT'; type: PermanentResidenceType }
  | { category: 'TOLEROVANY_POBYT' }
  | { category: 'EU_CITIZEN_REGISTERED' }
  | { category: 'EU_CITIZEN_PERMANENT' };

// Full descriptor for a permit application (new or renewal)
export interface PermitApplication {
  operation: PermitOperation;
  permit: PermitType;
}

// Human-readable label pair for any permit ID
export interface PermitLabel {
  sk: string;  // Slovak name
  en: string;  // English name
}

// ──────────────────────────────────────────────────────────────────────────────
// Label maps
// ──────────────────────────────────────────────────────────────────────────────

export const TEMPORARY_RESIDENCE_PURPOSE_LABELS: Record<
  TemporaryResidencePurpose,
  PermitLabel & { lawSection: string; slug: string }
> = {
  PODNIKANIE: {
    sk: 'Podnikanie',
    en: 'Business / Entrepreneurship',
    lawSection: '§22',
    slug: 'podnikanie',
  },
  ZAMESTNANIE: {
    sk: 'Zamestnanie',
    en: 'Employment',
    lawSection: '§23',
    slug: 'zamestnanie',
  },
  STUDIUM: {
    sk: 'Štúdium',
    en: 'Study',
    lawSection: '§24',
    slug: 'studium',
  },
  OSOBITNA_CINNOST: {
    sk: 'Osobitná činnosť',
    en: 'Special Activities',
    lawSection: '§25',
    slug: 'osobitna-cinnost',
  },
  VYSKUM_A_VYVOJ: {
    sk: 'Výskum a vývoj',
    en: 'Research & Development',
    lawSection: '§26',
    slug: 'vyskum-a-vyvoj',
  },
  ZLUCENIE_RODINY: {
    sk: 'Zlúčenie rodiny',
    en: 'Family Reunification',
    lawSection: '§27',
    slug: 'zlucenie-rodiny',
  },
  OBCIANSKE_POVINNOSTI: {
    sk: 'Občianske a služobné povinnosti',
    en: 'Civil / Armed Service Obligations',
    lawSection: '§28',
    slug: 'obcianske-povinnosti',
  },
  SLOVAK_V_ZAHRANICI: {
    sk: 'Slovák žijúci v zahraničí',
    en: 'Slovak Living Abroad',
    lawSection: '§29',
    slug: 'slovak-v-zahranici',
  },
  MODRA_KARTA: {
    sk: 'Modrá karta EÚ',
    en: 'EU Blue Card (Highly Qualified Work)',
    lawSection: 'special',
    slug: 'modra-karta',
  },
  DLHODOBY_POBYT_EU: {
    sk: 'Dlhodobý pobytový status EÚ',
    en: 'Long-term EU Resident Status',
    lawSection: 'special',
    slug: 'dlhodoby-pobyt-eu',
  },
};

export const PERMANENT_RESIDENCE_TYPE_LABELS: Record<
  PermanentResidenceType,
  PermitLabel & { slug: string }
> = {
  NA_PAT_ROKOV: {
    sk: 'Trvalý pobyt na päť rokov',
    en: 'Permanent Residence (5-year)',
    slug: 'trvaly-pobyt-na-pat-rokov',
  },
  NA_NEOBMEDZENY_CAS: {
    sk: 'Trvalý pobyt na neobmedzený čas',
    en: 'Permanent Residence (Unlimited)',
    slug: 'trvaly-pobyt-na-neobmedzeny-cas',
  },
  DLHODOBY: {
    sk: 'Dlhodobý pobyt',
    en: 'Long-term Residence',
    slug: 'dlhodoby-pobyt',
  },
};

export const RESIDENCE_CATEGORY_LABELS: Record<
  ResidencePermitCategory,
  PermitLabel & { slug: string }
> = {
  PRECHODNY_POBYT: {
    sk: 'Prechodný pobyt',
    en: 'Temporary Residence',
    slug: 'prechodny-pobyt',
  },
  TRVALY_POBYT: {
    sk: 'Trvalý pobyt',
    en: 'Permanent Residence',
    slug: 'trvaly-pobyt',
  },
  TOLEROVANY_POBYT: {
    sk: 'Tolerovaný pobyt',
    en: 'Tolerated Residence',
    slug: 'tolerovany-pobyt',
  },
  EU_CITIZEN_REGISTERED: {
    sk: 'Registrovaný pobyt občana EÚ',
    en: 'EU Citizen Registered Stay',
    slug: 'pobyt-obcana-eu',
  },
  EU_CITIZEN_PERMANENT: {
    sk: 'Trvalý pobyt občana EÚ',
    en: 'EU Citizen Permanent Residence',
    slug: 'trvaly-pobyt-obcana-eu',
  },
};

export const PERMIT_OPERATION_LABELS: Record<PermitOperation, PermitLabel> = {
  NEW: { sk: 'Prvé udelenie', en: 'New Application' },
  RENEWAL: { sk: 'Obnovenie / Predĺženie', en: 'Renewal' },
};
