export type Role = 'TRAINING_CENTRE' | 'DISTRICT_OFFICER' | 'QUALITY_TEAM' | 'STATE_OFFICE'

export type BatchStatus =
  | 'DRAFT'
  | 'DISTRICT_REVIEW'
  | 'QUALITY_REVIEW'
  | 'STATE_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED'

export type CertificateStatus = 'ACTIVE' | 'CANCELLED'
export type ApprovalAction = 'APPROVED' | 'REJECTED' | 'RETURNED'
export type ApprovalStage = 'DISTRICT' | 'QUALITY' | 'STATE'
export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED'
