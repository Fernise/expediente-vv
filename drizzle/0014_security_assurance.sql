UPDATE `document_versions`
SET `malware_scan_status` = 'structural_only'
WHERE `malware_scan_status` = 'clean';
--> statement-breakpoint
UPDATE `memberships`
SET `mfa_required` = 1,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `role` IN ('organization_admin', 'professional')
  AND `mfa_required` != 1;
