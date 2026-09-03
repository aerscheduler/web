import type { CurrencyType, DocumentType, OrganizationUser } from "./api";

export type CurrencyRuleStanding = "current" | "expiring" | "expired" | "notSignedOff";

export interface CurrencyRuleDocument {
  id: number;
  createdAt: string;
  expiresAt: string | null;
  fileCount: number;
  documentType: Pick<DocumentType, "id" | "name">;
}

export interface CurrencyRuleMember {
  currencyId: number;
  orgUser: OrganizationUser;
  status: CurrencyRuleStanding;
  startedAt: string;
  warnedAt: string | null;
  expiredAt: string | null;
  expiresOn: string | null;
  notes: string | null;
  renewedBy: OrganizationUser | null;
  documents: CurrencyRuleDocument[];
  missingDocumentTypeIds: number[];
}

export interface CurrencyRuleDetail {
  type: CurrencyType;
  summary: {
    total: number;
    current: number;
    expiring: number;
    expired: number;
    notSignedOff: number;
    missingDocuments: number;
  };
  members: CurrencyRuleMember[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    returned: number;
    hasMore: boolean;
  };
}
