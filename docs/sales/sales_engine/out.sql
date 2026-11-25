-- Generated from customer_onboarding_schema.dbml (rev 17, 24-Nov-2026) by @dbml/core 12.0.0 (export.js).
-- Partial indexes come from their WHERE notes (10). Checked: pglast parses it; it runs on PostgreSQL 18.
-- Not here (they are in the engine migrations, by hand): append-only and clock triggers, workspace isolation,
-- fin.check_journal_entry (the 8 commit rules), the fiscal_year no-overlap EXCLUDE, seeds.
-- Added by hand at the end (rev 14, as Manoj's 0005): sales_invoice's 2 GENERATED columns and its never-twice EXCLUDE.
-- Added by hand at the end (rev 16, S1 part 1): book_setting's no-overlap EXCLUDE and its allowed-value trigger.
-- Added by hand at the end (rev 17, S1 part 2): account_determination's GENERATED specificity, 2 EXCLUDE (posting_rule,
-- account_determination), the trigger account_determination_guard, the look-up fin.determine_ledger and the completeness
-- check fin.account_determination_gaps.

CREATE SCHEMA "pc";

CREATE SCHEMA "fin";

CREATE SCHEMA "inv";

CREATE TABLE "pc"."operated_party" (
  "operated_party_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."private_anchor" (
  "anchor_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "anchor_kind" text NOT NULL,
  "created_at" timestamptz NOT NULL
);

CREATE TABLE "pc"."party" (
  "party_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_kind" text NOT NULL,
  "legal_name" text,
  "legal_form_code" text,
  "recorded_at" timestamptz,
  "updated_at" timestamptz
);

CREATE TABLE "pc"."party_trade_name" (
  "trade_name_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "name" text NOT NULL,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."party_identifier" (
  "party_identifier_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "scheme_code" text NOT NULL,
  "jurisdiction_scope_code" text NOT NULL,
  "value" text,
  "standing_code" text,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."business_location" (
  "business_location_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "address_lines" text[],
  "locality" text,
  "administrative_area_code" text,
  "postal_code" text,
  "country_code" text,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."party_standing" (
  "party_standing_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "standing_type_code" text NOT NULL,
  "trade_name_id" uuid,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."contact" (
  "contact_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "contact_kind" text NOT NULL,
  "display_name" text NOT NULL,
  "accountable_party_id" uuid,
  "destination_role" text
);

CREATE TABLE "pc"."contact_party_association" (
  "association_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "contact_id" uuid NOT NULL,
  "party_id" uuid NOT NULL,
  "capacity_code" text NOT NULL,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."contact_point" (
  "contact_point_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "contact_id" uuid NOT NULL,
  "channel_kind" text NOT NULL,
  "route_value" text,
  "business_location_id" uuid,
  "since" date,
  "until" date
);

CREATE TABLE "pc"."record_history" (
  "history_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "record_type" text NOT NULL,
  "record_id" text NOT NULL,
  "version_number" integer NOT NULL,
  "operation" text NOT NULL,
  "row_snapshot" jsonb NOT NULL,
  "performer_contact_id" uuid,
  "recorded_at" timestamptz
);

CREATE TABLE "fin"."ledger_account" (
  "account_code" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "kind" text NOT NULL,
  "parent_account_code" text,
  "is_group" boolean NOT NULL DEFAULT false,
  "account_type" text,
  "since" date,
  "until" date,
  CONSTRAINT "ledger_account_account_type_valid" CHECK (account_type IN ('payable', 'receivable', 'stock', 'input_cgst', 'input_sgst', 'input_igst', 'tds_payable', 'output_cgst', 'output_sgst', 'output_igst', 'tcs_payable', 'round_off')),
  CONSTRAINT "ledger_account_group_has_no_type" CHECK (NOT (is_group AND account_type IS NOT NULL)),
  CONSTRAINT "ledger_account_kind_valid" CHECK (kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
  CONSTRAINT "ledger_account_not_its_own_parent" CHECK (parent_account_code <> account_code)
);

CREATE TABLE "fin"."debtor_category" (
  "debtor_category_code" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "ledger_account_code" text NOT NULL,
  "customer_type_code" text,
  "international" boolean NOT NULL DEFAULT false,
  "related_party" boolean NOT NULL DEFAULT false,
  "gst_treatment_note" text,
  "tcs_section_code" text,
  "tcs_rate_note" text,
  "credit_period_note" text,
  "default_credit_days" integer,
  "notes" text,
  "sort_order" integer NOT NULL
);

CREATE TABLE "fin"."gst_state_code" (
  "gst_code" text PRIMARY KEY,
  "iso_3166_2" text,
  "display_name" text NOT NULL,
  "legacy" boolean NOT NULL DEFAULT false
);

CREATE TABLE "fin"."customer_request" (
  "request_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "request_kind" text NOT NULL DEFAULT 'create',
  "stage" text NOT NULL DEFAULT 'draft',
  "version_number" integer NOT NULL DEFAULT 1,
  "paper_form_number" text NOT NULL,
  "handed_over_by_contact_id" uuid NOT NULL,
  "customer_name" text,
  "legal_name" text,
  "constitution_code" text,
  "customer_type_code" text,
  "debtor_category_code" text,
  "pan" text,
  "resident_status" text,
  "account_name" text,
  "gst_registered" boolean,
  "gstin" text,
  "gst_registration_type" text,
  "gst_registration_count" integer,
  "additional_gst_registrations" jsonb NOT NULL DEFAULT '[]',
  "billing_gstin" text,
  "export_customer" boolean,
  "sez_customer" boolean,
  "e_invoice_applicable" text,
  "tcs_applicability_confirmed" text,
  "address_lines" text[],
  "locality" text,
  "administrative_area_code" text,
  "postal_code" text,
  "country_code" text,
  "shipping_address_lines" text[],
  "shipping_locality" text,
  "shipping_administrative_area_code" text,
  "shipping_postal_code" text,
  "shipping_country_code" text,
  "contacts" jsonb NOT NULL DEFAULT '[]',
  "bank_beneficiary" text,
  "bank_name" text,
  "bank_branch" text,
  "bank_account_no" text,
  "bank_ifsc" text,
  "bank_proof_attached" boolean,
  "credit_or_cash" text,
  "credit_limit_amount" numeric(18,2),
  "payment_terms_code" text,
  "credit_days" integer,
  "security_deposit_amount" numeric(18,2),
  "collection_owner_contact_id" uuid,
  "currency_code" text DEFAULT 'INR',
  "bill_wise_tracking" boolean DEFAULT true,
  "po_reference_rule" text,
  "invoice_delivery_channel" text,
  "invoice_format_note" text,
  "ad_bank_name" text,
  "export_category_code" text,
  "lut_number" text,
  "lut_valid_until" date,
  "realisation_mode_code" text,
  "firc_brc_tracking" boolean,
  "edpms_softex_reference" text,
  "gst_certificate_attached" boolean,
  "pan_copy_attached" boolean,
  "msme_certificate_attached" boolean,
  "remarks" text,
  "created_by_contact_id" uuid NOT NULL,
  "submitted_by_contact_id" uuid,
  "submitted_at" timestamptz,
  "submission_number" integer NOT NULL DEFAULT 0,
  "accepted_warnings" text[],
  "return_reason" text,
  "party_id" uuid,
  "debtor_account_id" uuid,
  "activated_at" timestamptz,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "fin"."customer_request_approval" (
  "approval_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "request_id" uuid NOT NULL,
  "submission_number" integer NOT NULL,
  "approval_part_code" text NOT NULL,
  "approver_role_code" text NOT NULL,
  "approver_contact_id" uuid,
  "outcome" text NOT NULL DEFAULT 'pending',
  "decided_at" timestamptz,
  "reason" text,
  "approved_values" jsonb
);

CREATE TABLE "fin"."customer_request_history" (
  "history_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "request_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "operation" text NOT NULL,
  "performer_contact_id" uuid,
  "reason" text,
  "row_snapshot" jsonb NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "fin"."debtor_account" (
  "debtor_account_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "party_id" uuid NOT NULL,
  "party_standing_id" uuid,
  "opened_from_request_id" uuid NOT NULL,
  "customer_code" text NOT NULL,
  "account_name" text NOT NULL,
  "debtor_category_code" text NOT NULL,
  "ledger_account_code" text NOT NULL,
  "customer_type_code" text NOT NULL,
  "resident_status" text NOT NULL,
  "export_customer" boolean NOT NULL DEFAULT false,
  "sez_customer" boolean NOT NULL DEFAULT false,
  "e_invoice_applicable" text NOT NULL,
  "tcs_applicability_confirmed" text NOT NULL,
  "credit_or_cash" text NOT NULL,
  "payment_terms_code" text NOT NULL,
  "credit_days" integer,
  "security_deposit_amount" numeric(18,2),
  "collection_owner_contact_id" uuid,
  "currency_code" text NOT NULL DEFAULT 'INR',
  "bill_wise_tracking" boolean NOT NULL DEFAULT true,
  "po_reference_rule" text NOT NULL,
  "invoice_delivery_channel" text NOT NULL,
  "invoice_format_note" text,
  "ad_bank_name" text,
  "export_category_code" text,
  "lut_number" text,
  "lut_valid_until" date,
  "realisation_mode_code" text,
  "firc_brc_tracking" boolean,
  "edpms_softex_reference" text,
  "posting_blocked" boolean NOT NULL DEFAULT false,
  "sales_blocked" boolean NOT NULL DEFAULT false,
  "refund_bank_account_id" uuid,
  "remarks" text,
  "version_number" integer NOT NULL DEFAULT 1,
  "opened_at" timestamptz NOT NULL,
  "closed_at" timestamptz,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "fin"."debtor_tax_registration" (
  "debtor_tax_registration_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "debtor_account_id" uuid NOT NULL,
  "party_identifier_id" uuid NOT NULL,
  "registration_type" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "remarks" text,
  "since" date,
  "until" date
);

CREATE TABLE "fin"."debtor_location" (
  "debtor_location_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "debtor_account_id" uuid NOT NULL,
  "business_location_id" uuid NOT NULL,
  "usage" text NOT NULL,
  "debtor_tax_registration_id" uuid,
  "is_primary" boolean NOT NULL DEFAULT false,
  "since" date NOT NULL,
  "until" date,
  "remarks" text
);

CREATE TABLE "fin"."debtor_credit_limit" (
  "debtor_credit_limit_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "debtor_account_id" uuid NOT NULL,
  "credit_limit_amount" numeric(18,2) NOT NULL,
  "currency_code" text NOT NULL DEFAULT 'INR',
  "effective_from" date NOT NULL,
  "effective_until" date,
  "approved_by_contact_id" uuid NOT NULL,
  "source_request_id" uuid,
  "reason" text
);

CREATE TABLE "fin"."party_bank_account" (
  "party_bank_account_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "party_id" uuid NOT NULL,
  "account_no" text NOT NULL,
  "ifsc" text NOT NULL,
  "beneficiary_name" text NOT NULL,
  "bank_name" text NOT NULL,
  "branch" text,
  "proof_attached" boolean NOT NULL DEFAULT false,
  "verified_at" timestamptz,
  "verification_ref" text,
  "since" date,
  "until" date,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "fin"."debtor_account_history" (
  "history_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "debtor_account_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "operation" text NOT NULL,
  "performer_contact_id" uuid,
  "reason" text,
  "row_snapshot" jsonb NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "fin"."outbox" (
  "event_id" uuid PRIMARY KEY,
  "workspace_id" text NOT NULL,
  "event_type" text NOT NULL,
  "event_version" integer NOT NULL DEFAULT 1,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "published_at" timestamptz
);

CREATE TABLE "fin"."branch" (
  "branch_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "branch_code" text NOT NULL,
  "display_name" text NOT NULL,
  "business_location_id" uuid NOT NULL,
  "gst_identifier_id" uuid NOT NULL,
  "since" date,
  "until" date,
  CONSTRAINT "branch_code_not_blank" CHECK (btrim(branch_code) <> ''),
  CONSTRAINT "branch_period_is_ordered" CHECK (since < until)
);

CREATE TABLE "fin"."fiscal_year" (
  "fiscal_year_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "label" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_closed" boolean NOT NULL DEFAULT false,
  "closed_by_contact_id" uuid,
  "closed_at" timestamptz,
  CONSTRAINT "fiscal_year_closed_has_a_time" CHECK (is_closed = (closed_at IS NOT NULL)),
  CONSTRAINT "fiscal_year_period_is_ordered" CHECK (start_date < end_date)
);

CREATE TABLE "fin"."document_sequence" (
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "last_number" integer NOT NULL,
  CONSTRAINT "document_sequence_not_negative" CHECK (last_number >= 0),
  PRIMARY KEY ("workspace_id", "operated_party_id", "document_type")
);

CREATE TABLE "fin"."journal_entry" (
  "journal_entry_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "fiscal_year_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "posting_date" date NOT NULL,
  "voucher_type" text NOT NULL,
  "source_document_id" uuid,
  "source_ref_no" text,
  "reverses_journal_entry_id" uuid,
  "narration" text,
  "posted_by_contact_id" uuid,
  "posted_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "journal_entry_voucher_type_valid" CHECK (voucher_type IN ('purchase', 'opening', 'sales')),
  CONSTRAINT "journal_entry_does_not_reverse_itself" CHECK (reverses_journal_entry_id <> journal_entry_id)
);

CREATE TABLE "fin"."journal_line" (
  "journal_line_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "journal_entry_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "ledger_account_code" text NOT NULL,
  "creditor_account_id" uuid,
  "debtor_account_id" uuid,
  "branch_id" uuid NOT NULL,
  "debit" numeric(18,2) NOT NULL DEFAULT 0,
  "credit" numeric(18,2) NOT NULL DEFAULT 0,
  "rule_code" text,
  "rule_version" integer,
  "rule_case" text,
  "line_role_code" text,
  "account_determination_id" uuid,
  "determined_ledger_code" text,
  "override_reason" text,
  CONSTRAINT "journal_line_debit_or_credit" CHECK ((debit > 0) <> (credit > 0)),
  CONSTRAINT "journal_line_not_negative" CHECK (debit >= 0 AND credit >= 0),
  CONSTRAINT "journal_line_vendor_or_customer" CHECK (creditor_account_id IS NULL OR debtor_account_id IS NULL),
  CONSTRAINT "journal_line_rule_has_version" CHECK ((rule_code IS NULL) = (rule_version IS NULL)),
  CONSTRAINT "journal_line_rule_has_role" CHECK ((rule_code IS NULL) = (line_role_code IS NULL)),
  CONSTRAINT "journal_line_case_needs_rule" CHECK (rule_case IS NULL OR rule_code IS NOT NULL),
  CONSTRAINT "journal_line_determined_has_row" CHECK ((account_determination_id IS NULL) = (determined_ledger_code IS NULL)),
  CONSTRAINT "journal_line_override_has_reason" CHECK (determined_ledger_code IS NULL OR determined_ledger_code = ledger_account_code OR coalesce(btrim(override_reason), '') <> ''),
  CONSTRAINT "journal_line_reason_only_on_override" CHECK (override_reason IS NULL OR (determined_ledger_code IS NOT NULL AND determined_ledger_code IS DISTINCT FROM ledger_account_code))
);

CREATE TABLE "fin"."sales_invoice" (
  "sales_invoice_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "debtor_account_id" uuid,
  "internal_ref_no" text NOT NULL,
  "amends_sales_invoice_id" uuid,
  "original_sales_invoice_id" uuid NOT NULL,
  "revision_no" integer NOT NULL DEFAULT 0,
  "posting_date" date NOT NULL,
  "invoice_no" text NOT NULL,
  "invoice_key" text GENERATED ALWAYS AS (upper(regexp_replace(invoice_no, '\s', '', 'g'))) STORED NOT NULL,
  "invoice_date" date NOT NULL,
  "due_date" date NOT NULL,
  "invoice_financial_year" integer GENERATED ALWAYS AS ((EXTRACT(year FROM invoice_date)::integer - CASE WHEN EXTRACT(month FROM invoice_date) < 4 THEN 1 ELSE 0 END)) STORED NOT NULL,
  "narration" text,
  "inventory_mode" text,
  "costing_method" text,
  "stage" text NOT NULL,
  "version_number" integer NOT NULL DEFAULT 1,
  "submitted_by_contact_id" uuid NOT NULL,
  "submitted_at" timestamptz NOT NULL,
  "decided_by_contact_id" uuid,
  "decided_at" timestamptz,
  "decision_reason" text,
  "journal_entry_id" uuid,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "sales_invoice_invoice_no_not_blank" CHECK (btrim(invoice_no) <> ''),
  CONSTRAINT "sales_invoice_stage_valid" CHECK (stage IN ('draft', 'submitted', 'posted', 'rejected', 'amended')),
  CONSTRAINT "sales_invoice_posted_has_journal" CHECK (stage NOT IN ('posted', 'amended') OR journal_entry_id IS NOT NULL),
  CONSTRAINT "sales_invoice_decided_has_decider" CHECK (stage NOT IN ('posted', 'amended', 'rejected') OR (decided_by_contact_id IS NOT NULL AND decided_at IS NOT NULL)),
  CONSTRAINT "sales_invoice_revision_matches_amends" CHECK ((revision_no = 0) = (amends_sales_invoice_id IS NULL)),
  CONSTRAINT "sales_invoice_maker_may_not_decide" CHECK (decided_by_contact_id IS NULL OR decided_by_contact_id <> submitted_by_contact_id),
  CONSTRAINT "sales_invoice_due_after_invoice" CHECK (due_date >= invoice_date),
  CONSTRAINT "sales_invoice_original_is_itself" CHECK (revision_no > 0 OR original_sales_invoice_id = sales_invoice_id),
  CONSTRAINT "sales_invoice_costing_method_valid" CHECK (costing_method IN ('fifo', 'weighted_average')),
  CONSTRAINT "sales_invoice_inventory_mode_valid" CHECK (inventory_mode IN ('perpetual', 'periodic')),
  CONSTRAINT "sales_invoice_method_only_when_perpetual" CHECK ((inventory_mode IS NOT DISTINCT FROM 'perpetual') = (costing_method IS NOT NULL))
);

CREATE TABLE "fin"."sales_invoice_line" (
  "sales_invoice_line_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "sales_invoice_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "side" text NOT NULL,
  "ledger_account_code" text,
  "debtor_account_id" uuid,
  "inventory_item_code" text,
  "quantity" numeric(18,3),
  "stock_lot_id" uuid,
  "amount" numeric(18,2) NOT NULL,
  "rule_code" text,
  "rule_version" integer,
  "rule_case" text,
  "line_role_code" text,
  "account_determination_id" uuid,
  "determined_ledger_code" text,
  "override_reason" text,
  CONSTRAINT "sales_invoice_line_side_valid" CHECK (side IN ('Dr', 'Cr')),
  CONSTRAINT "sales_invoice_line_ledger_or_customer" CHECK ((ledger_account_code IS NULL) <> (debtor_account_id IS NULL)),
  CONSTRAINT "sales_invoice_line_customer_is_debit" CHECK (debtor_account_id IS NULL OR side = 'Dr'),
  CONSTRAINT "sales_invoice_line_amount_positive" CHECK (amount > 0),
  CONSTRAINT "sales_invoice_line_item_has_quantity" CHECK ((inventory_item_code IS NULL) = (quantity IS NULL)),
  CONSTRAINT "sales_invoice_line_quantity_positive" CHECK (quantity IS NULL OR quantity > 0),
  CONSTRAINT "sales_invoice_line_lot_needs_item" CHECK (stock_lot_id IS NULL OR inventory_item_code IS NOT NULL),
  CONSTRAINT "sales_invoice_line_item_on_a_stock_credit" CHECK (inventory_item_code IS NULL OR (side = 'Cr' AND ledger_account_code IS NOT NULL)),
  CONSTRAINT "sales_invoice_line_rule_has_version" CHECK ((rule_code IS NULL) = (rule_version IS NULL)),
  CONSTRAINT "sales_invoice_line_rule_has_role" CHECK ((rule_code IS NULL) = (line_role_code IS NULL)),
  CONSTRAINT "sales_invoice_line_case_needs_rule" CHECK (rule_case IS NULL OR rule_code IS NOT NULL),
  CONSTRAINT "sales_invoice_line_determined_has_row" CHECK ((account_determination_id IS NULL) = (determined_ledger_code IS NULL)),
  CONSTRAINT "sales_invoice_line_override_has_reason" CHECK (determined_ledger_code IS NULL OR determined_ledger_code = ledger_account_code OR coalesce(btrim(override_reason), '') <> ''),
  CONSTRAINT "sales_invoice_line_reason_only_on_override" CHECK (override_reason IS NULL OR (determined_ledger_code IS NOT NULL AND determined_ledger_code IS DISTINCT FROM ledger_account_code)),
  CONSTRAINT "sales_invoice_line_customer_role_is_the_customer" CHECK (line_role_code IS NULL OR (line_role_code = 'customer') = (debtor_account_id IS NOT NULL))
);

CREATE TABLE "fin"."sales_invoice_history" (
  "history_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "sales_invoice_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "operation" text NOT NULL,
  "row_snapshot" jsonb NOT NULL,
  "performer_contact_id" uuid,
  "acting_on_event_id" uuid,
  "reason" text,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "sales_invoice_history_operation_valid" CHECK (operation IN ('submit', 'decide', 'amended')),
  CONSTRAINT "sales_invoice_history_has_an_actor" CHECK (performer_contact_id IS NOT NULL OR acting_on_event_id IS NOT NULL)
);

CREATE TABLE "fin"."book" (
  "book_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "operated_party_id" uuid NOT NULL,
  "book_code" text NOT NULL,
  "display_name" text NOT NULL,
  "is_primary" boolean NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "book_code_not_blank" CHECK (btrim(book_code) <> '')
);

CREATE TABLE "fin"."setting_definition" (
  "setting_code" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "allowed_values" text[] NOT NULL,
  "owner_task" text NOT NULL,
  "read_by" text NOT NULL,
  CONSTRAINT "setting_definition_has_values" CHECK (cardinality(allowed_values) > 0)
);

CREATE TABLE "fin"."book_setting" (
  "book_setting_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "book_id" uuid NOT NULL,
  "setting_code" text NOT NULL,
  "setting_value" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "reason" text,
  "approved_by_contact_id" uuid NOT NULL,
  "approved_at" timestamptz NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "book_setting_value_not_blank" CHECK (btrim(setting_value) <> ''),
  CONSTRAINT "book_setting_period_is_ordered" CHECK (effective_until IS NULL OR effective_from < effective_until)
);

CREATE TABLE "fin"."line_role" (
  "line_role_code" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "ledger_source" text NOT NULL,
  "required_kind" text NOT NULL,
  "required_account_type" text,
  CONSTRAINT "line_role_ledger_source_valid" CHECK (ledger_source IN ('determination', 'party_account')),
  CONSTRAINT "line_role_required_kind_valid" CHECK (required_kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
  CONSTRAINT "line_role_required_account_type_valid" CHECK (required_account_type IN ('payable', 'receivable', 'stock', 'input_cgst', 'input_sgst', 'input_igst', 'tds_payable', 'output_cgst', 'output_sgst', 'output_igst', 'tcs_payable', 'round_off'))
);

CREATE TABLE "fin"."posting_rule" (
  "rule_code" text NOT NULL,
  "version" integer NOT NULL,
  "document_type" text NOT NULL,
  "display_name" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "code_ref" text NOT NULL,
  "casebook_ref" text NOT NULL,
  "change_note" text,
  "released_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "posting_rule_version_positive" CHECK (version > 0),
  CONSTRAINT "posting_rule_document_type_valid" CHECK (document_type IN ('sales_invoice')),
  CONSTRAINT "posting_rule_period_is_ordered" CHECK (effective_until IS NULL OR effective_from < effective_until),
  PRIMARY KEY ("rule_code", "version")
);

CREATE TABLE "fin"."posting_rule_case" (
  "rule_code" text NOT NULL,
  "version" integer NOT NULL,
  "case_code" text NOT NULL,
  "display_name" text NOT NULL,
  CONSTRAINT "posting_rule_case_code_format" CHECK (case_code ~ '^R[0-9]+$'),
  PRIMARY KEY ("rule_code", "version", "case_code")
);

CREATE TABLE "fin"."posting_rule_role" (
  "rule_code" text NOT NULL,
  "version" integer NOT NULL,
  "line_role_code" text NOT NULL,
  PRIMARY KEY ("rule_code", "version", "line_role_code")
);

CREATE TABLE "fin"."account_determination" (
  "account_determination_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "book_id" uuid NOT NULL,
  "document_type" text,
  "line_role_code" text NOT NULL,
  "party_kind" text,
  "supply_scope" text,
  "line_kind" text,
  "taxability" text,
  "settlement_mode" text,
  "specificity" integer GENERATED ALWAYS AS (num_nonnulls(document_type, party_kind, supply_scope, line_kind, taxability, settlement_mode)) STORED NOT NULL,
  "ledger_account_code" text NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "status" text NOT NULL,
  "reason" text NOT NULL,
  "replaces_account_determination_id" uuid,
  "made_by_contact_id" uuid NOT NULL,
  "made_at" timestamptz NOT NULL,
  "checked_by_contact_id" uuid,
  "checked_at" timestamptz,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "account_determination_document_type_valid" CHECK (document_type IN ('sales_invoice')),
  CONSTRAINT "account_determination_party_kind_valid" CHECK (party_kind IN ('domestic', 'export', 'sez')),
  CONSTRAINT "account_determination_supply_scope_valid" CHECK (supply_scope IN ('intra_state', 'inter_state')),
  CONSTRAINT "account_determination_line_kind_valid" CHECK (line_kind IN ('goods', 'service', 'charge', 'reimbursement')),
  CONSTRAINT "account_determination_taxability_valid" CHECK (taxability IN ('taxable', 'nil_rated', 'exempt', 'non_gst')),
  CONSTRAINT "account_determination_settlement_mode_valid" CHECK (settlement_mode IN ('credit', 'cash', 'upi_card')),
  CONSTRAINT "account_determination_status_valid" CHECK (status IN ('proposed', 'approved', 'rejected')),
  CONSTRAINT "account_determination_period_is_ordered" CHECK (effective_until IS NULL OR effective_from < effective_until),
  CONSTRAINT "account_determination_decided_has_checker" CHECK ((status = 'proposed') = (checked_by_contact_id IS NULL)),
  CONSTRAINT "account_determination_checker_has_a_time" CHECK ((checked_by_contact_id IS NULL) = (checked_at IS NULL)),
  CONSTRAINT "account_determination_checker_not_maker" CHECK (checked_by_contact_id IS NULL OR checked_by_contact_id <> made_by_contact_id),
  CONSTRAINT "account_determination_reason_not_blank" CHECK (btrim(reason) <> ''),
  CONSTRAINT "account_determination_not_its_own_replacement" CHECK (replaces_account_determination_id <> account_determination_id)
);

CREATE TABLE "fin"."account_determination_history" (
  "history_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "account_determination_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "row_snapshot" jsonb NOT NULL,
  "performer_contact_id" uuid NOT NULL,
  "reason" text,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "account_determination_history_operation_valid" CHECK (operation IN ('propose', 'approve', 'reject', 'close'))
);

CREATE TABLE "inv"."stock_lot" (
  "stock_lot_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "workspace_id" text NOT NULL,
  "branch_id" uuid NOT NULL,
  "godown_code" text NOT NULL,
  "item_code" text NOT NULL,
  "lot_no" text NOT NULL,
  "received_on" date NOT NULL,
  "quantity_received" numeric(18,3) NOT NULL,
  "quantity_left" numeric(18,3) NOT NULL,
  "unit_cost" numeric(18,4) NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT (now()),
  "updated_at" timestamptz NOT NULL DEFAULT (now()),
  CONSTRAINT "stock_lot_quantity_received_positive" CHECK (quantity_received > 0),
  CONSTRAINT "stock_lot_quantity_left_in_range" CHECK (quantity_left >= 0 AND quantity_left <= quantity_received),
  CONSTRAINT "stock_lot_unit_cost_not_negative" CHECK (unit_cost >= 0)
);

CREATE UNIQUE INDEX ON "pc"."operated_party" ("workspace_id", "operated_party_id");

CREATE UNIQUE INDEX ON "pc"."party" ("workspace_id", "party_id");

CREATE UNIQUE INDEX ON "pc"."party_identifier" ("workspace_id", "party_identifier_id");

CREATE UNIQUE INDEX ON "pc"."business_location" ("workspace_id", "business_location_id");

CREATE UNIQUE INDEX ON "pc"."party_standing" ("workspace_id", "party_standing_id");

CREATE UNIQUE INDEX ON "pc"."contact" ("workspace_id", "contact_id");

CREATE INDEX "customer_request_queue_ix" ON "fin"."customer_request" ("workspace_id", "operated_party_id", "stage");

CREATE UNIQUE INDEX ON "fin"."customer_request_approval" ("request_id", "submission_number", "approval_part_code");

CREATE UNIQUE INDEX "debtor_account_workspace_identity_key" ON "fin"."debtor_account" ("workspace_id", "debtor_account_id");

CREATE UNIQUE INDEX "one_debtor_account_per_party" ON "fin"."debtor_account" ("workspace_id", "operated_party_id", "party_id");

CREATE UNIQUE INDEX ON "fin"."debtor_account" ("workspace_id", "operated_party_id", "customer_code");

CREATE UNIQUE INDEX ON "fin"."debtor_account" ("workspace_id", "operated_party_id", "account_name");

CREATE UNIQUE INDEX ON "fin"."debtor_tax_registration" ("debtor_account_id", "party_identifier_id");

CREATE UNIQUE INDEX "one_default_registration" ON "fin"."debtor_tax_registration" ("debtor_account_id") WHERE is_default AND until IS NULL;

CREATE UNIQUE INDEX "one_open_location_per_usage" ON "fin"."debtor_location" ("debtor_account_id", "business_location_id", "usage") WHERE until IS NULL;

CREATE UNIQUE INDEX "one_primary_per_registration" ON "fin"."debtor_location" ("debtor_tax_registration_id") WHERE usage = 'bill_to' AND is_primary AND until IS NULL;

CREATE UNIQUE INDEX "one_default_ship_to" ON "fin"."debtor_location" ("debtor_account_id") WHERE usage = 'ship_to' AND is_primary AND until IS NULL;

CREATE UNIQUE INDEX "one_current_limit" ON "fin"."debtor_credit_limit" ("debtor_account_id") WHERE effective_until IS NULL;

CREATE UNIQUE INDEX ON "fin"."party_bank_account" ("workspace_id", "party_id", "party_bank_account_id");

CREATE UNIQUE INDEX "one_open_bank_row_per_party" ON "fin"."party_bank_account" ("workspace_id", "party_id", "ifsc", "account_no") WHERE until IS NULL;

CREATE INDEX "bank_account_in_use_ix" ON "fin"."party_bank_account" ("workspace_id", "ifsc", "account_no");

CREATE UNIQUE INDEX "branch_workspace_identity_key" ON "fin"."branch" ("workspace_id", "branch_id");

CREATE UNIQUE INDEX "branch_code_per_company" ON "fin"."branch" ("workspace_id", "operated_party_id", "branch_code");

CREATE UNIQUE INDEX "fiscal_year_workspace_identity_key" ON "fin"."fiscal_year" ("workspace_id", "fiscal_year_id");

CREATE UNIQUE INDEX "fiscal_year_start_per_company" ON "fin"."fiscal_year" ("workspace_id", "operated_party_id", "start_date");

CREATE UNIQUE INDEX "journal_entry_workspace_identity_key" ON "fin"."journal_entry" ("workspace_id", "journal_entry_id");

CREATE UNIQUE INDEX "journal_entry_reversed_once" ON "fin"."journal_entry" ("workspace_id", "reverses_journal_entry_id");

CREATE UNIQUE INDEX "journal_entry_one_forward_entry_per_document" ON "fin"."journal_entry" ("workspace_id", "voucher_type", "source_document_id") WHERE reverses_journal_entry_id IS NULL AND source_document_id IS NOT NULL;

CREATE INDEX "journal_entry_posting_date_idx" ON "fin"."journal_entry" ("workspace_id", "operated_party_id", "posting_date");

CREATE UNIQUE INDEX "journal_line_no_key" ON "fin"."journal_line" ("workspace_id", "journal_entry_id", "line_no");

CREATE INDEX "journal_line_debtor_idx" ON "fin"."journal_line" ("workspace_id", "debtor_account_id");

CREATE INDEX "journal_line_creditor_idx" ON "fin"."journal_line" ("workspace_id", "creditor_account_id");

CREATE INDEX "journal_line_ledger_idx" ON "fin"."journal_line" ("workspace_id", "ledger_account_code");

CREATE INDEX "journal_line_branch_ledger_idx" ON "fin"."journal_line" ("workspace_id", "branch_id", "ledger_account_code");

CREATE INDEX "journal_line_determination_idx" ON "fin"."journal_line" ("workspace_id", "account_determination_id");

CREATE UNIQUE INDEX "sales_invoice_workspace_identity_key" ON "fin"."sales_invoice" ("workspace_id", "sales_invoice_id");

CREATE UNIQUE INDEX "sales_invoice_internal_ref_no_key" ON "fin"."sales_invoice" ("workspace_id", "operated_party_id", "internal_ref_no");

CREATE UNIQUE INDEX "sales_invoice_one_open_amendment" ON "fin"."sales_invoice" ("workspace_id", "amends_sales_invoice_id") WHERE stage IN ('draft', 'submitted');

CREATE INDEX "sales_invoice_stage_idx" ON "fin"."sales_invoice" ("workspace_id", "stage");

CREATE INDEX "sales_invoice_debtor_idx" ON "fin"."sales_invoice" ("workspace_id", "debtor_account_id");

CREATE UNIQUE INDEX "sales_invoice_line_no_key" ON "fin"."sales_invoice_line" ("workspace_id", "sales_invoice_id", "line_no");

CREATE UNIQUE INDEX "sales_invoice_history_one_per_version" ON "fin"."sales_invoice_history" ("workspace_id", "sales_invoice_id", "version_number");

CREATE UNIQUE INDEX "book_workspace_identity_key" ON "fin"."book" ("workspace_id", "book_id");

CREATE UNIQUE INDEX "book_code_per_company" ON "fin"."book" ("workspace_id", "operated_party_id", "book_code");

CREATE UNIQUE INDEX "book_one_primary_per_company" ON "fin"."book" ("workspace_id", "operated_party_id") WHERE is_primary;

CREATE UNIQUE INDEX "book_setting_workspace_identity_key" ON "fin"."book_setting" ("workspace_id", "book_setting_id");

CREATE INDEX "book_setting_lookup_idx" ON "fin"."book_setting" ("workspace_id", "book_id", "setting_code", "effective_from");

CREATE UNIQUE INDEX "account_determination_workspace_identity_key" ON "fin"."account_determination" ("workspace_id", "account_determination_id");

CREATE UNIQUE INDEX "account_determination_trace_key" ON "fin"."account_determination" ("workspace_id", "account_determination_id", "line_role_code", "ledger_account_code");

CREATE UNIQUE INDEX "account_determination_replaced_once" ON "fin"."account_determination" ("workspace_id", "replaces_account_determination_id") WHERE status <> 'rejected';

CREATE INDEX "account_determination_lookup_idx" ON "fin"."account_determination" ("workspace_id", "book_id", "line_role_code", "effective_from");

CREATE INDEX "account_determination_history_idx" ON "fin"."account_determination_history" ("workspace_id", "account_determination_id", "recorded_at");

CREATE UNIQUE INDEX "stock_lot_workspace_identity_key" ON "inv"."stock_lot" ("workspace_id", "stock_lot_id");

CREATE UNIQUE INDEX "stock_lot_lot_key" ON "inv"."stock_lot" ("workspace_id", "branch_id", "godown_code", "item_code", "lot_no");

CREATE INDEX "stock_lot_fifo_idx" ON "inv"."stock_lot" ("workspace_id", "branch_id", "item_code", "received_on");

COMMENT ON TABLE "pc"."operated_party" IS 'P&C says which party is our company. THE company key in Finance (as on the vendor side): no legal_entity_id, no separate book key.';

COMMENT ON COLUMN "pc"."operated_party"."operated_party_id" IS 'OP-1: our company, the one this workspace runs';

COMMENT ON COLUMN "pc"."operated_party"."party_id" IS 'P-OUR = Aikyat Technologies';

COMMENT ON TABLE "pc"."private_anchor" IS 'A hidden identity row behind every party and contact; its id becomes party_id / contact_id. Finance never reads it.';

COMMENT ON COLUMN "pc"."private_anchor"."anchor_kind" IS 'organization | person';

COMMENT ON TABLE "pc"."party" IS 'Who the customer is, as a legal person.';

COMMENT ON COLUMN "pc"."party"."party_id" IS 'same value as its private_anchor';

COMMENT ON COLUMN "pc"."party"."party_kind" IS 'person | organization';

COMMENT ON COLUMN "pc"."party"."legal_form_code" IS 'pc.legal_form: IN_PVT_LTD … (only IN_PVT_LTD is seeded today)';

COMMENT ON COLUMN "pc"."party_trade_name"."name" IS 'the form''s Customer Name';

COMMENT ON TABLE "pc"."party_identifier" IS 'PAN and EVERY GSTIN (main + B1) of the customer. Not unique by design: a match never merges by itself. No location column.';

COMMENT ON COLUMN "pc"."party_identifier"."scheme_code" IS 'IN_PAN | IN_GST';

COMMENT ON COLUMN "pc"."party_identifier"."jurisdiction_scope_code" IS 'IN for PAN; the GST state for a GSTIN, e.g. IN-TN';

COMMENT ON COLUMN "pc"."party_identifier"."standing_code" IS 'GST: active | suspended | cancelled | none_held';

COMMENT ON TABLE "pc"."business_location" IS 'A physical place of the customer: the registered address, each B1 branch address, a shipping address. Carries no GSTIN.';

COMMENT ON COLUMN "pc"."business_location"."display_name" IS 'Registered office · Chennai branch · Ship-to';

COMMENT ON COLUMN "pc"."business_location"."locality" IS 'city';

COMMENT ON COLUMN "pc"."business_location"."administrative_area_code" IS 'IN-KA';

COMMENT ON COLUMN "pc"."business_location"."until" IS 'a closed place gets an until; never deleted';

COMMENT ON TABLE "pc"."party_standing" IS 'P-1 is a customer OF our company OP-1. A party already our vendor gets a second standing, never a second party.';

COMMENT ON COLUMN "pc"."party_standing"."standing_type_code" IS 'customer (to be seeded in P&C: no standing types are seeded yet)';

COMMENT ON TABLE "pc"."contact" IS 'The customer''s contact person, and our own staff (Teja, Rajan, Farid, Venkat, Arun): every *_contact_id in Finance points here.';

COMMENT ON COLUMN "pc"."contact"."contact_id" IS 'same value as its private_anchor';

COMMENT ON COLUMN "pc"."contact"."contact_kind" IS 'person | system: every Finance *_contact_id must be a person (checked by the action; a foreign key cannot)';

COMMENT ON COLUMN "pc"."contact_party_association"."capacity_code" IS 'customer_contact (to be seeded)';

COMMENT ON COLUMN "pc"."contact_point"."channel_kind" IS 'phone | email';

COMMENT ON TABLE "pc"."record_history" IS 'P&C''s own history: one row per P&C record written.';

COMMENT ON TABLE "fin"."ledger_account" IS 'The chart of accounts: groups and ledgers in one table. SHARED with the vendor side (Manoj''s table, same columns).
Rev 5: no "control ledger" (Manoj, 13-Nov): a ledger whose account_type is receivable takes only lines that name a customer account.
Seed (task S2, Chart of accounts): the CA''s chart. Debtor control ledgers 107010–107130 (Indian GAAP) or 110010–110130 (Ind AS):
the framework decides the code (gap G4). Employee advances: 105030 (not a trade receivable).';

COMMENT ON COLUMN "fin"."ledger_account"."account_code" IS 'the CA''s 6-digit code: [group 1][sub-group 2][ledger 3], e.g. 107010';

COMMENT ON COLUMN "fin"."ledger_account"."display_name" IS 'Trade Receivables – Domestic';

COMMENT ON COLUMN "fin"."ledger_account"."kind" IS 'asset | liability | equity | income | expense';

COMMENT ON COLUMN "fin"."ledger_account"."parent_account_code" IS 'the group above it';

COMMENT ON COLUMN "fin"."ledger_account"."account_type" IS 'rev 5 (Manoj 13-Nov, built; replaces is_control): payable | receivable (each line names a vendor / customer) | stock | input_cgst | input_sgst | input_igst | tds_payable | T24: output_cgst | output_sgst | output_igst | tcs_payable | round_off. NULL on a group';

COMMENT ON TABLE "fin"."debtor_category" IS 'The CA''s Debtor Category Master: 16 rows, the twin of fin.creditor_category (20 rows).
It drives the form''s "System suggestions". The invoice task reads gst_treatment / tcs from here (as the vendor bill reads creditor_category).
Seed, category → ledger (Indian GAAP · Ind AS):
DOMESTIC_B2B_REGULAR 107010 · 110010 | DOMESTIC_B2C_RETAIL 107020 · 110020 | DOMESTIC_B2G 107030 · 110030 | EXPORT_GOODS 107040 · 110040
EXPORT_SERVICES 107040 · 110040 | SEZ_UNIT 107050 · 110050 | DEEMED_EXPORT 107060 · 110060 | ECOMMERCE_MARKETPLACE 107070 · 110070
RELATED_PARTY_DOMESTIC 107080 · 110080 | RELATED_PARTY_OVERSEAS 107090 · 110090 | DEALER_DISTRIBUTOR 107100 · 110100
SCRAP_SPECIFIED_GOODS 107110 · 110110 | LUXURY_GOODS 107120 · 110120 | TOUR_PACKAGE 107130 · 110130
COMPOSITION_SCHEME 107010 · 110010 (Trade Receivables – Domestic) | EMPLOYEE_ADVANCES 105030 (Employee Advances Receivable)';

COMMENT ON COLUMN "fin"."debtor_category"."debtor_category_code" IS 'DOMESTIC_B2B_REGULAR …';

COMMENT ON COLUMN "fin"."debtor_category"."display_name" IS 'Domestic B2B Trade Debtor – Regular';

COMMENT ON COLUMN "fin"."debtor_category"."ledger_account_code" IS 'the control ledger the category names: nobody picks a ledger on the form';

COMMENT ON COLUMN "fin"."debtor_category"."customer_type_code" IS 'b2b | b2c | b2g: what the category implies (a warning if the form differs)';

COMMENT ON COLUMN "fin"."debtor_category"."international" IS 'an export category: Export customer must be Yes';

COMMENT ON COLUMN "fin"."debtor_category"."related_party" IS 'Ind AS 24 disclosure + elimination';

COMMENT ON COLUMN "fin"."debtor_category"."gst_treatment_note" IS 'the CA''s words, e.g. Zero-rated (with LUT/Bond, or with IGST + refund)';

COMMENT ON COLUMN "fin"."debtor_category"."tcs_section_code" IS '394(1) | 394 | SEC52_CGST | NULL = not applicable';

COMMENT ON COLUMN "fin"."debtor_category"."credit_period_note" IS 'the CA''s words: 30 Days · As per contract / Advance';

COMMENT ON COLUMN "fin"."debtor_category"."default_credit_days" IS 'only when the CA gives one number (30, 45)';

COMMENT ON TABLE "fin"."gst_state_code" IS 'Turns the first two digits of a GSTIN into a state. SHARED with the vendor side (41 rows). Our GST home state (Karnataka, 29) is a company setting.';

COMMENT ON COLUMN "fin"."gst_state_code"."gst_code" IS '29';

COMMENT ON COLUMN "fin"."gst_state_code"."iso_3166_2" IS 'IN-KA; NULL for 96 Other Countries, 97 Other Territory, 99 Centre Jurisdiction (rev 5: nullable, as built)';

COMMENT ON TABLE "fin"."customer_request" IS 'One customer form, as typed: the twin of fin.vendor_request. It keeps what was typed even after approval.
Typed fields are nullable: a draft may be half filled; the checks run at Submit (the form''s mandatory rules).
CHECKS AT SUBMIT (rev 4: written here; the app runs them, src/onboarding/rules.ts). STOP = cannot submit · WARN = accept with a reason.
  Fill   every mandatory field of the CA form (red), each conditional one when its condition holds (amber)            STOP
  PAN    AAAAA0000A · GSTIN 15 characters, its PAN part = the PAN, a known state code · same for every B1 GSTIN        STOP
  GST    gst_registered = false ⇒ gstin, gst_registration_type, gst_registration_count NULL and B1 empty                 STOP
  B1     at most 15 · no GSTIN listed twice · billing GSTIN needed when more than one · the billing GSTIN has an address   STOP
  Portal each GSTIN checked on the GST portal: cancelled STOP · suspended WARN · name differs WARN (gap G10: deferred)
  State  the main GSTIN''s state = the registered address state                                                         STOP
  Place  PIN 6 digits (registered, B1, ship-to) · a shipping address needs its city, state and PIN                      STOP
  People mobile 10 digits · email valid · at least one mobile and one email · each extra contact has a name             STOP
  Export export category ⇔ export_customer · section E only when export_customer · no LUT → IGST paid route             STOP / WARN
  Match  customer category vs the category''s · SEZ / composition type vs the category · TCS not confirmed               WARN
  Credit credit ⇒ credit_limit_amount and credit_days set · amounts >= 0 · credit_days vs payment terms (WARN)        STOP / WARN
  Bank   all or nothing: account no, IFSC and beneficiary together · IFSC ^[A-Z]{4}0[A-Z0-9]{6}$ (STOP) ·
         the account held by another party (WARN, BANK_ACCOUNT_IN_USE) · the same party already holds it: reused, no new row
  Once   the PAN / GSTIN already has an open customer account in this company: STOP (ALREADY_OUR_CUSTOMER); a known party: reuse it
  Name   account_name unique in the books                                                                              STOP
  Maker  decider <> submitted_by_contact_id                                                                            STOP
Not stored (worked out each time): tax type (GSTIN state vs our home state), the header above the ledger, the
GST / TCS words (from the category). CHECKs: stage list; returned ⇒ return_reason; active ⇒ party_id and debtor_account_id.';

COMMENT ON COLUMN "fin"."customer_request"."request_id" IS 'R-101';

COMMENT ON COLUMN "fin"."customer_request"."operated_party_id" IS 'our company OP-1';

COMMENT ON COLUMN "fin"."customer_request"."stage" IS 'draft | submitted | active | returned | rejected';

COMMENT ON COLUMN "fin"."customer_request"."paper_form_number" IS 'CRF-0021: the paper Sales handed over';

COMMENT ON COLUMN "fin"."customer_request"."handed_over_by_contact_id" IS 'Arun (Sales Executive)';

COMMENT ON COLUMN "fin"."customer_request"."customer_name" IS 'Customer Name → pc.party_trade_name';

COMMENT ON COLUMN "fin"."customer_request"."legal_name" IS '→ pc.party';

COMMENT ON COLUMN "fin"."customer_request"."constitution_code" IS 'individual | proprietorship | partnership | llp | company | huf | trust_society | government | foreign_entity | other → party_kind + legal_form_code';

COMMENT ON COLUMN "fin"."customer_request"."customer_type_code" IS 'the form''s Customer Category: b2b | b2c | b2g';

COMMENT ON COLUMN "fin"."customer_request"."debtor_category_code" IS 'drives the suggestions; gives the ledger';

COMMENT ON COLUMN "fin"."customer_request"."pan" IS '→ pc.party_identifier IN_PAN';

COMMENT ON COLUMN "fin"."customer_request"."resident_status" IS 'resident | non_resident';

COMMENT ON COLUMN "fin"."customer_request"."account_name" IS 'NULL = customer_name; unique in the books';

COMMENT ON COLUMN "fin"."customer_request"."gstin" IS 'the main GSTIN → pc.party_identifier IN_GST';

COMMENT ON COLUMN "fin"."customer_request"."gst_registration_type" IS 'regular | composition | sez | government | unregistered | other';

COMMENT ON COLUMN "fin"."customer_request"."gst_registration_count" IS 'how many in additional_gst_registrations';

COMMENT ON COLUMN "fin"."customer_request"."additional_gst_registrations" IS 'B1, up to 15: [{gstin, registration_type, address_lines, locality, postal_code, remarks}].
The state is not typed: it comes from the GSTIN''s first two digits (fin.gst_state_code). The status (active | suspended | cancelled)
is not typed either: the GST portal check gives it, and it lands in pc.party_identifier.standing_code (a cancelled GSTIN stops Submit).
Which GSTIN is the default is billing_gstin, not a flag in the list. At approval each entry → pc.party_identifier + fin.debtor_tax_registration,
and, when it has an address, pc.business_location + fin.debtor_location (bill_to).';

COMMENT ON COLUMN "fin"."customer_request"."billing_gstin" IS 'Default / Billing GSTIN; NULL = the main one → debtor_tax_registration.is_default';

COMMENT ON COLUMN "fin"."customer_request"."e_invoice_applicable" IS 'yes | no | not_applicable';

COMMENT ON COLUMN "fin"."customer_request"."tcs_applicability_confirmed" IS 'yes | no | not_applicable';

COMMENT ON COLUMN "fin"."customer_request"."address_lines" IS '→ pc.business_location (Registered office)';

COMMENT ON COLUMN "fin"."customer_request"."administrative_area_code" IS 'IN-KA';

COMMENT ON COLUMN "fin"."customer_request"."shipping_address_lines" IS 'the CA form''s Shipping Address (if different) → pc.business_location "Ship-to" + fin.debtor_location (ship_to)';

COMMENT ON COLUMN "fin"."customer_request"."shipping_locality" IS 'rev 4, not on the CA form: needed with the lines';

COMMENT ON COLUMN "fin"."customer_request"."shipping_administrative_area_code" IS 'rev 4: the ship-to state decides the place of supply for goods (IGST Act s.10(1)(a))';

COMMENT ON COLUMN "fin"."customer_request"."shipping_postal_code" IS 'rev 4: the e-way bill needs the ship-to PIN';

COMMENT ON COLUMN "fin"."customer_request"."shipping_country_code" IS 'rev 4; default IN';

COMMENT ON COLUMN "fin"."customer_request"."contacts" IS 'rev 4, as vendor_request: [{name, phones[], emails[]}]. Entry 1 is the CA form''s Contact Person,
Mobile Number and Email ID; more can be added. At approval each entry → pc.contact + pc.contact_party_association (customer_contact),
and each phone / email → pc.contact_point. A blank name: the customer name is used (placeholder rule, to confirm with P&C).';

COMMENT ON COLUMN "fin"."customer_request"."bank_beneficiary" IS 'account holder name → fin.party_bank_account';

COMMENT ON COLUMN "fin"."customer_request"."bank_proof_attached" IS 'cancelled cheque / bank letter';

COMMENT ON COLUMN "fin"."customer_request"."credit_or_cash" IS 'credit | cash';

COMMENT ON COLUMN "fin"."customer_request"."credit_limit_amount" IS '→ fin.debtor_credit_limit';

COMMENT ON COLUMN "fin"."customer_request"."payment_terms_code" IS 'immediate | net_15 | net_30 | net_45 | net_60 | net_90 | other';

COMMENT ON COLUMN "fin"."customer_request"."po_reference_rule" IS 'every_invoice | none';

COMMENT ON COLUMN "fin"."customer_request"."invoice_delivery_channel" IS 'email | portal | with_goods | courier';

COMMENT ON COLUMN "fin"."customer_request"."export_category_code" IS 'goods | services | goods_services';

COMMENT ON COLUMN "fin"."customer_request"."realisation_mode_code" IS 'advance | brc_firc | lc | other';

COMMENT ON COLUMN "fin"."customer_request"."created_by_contact_id" IS 'Teja';

COMMENT ON COLUMN "fin"."customer_request"."submission_number" IS '+1 at each submit; approvals belong to one submission';

COMMENT ON COLUMN "fin"."customer_request"."accepted_warnings" IS 'warnings Teja accepted at submit';

COMMENT ON COLUMN "fin"."customer_request"."return_reason" IS 'stage = returned: the paper went back to Sales';

COMMENT ON COLUMN "fin"."customer_request"."party_id" IS 'set when Teja uses a party P&C already holds, else at activation';

COMMENT ON COLUMN "fin"."customer_request"."debtor_account_id" IS 'set at activation: a plain pointer (a second foreign key would make a circle)';

COMMENT ON TABLE "fin"."customer_request_approval" IS 'The app routes one submit to three checkers, each their part (task card T12: the Credit Controller checks the limit).
Vendor side has one decision column set (decided_by, decision); the customer has three parts, so a child table.
Rule: approver_contact_id <> customer_request.submitted_by_contact_id. The LAST approval runs the one transaction.';

COMMENT ON COLUMN "fin"."customer_request_approval"."approval_id" IS 'AP-1 …';

COMMENT ON COLUMN "fin"."customer_request_approval"."approval_part_code" IS 'account | credit_limit | tax';

COMMENT ON COLUMN "fin"."customer_request_approval"."approver_role_code" IS 'accounts_manager | credit_controller | compliance_officer';

COMMENT ON COLUMN "fin"."customer_request_approval"."approver_contact_id" IS 'who decided (Rajan · Farid · Venkat)';

COMMENT ON COLUMN "fin"."customer_request_approval"."outcome" IS 'pending | approved | sent_back | rejected';

COMMENT ON COLUMN "fin"."customer_request_approval"."reason" IS 'needed for sent_back and rejected';

COMMENT ON COLUMN "fin"."customer_request_approval"."approved_values" IS 'the fields of this part as approved: an unchanged part stays approved on resubmit';

COMMENT ON TABLE "fin"."customer_request_history" IS 'One row per version of the request (as fin.vendor_request_history).';

COMMENT ON COLUMN "fin"."customer_request_history"."history_id" IS 'RH-1 …';

COMMENT ON COLUMN "fin"."customer_request_history"."operation" IS 'create | save | submit | send_back | return_form | reject | activate';

COMMENT ON COLUMN "fin"."customer_request_history"."row_snapshot" IS 'the full request row at this version';

COMMENT ON TABLE "fin"."debtor_account" IS 'The twin of fin.creditor_account. Finance keeps the id and the money facts; the identity stays in P&C.
No balance column and no journal row: the balance is zero until the first invoice (T24), whose customer line posts to
ledger_account_code and names debtor_account_id (fin.journal_line). What it owes = Σ(debit − credit) of those lines.';

COMMENT ON COLUMN "fin"."debtor_account"."debtor_account_id" IS 'DA-1';

COMMENT ON COLUMN "fin"."debtor_account"."operated_party_id" IS 'our company OP-1';

COMMENT ON COLUMN "fin"."debtor_account"."party_id" IS 'the customer P-1';

COMMENT ON COLUMN "fin"."debtor_account"."party_standing_id" IS 'its customer standing PS-1';

COMMENT ON COLUMN "fin"."debtor_account"."customer_code" IS 'C000001: the CA''s own series, never built from the ledger code';

COMMENT ON COLUMN "fin"."debtor_account"."ledger_account_code" IS 'rev 5 (was control_ledger_code; Manoj 13-Nov, built): the receivable ledger this customer posts to, copied from the category at opening; a later change is dated in the history (gap G6)';

COMMENT ON COLUMN "fin"."debtor_account"."customer_type_code" IS 'b2b | b2c | b2g';

COMMENT ON COLUMN "fin"."debtor_account"."credit_days" IS 'NULL for a cash customer';

COMMENT ON COLUMN "fin"."debtor_account"."sales_blocked" IS 'no new orders or invoices (a credit hold is the Credit Controller''s task)';

COMMENT ON COLUMN "fin"."debtor_account"."refund_bank_account_id" IS 'rev 4, optional: fin.party_bank_account of the SAME party, for refunds (excess payment, security deposit, credit note). Unverified until the first refund (the refund task verifies it)';

COMMENT ON COLUMN "fin"."debtor_account"."closed_at" IS 'NULL = open';

COMMENT ON COLUMN "fin"."debtor_account"."recorded_at" IS 'rev 5: as built';

COMMENT ON COLUMN "fin"."debtor_account"."updated_at" IS 'rev 5: as built';

COMMENT ON TABLE "fin"."debtor_tax_registration" IS 'How the account treats each GSTIN (twin of fin.creditor_tax_registration). The number stays in P&C; Finance keeps the type and the default.';

COMMENT ON COLUMN "fin"."debtor_tax_registration"."debtor_tax_registration_id" IS 'TR-1 …';

COMMENT ON COLUMN "fin"."debtor_tax_registration"."party_identifier_id" IS 'the GSTIN row in P&C (IN_GST)';

COMMENT ON COLUMN "fin"."debtor_tax_registration"."registration_type" IS 'regular | composition | sez | government | other';

COMMENT ON COLUMN "fin"."debtor_tax_registration"."is_default" IS 'the form''s Default / Billing GSTIN';

COMMENT ON TABLE "fin"."debtor_location" IS 'EXTRA to the vendor model: the customer places we use, and how. We bill customers and ship to them; vendors bill us.
bill_to: which place we bill under which GSTIN. P&C links a GSTIN to a party, not to a place; its model leaves
"registration, or accounting branch" to the domain. One GSTIN can serve several places; a place has one GSTIN at a time.
Invoice default = the default registration → its primary bill_to place. A B1 GSTIN with no address has a registration row
and no place yet (added later).
ship_to (rev 4): where goods go. Written at approval from the shipping address, only if the form gives one. No ship_to row =
goods go to the default bill_to place. The ship-to state decides the place of supply for goods (IGST Act s.10(1)(a)); the
invoice prints it as the delivery address (CGST Rule 46); the e-way bill takes its PIN.
CHECKS: usage IN (bill_to, ship_to) · ship_to ⇒ debtor_tax_registration_id IS NULL · since < until.
If P&C adopts registration_place (Branch Design, gap G8), the bill_to GSTIN link becomes a P&C read.';

COMMENT ON COLUMN "fin"."debtor_location"."debtor_location_id" IS 'DL-1 … (rev 3: debtor_billing_location; the app calls a bill-to place a branch)';

COMMENT ON COLUMN "fin"."debtor_location"."business_location_id" IS 'the customer place in P&C';

COMMENT ON COLUMN "fin"."debtor_location"."usage" IS 'rev 4: bill_to | ship_to';

COMMENT ON COLUMN "fin"."debtor_location"."debtor_tax_registration_id" IS 'bill_to: the GSTIN it is billed under (NULL = billed as unregistered) · ship_to: NULL';

COMMENT ON COLUMN "fin"."debtor_location"."is_primary" IS 'bill_to: the main place of that registration · ship_to: the default delivery place';

COMMENT ON COLUMN "fin"."debtor_location"."until" IS 'deactivated: no new invoices or deliveries to it';

COMMENT ON TABLE "fin"."debtor_credit_limit" IS 'EXTRA to the vendor model: a dated credit limit, never overwritten. T12''s other trigger (a new limit from the Credit Controller) adds a row and closes the old one.';

COMMENT ON COLUMN "fin"."debtor_credit_limit"."debtor_credit_limit_id" IS 'CL-1';

COMMENT ON COLUMN "fin"."debtor_credit_limit"."effective_until" IS 'NULL = the current limit';

COMMENT ON COLUMN "fin"."debtor_credit_limit"."approved_by_contact_id" IS 'the Credit Controller (Farid)';

COMMENT ON COLUMN "fin"."debtor_credit_limit"."source_request_id" IS 'the request that set it';

COMMENT ON TABLE "fin"."party_bank_account" IS 'rev 4. SHARED with the vendor side: Manoj''s table, same columns. It belongs to the PARTY, so a customer who is also our vendor
keeps one row, and both accounts can point at it. Optional for a customer (not on the CA form; Vijay, 6-Nov): for refunds of
an excess payment, a security deposit or a credit note, and to recognise the customer''s receipts in the bank statement.
Written by OpenDebtorAccount only when the form gives the bank details (reused when the same party already holds it).
A customer needs no penny-drop at onboarding: the account is verified before the first refund is paid (the refund task).
Owner to review with Manoj (his Q1: P&C keeps bank accounts out of its model on purpose).';

COMMENT ON COLUMN "fin"."party_bank_account"."party_bank_account_id" IS 'BA-1';

COMMENT ON COLUMN "fin"."party_bank_account"."party_id" IS 'the party the account belongs to (customer, vendor, or both)';

COMMENT ON COLUMN "fin"."party_bank_account"."ifsc" IS '^[A-Z]{4}0[A-Z0-9]{6}$; SWIFT / IBAN for a foreign bank: Q15 in Manoj ER';

COMMENT ON COLUMN "fin"."party_bank_account"."verified_at" IS 'NULL until verified (penny-drop)';

COMMENT ON TABLE "fin"."debtor_account_history" IS 'One row per version of the account (as fin.creditor_account_history).';

COMMENT ON COLUMN "fin"."debtor_account_history"."history_id" IS 'AH-1';

COMMENT ON COLUMN "fin"."debtor_account_history"."operation" IS 'open | change | add_location | end_location | set_default_registration | change_ledger | change_credit_limit | change_refund_bank | block | close';

COMMENT ON TABLE "fin"."outbox" IS 'EXTRA, kept: the event is the only link from a slice to the accounting engine (our engine model).
The engine logs DebtorAccountOpened as seen and posts nothing (a master, not a transaction). Written in the same transaction.';

COMMENT ON COLUMN "fin"."outbox"."event_id" IS 'EV-1: the idempotency key';

COMMENT ON COLUMN "fin"."outbox"."event_type" IS 'DebtorAccountOpened · DebtorBillingLocationAdded · DebtorCreditLimitChanged …';

COMMENT ON COLUMN "fin"."outbox"."aggregate_type" IS 'debtor_account';

COMMENT ON COLUMN "fin"."outbox"."published_at" IS 'NULL = not yet sent';

COMMENT ON TABLE "fin"."branch" IS 'Manoj''s (0005). Our own branches: the stub of task S3 (gap G7). Every journal line carries one.
T24: the voucher carries the branch (our GSTIN) that issued the invoice; its journal lines carry it too.';

COMMENT ON COLUMN "fin"."branch"."branch_id" IS 'seeded: KA-01 6b1d0a52-0001-4f0e-8a51-5c0b7a000001 · TN-01 6b1d0a52-0002-4f0e-8a51-5c0b7a000002';

COMMENT ON COLUMN "fin"."branch"."branch_code" IS 'KA-01 · TN-01';

COMMENT ON COLUMN "fin"."branch"."display_name" IS 'Bengaluru plant and HQ · Hosur unit';

COMMENT ON COLUMN "fin"."branch"."business_location_id" IS 'our place in P&C';

COMMENT ON COLUMN "fin"."branch"."gst_identifier_id" IS 'our GSTIN in P&C (IN_GST): 29AAECA0000A1ZQ · 33AAECA0000A1Z1';

COMMENT ON TABLE "fin"."fiscal_year" IS 'Manoj''s (0005). Period control at year level (FINANCIAL_YEAR_CLOSED). Seeded FY 2025-26 to FY 2027-28, none closed.
Also in the migration: EXCLUDE no overlap (btree_gist). Month-level soft / hard close (the app''s K7, K8) is not here: gap G27.';

COMMENT ON COLUMN "fin"."fiscal_year"."label" IS 'FY 2026-27';

COMMENT ON TABLE "fin"."document_sequence" IS 'Manoj''s (0005). The INTERNAL reference, company-wide (INSERT … ON CONFLICT DO UPDATE … RETURNING: the row lock serialises two savers).
T24 uses it for sales_invoice.internal_ref_no (SV-nnnn). The GST invoice number is Billing''s.';

COMMENT ON COLUMN "fin"."document_sequence"."document_type" IS 'purchase_invoice (PV-0001) · T24: sales_invoice (SV-0001); one row per voucher type';

COMMENT ON TABLE "fin"."journal_entry" IS 'Manoj''s (0005), written once (append-only trigger). T24 rev 2 changes ONE thing: voucher_type also allows ''sales''
(the CHECK is dropped and re-added; his rows are untouched; T1 is checked again).
At commit, fin.check_journal_entry refuses an entry that breaks any of 8 rules (HINT = the code): ENTRY_NOT_BALANCED ·
ENTRY_ACROSS_COMPANIES · ENTRY_OUTSIDE_ITS_YEAR · FINANCIAL_YEAR_CLOSED · POSTED_TO_A_GROUP · SUBLEDGER_MISMATCH ·
ACCOUNT_NOT_ON_ITS_LEDGER · REVERSAL_NOT_A_MIRROR. The sales voucher posts through the same journal.PostJournalEntry.';

COMMENT ON COLUMN "fin"."journal_entry"."journal_entry_id" IS 'JE-…';

COMMENT ON COLUMN "fin"."journal_entry"."branch_id" IS 'T24: the branch (GSTIN) that issued the invoice';

COMMENT ON COLUMN "fin"."journal_entry"."posting_date" IS 'T24: = the invoice date';

COMMENT ON COLUMN "fin"."journal_entry"."voucher_type" IS 'purchase | opening | T24 rev 2: sales';

COMMENT ON COLUMN "fin"."journal_entry"."source_document_id" IS 'T24: fin.sales_invoice.sales_invoice_id (his: fin.purchase_invoice). No FK: it points at the voucher of its voucher_type (as built)';

COMMENT ON COLUMN "fin"."journal_entry"."source_ref_no" IS 'the voucher number: PV-0001 (his) · SV-0012 (T24), as his post_purchase_invoice writes internal_ref_no';

COMMENT ON COLUMN "fin"."journal_entry"."reverses_journal_entry_id" IS 'a reversal (the exact mirror)';

COMMENT ON COLUMN "fin"."journal_entry"."posted_by_contact_id" IS 'T24: the Accounts Manager who approved';

COMMENT ON TABLE "fin"."journal_line" IS 'Manoj''s (0005). Rev 17 adds 7 trace columns, all nullable so his purchase lines stay valid (to agree with him: G41):
the rule, its version and case, the line''s role, the mapping row and the ledger it gave, and the reason for an override.
"Why was this posted?" = this line → its rule version (the code) → its mapping row (the configuration). One line per fin.sales_invoice_line at Post, the 7 copied as they are. What a customer owes =
Σ(debit − credit) of its lines (journal.debtor_balance, the twin of creditor_balance); it always adds up to the receivable ledgers.';

COMMENT ON COLUMN "fin"."journal_line"."ledger_account_code" IS 'always a ledger; the customer line: the account''s own receivable ledger (107100 …)';

COMMENT ON COLUMN "fin"."journal_line"."creditor_account_id" IS 'set on a vendor''s line';

COMMENT ON COLUMN "fin"."journal_line"."debtor_account_id" IS 'set on a customer''s line (T24): the subledger is these lines grouped by account';

COMMENT ON COLUMN "fin"."journal_line"."rule_code" IS 'rev 17 (S1 part 2): the rule that wrote the line: SALES_INVOICE. NULL: a line typed by hand, or his purchase line until his rules register (G41)';

COMMENT ON COLUMN "fin"."journal_line"."rule_version" IS 'rev 17: 1. With the rule, never without';

COMMENT ON COLUMN "fin"."journal_line"."rule_case" IS 'rev 17: the case of the rule: R1 · R13. NULL: a line common to every case (the customer, GST, round-off)';

COMMENT ON COLUMN "fin"."journal_line"."line_role_code" IS 'rev 17: what the line is for: revenue · output_cgst · cogs · customer. Must be one its rule writes (FK)';

COMMENT ON COLUMN "fin"."journal_line"."account_determination_id" IS 'rev 17: the mapping row that gave the ledger (fin.account_determination). NULL: the customer line (its account''s own ledger) or no rule';

COMMENT ON COLUMN "fin"."journal_line"."determined_ledger_code" IS 'rev 17: the ledger the mapping gave (401010); the FK proves it is that row''s ledger. = the posted ledger unless overridden';

COMMENT ON COLUMN "fin"."journal_line"."override_reason" IS 'rev 17: why another ledger than the mapping gave (the AE''s edit, §8.4): required then, refused otherwise';

COMMENT ON TABLE "fin"."sales_invoice" IS 'T24: the twin of fin.purchase_invoice. One row per Billing invoice the AE books; created at Submit (as his).
FLOW: Submit (AE) → submitted ─Decide (Accounts Manager, not the maker)→ approve: every gate again + PostJournalEntry in one
transaction → posted · reject → rejected · send_back → draft → Submit again. An amendment (a posted voucher corrected) is a new
row with amends_ / revision_no; its approval reverses the old entry and posts the new one; the old row becomes amended.
NEVER TWICE (by hand in the migration, as his purchase_invoice_never_twice): EXCLUDE USING gist (workspace_id WITH =,
branch_id WITH =, invoice_key WITH =, invoice_financial_year WITH =, original_sales_invoice_id WITH <>)
WHERE (stage NOT IN (''rejected'', ''amended'')): Billing''s invoice number is booked once per GSTIN and year.
GATES at Submit and again at Approve (his + the sales ones): MISSING_REQUIRED_DETAILS · BRANCH_NOT_VALID · LEDGER_OR_CUSTOMER ·
AMOUNT_NOT_VALID · LEDGER_NOT_POSTABLE · CUSTOMER_NOT_FOUND · DEBTOR_ACCOUNT_CLOSED · CUSTOMER_LINE_ON_CREDIT · NO_CUSTOMER_LINE
(unless paid at once) · MANY_CUSTOMERS · DUPLICATE_INVOICE · GST_HEAD_MISMATCH (same state → CGST + SGST; other state → IGST) ·
DEBITS_CREDITS_DIFFER · NOT_AS_INVOICED (the customer, GST and total lines must equal Billing''s invoice) · rev 15: NO_STOCK_RECORD ·
STOCK_SHORT · COST_NOT_AS_INVENTORY (the cost lines = the lots by costing_method; FIFO names its lot, weighted average none) ·
STOCK_LINE_NEEDS_ITEM (a stock ledger line names its item) · rev 16: SETTING_MISSING (no inventory_mode / costing_method in force
on the invoice date: the exception queue, never a guess) · COST_LINES_WHEN_PERIODIC · rev 17: RULE_NOT_IN_FORCE (no version of
SALES_INVOICE on the posting date) · ACCOUNT_NOT_DETERMINED · ACCOUNT_AMBIGUOUS (no mapping row, or a tie: the exception queue) ·
OVERRIDE_NEEDS_REASON · MAPPING_CHANGED (approval looks up again; another row than at Submit → sent back) · AMEND_NOT_POSTED ·
AMENDMENT_PENDING · FINANCIAL_YEAR_CLOSED · MAKER_MAY_NOT_DECIDE · NO_REASON_GIVEN.
DIFFERENCES FROM HIS (deliberate): no source_extraction_id (no PDF: Billing hands the invoice over, G37); debtor_account_id may
be NULL (a B2C sale paid at once, his vendor is always there); the never-twice key is per branch, not per party (the number is
ours, unique per GSTIN per year).';

COMMENT ON COLUMN "fin"."sales_invoice"."operated_party_id" IS 'our company';

COMMENT ON COLUMN "fin"."sales_invoice"."branch_id" IS 'our branch (GSTIN) that issued the invoice: KA-01. Its journal lines carry it';

COMMENT ON COLUMN "fin"."sales_invoice"."debtor_account_id" IS 'the customer (T12). NULL only for a B2C sale paid at once (cash / UPI, the CA''s A3): there is no customer line';

COMMENT ON COLUMN "fin"."sales_invoice"."internal_ref_no" IS 'SV-0012: fin.document_sequence ''sales_invoice'' (his PV-0001). An amendment: SV-0012-1';

COMMENT ON COLUMN "fin"."sales_invoice"."amends_sales_invoice_id" IS 'the posted voucher this one corrects (his amends_purchase_invoice_id)';

COMMENT ON COLUMN "fin"."sales_invoice"."original_sales_invoice_id" IS 'the first voucher of the chain (itself when revision 0)';

COMMENT ON COLUMN "fin"."sales_invoice"."revision_no" IS '0 = the first; 1, 2 … = amendments';

COMMENT ON COLUMN "fin"."sales_invoice"."posting_date" IS 'the date the entry posts on (normally the invoice date)';

COMMENT ON COLUMN "fin"."sales_invoice"."invoice_no" IS 'Billing''s invoice number KA/INV/2627/0143 (his supplier_invoice_no)';

COMMENT ON COLUMN "fin"."sales_invoice"."invoice_key" IS 'GENERATED: upper(invoice_no) without spaces (his supplier_invoice_key): the never-twice key';

COMMENT ON COLUMN "fin"."sales_invoice"."invoice_date" IS '07-Oct-2026';

COMMENT ON COLUMN "fin"."sales_invoice"."due_date" IS 'invoice date + the customer''s credit days (30): 06-Nov-2026. Paid at once: the invoice date';

COMMENT ON COLUMN "fin"."sales_invoice"."invoice_financial_year" IS 'GENERATED: the April year of invoice_date (2026)';

COMMENT ON COLUMN "fin"."sales_invoice"."narration" IS 'Being goods sold to Sri Lakshmi Distributors: copied to the journal entry';

COMMENT ON COLUMN "fin"."sales_invoice"."inventory_mode" IS 'rev 16: perpetual | periodic, the book''s setting in force on the invoice date (fin.book_setting), stamped as used. Periodic: no cost lines (T11 posts the month''s cost). NULL: no goods (services only)';

COMMENT ON COLUMN "fin"."sales_invoice"."costing_method" IS 'rev 15: fifo | weighted_average, the company''s method when the cost lines were made (the "why" of their amounts). NULL: no goods (services only), or periodic (rev 16)';

COMMENT ON COLUMN "fin"."sales_invoice"."stage" IS 'submitted | posted | rejected | draft (sent back) | amended';

COMMENT ON COLUMN "fin"."sales_invoice"."submitted_by_contact_id" IS 'the maker: Teja (AE)';

COMMENT ON COLUMN "fin"."sales_invoice"."decided_by_contact_id" IS 'the checker: Rajan (Accounts Manager); never the maker';

COMMENT ON COLUMN "fin"."sales_invoice"."decision_reason" IS 'why rejected or sent back';

COMMENT ON COLUMN "fin"."sales_invoice"."journal_entry_id" IS 'the posted entry (JE-233)';

COMMENT ON TABLE "fin"."sales_invoice_line" IS 'T24: the twin of fin.purchase_invoice_line: side, a ledger OR the customer, amount. Replaced whole on each Submit.
Rev 17: the code writes each line''s ROLE (and case); the mapping (fin.determine_ledger, on the posting date) gives its ledger; the
line keeps both, and the 7 trace columns go to the journal line unchanged at Post.
At Post: one journal_line per row, same order; the customer line goes to its account''s ledger (107100) naming the account.
His vendor line must be Cr; our customer line must be Dr (a sale debits the customer).
Rev 15 (R13): the cost lines: Dr 501040 Cost of Goods Sold (the total) · Cr 106020 Finished Goods per lot (FIFO) or per item
(weighted average), each naming its item and quantity (and its lot under FIFO). B4-01, FIFO: 300 FG-101 from G-2604 at ₹540 +
300 from G-2608 at ₹560 + 300 FG-102 from C-2607 at ₹760 = ₹5,58,000.00 (lot costs illustrative). The item has no foreign key:
the item master is in code until T8 (G20).';

COMMENT ON COLUMN "fin"."sales_invoice_line"."line_no" IS '1, 2, 3 … (Screen: #)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."side" IS 'Dr | Cr';

COMMENT ON COLUMN "fin"."sales_invoice_line"."ledger_account_code" IS 'a ledger line: 401010 Sale of Products · 206011 Output CGST … (rev 17: given by the mapping for the line''s role; the AE may pick another, with a reason)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."debtor_account_id" IS 'the customer line (instead of a ledger): posts to the customer account''s own receivable ledger';

COMMENT ON COLUMN "fin"."sales_invoice_line"."inventory_item_code" IS 'rev 15 (his purchase line has it): the item whose cost leaves stock on this line: FG-101. Set only on a Cr stock line (106020)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."quantity" IS 'rev 15: the quantity that leaves stock: 300 (cartons). With the item, never without';

COMMENT ON COLUMN "fin"."sales_invoice_line"."stock_lot_id" IS 'rev 15: FIFO: the lot it came from (G-2604). NULL under weighted average (all lots, at the average)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."amount" IS '7,48,125.00';

COMMENT ON COLUMN "fin"."sales_invoice_line"."rule_code" IS 'rev 17 (S1 part 2): the rule that wrote the line: SALES_INVOICE. NULL: a line typed by hand, or a line the AE added';

COMMENT ON COLUMN "fin"."sales_invoice_line"."rule_version" IS 'rev 17: 1. With the rule, never without';

COMMENT ON COLUMN "fin"."sales_invoice_line"."rule_case" IS 'rev 17: the case of the rule: R1 · R13. NULL: a line common to every case (the customer, GST, round-off)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."line_role_code" IS 'rev 17: what the line is for: revenue · output_cgst · cogs · customer. Must be one its rule writes (FK)';

COMMENT ON COLUMN "fin"."sales_invoice_line"."account_determination_id" IS 'rev 17: the mapping row that gave the ledger (fin.account_determination). NULL: the customer line (its account''s own ledger) or no rule';

COMMENT ON COLUMN "fin"."sales_invoice_line"."determined_ledger_code" IS 'rev 17: the ledger the mapping gave (401010); the FK proves it is that row''s ledger. = the posted ledger unless overridden';

COMMENT ON COLUMN "fin"."sales_invoice_line"."override_reason" IS 'rev 17: why another ledger than the mapping gave (the AE''s edit, §8.4): required then, refused otherwise';

COMMENT ON TABLE "fin"."sales_invoice_history" IS 'T24: the twin of fin.purchase_invoice_history. One row per version, append-only (trigger). Screen: Approval & history.';

COMMENT ON COLUMN "fin"."sales_invoice_history"."operation" IS 'submit | decide | amended';

COMMENT ON COLUMN "fin"."sales_invoice_history"."row_snapshot" IS 'the voucher row as it then stood';

COMMENT ON COLUMN "fin"."sales_invoice_history"."performer_contact_id" IS 'who did it (Teja, Rajan)';

COMMENT ON COLUMN "fin"."sales_invoice_history"."acting_on_event_id" IS 'set when an event did it, not a person';

COMMENT ON COLUMN "fin"."sales_invoice_history"."reason" IS 'the decision reason';

COMMENT ON TABLE "fin"."book" IS 'S1 part 1 (rev 16): a STUB. The book a company keeps; its settings hang here, so a second book (G1) never moves them.
Columns come with the task that needs them, written in the engine history: base_currency (T23), framework Ind AS / AS / IFRS
(a 2nd book, G4), books_from and go_live (G2). The journal still keys entries to the company: journal_entry.book_id is G39.';

COMMENT ON COLUMN "fin"."book"."operated_party_id" IS 'the company whose book it is: Aikyat Biscuits (P&C''s "the company we run")';

COMMENT ON COLUMN "fin"."book"."book_code" IS 'PRIMARY';

COMMENT ON COLUMN "fin"."book"."display_name" IS 'Aikyat Biscuits · primary book';

COMMENT ON COLUMN "fin"."book"."is_primary" IS 'the statutory book; one per company. A secondary book (e.g. IFRS) comes with its task (G1)';

COMMENT ON TABLE "fin"."setting_definition" IS 'S1 part 1 (rev 16): the catalogue of settings a book can have. A NEW SETTING IS A ROW, NOT A COLUMN: the task that needs
it adds its row (fx_rate_source T23, aato_band G17, period_close_level G27 …), so nothing built is migrated. Shared reference data,
like fin.gst_state_code. Seeded with 2 rows (test: t24_schema_test.sql).';

COMMENT ON COLUMN "fin"."setting_definition"."setting_code" IS 'inventory_mode · costing_method';

COMMENT ON COLUMN "fin"."setting_definition"."display_name" IS 'Inventory accounting · Costing method';

COMMENT ON COLUMN "fin"."setting_definition"."allowed_values" IS '{perpetual,periodic} · {fifo,weighted_average} (LIFO not allowed: Ind AS 2)';

COMMENT ON COLUMN "fin"."setting_definition"."owner_task" IS 'the task that added it: S1 part 1 (for T24); later S4 owns both';

COMMENT ON COLUMN "fin"."setting_definition"."read_by" IS 'T24 rule R13, T11 · T24 rule R13, T9';

COMMENT ON TABLE "fin"."book_setting" IS 'S1 part 1 (rev 16): a book''s value of each setting, DATED. The rule reads the row in force on the invoice date and the
voucher stamps what it used, so an old voucher replays under its old setting (CLAUDE.md §3: rules versioned with dates).
BY HAND (out.sql): book_setting_no_overlap EXCLUDE (one value per book and setting on any day); trigger
book_setting_value_allowed (the value is in setting_definition.allowed_values).
Aikyat today (illustrative until the CA answers G3): inventory_mode = perpetual, costing_method = fifo, from 01-Apr-2026.';

COMMENT ON COLUMN "fin"."book_setting"."setting_value" IS 'one of the definition''s allowed_values (trigger, by hand): perpetual · fifo';

COMMENT ON COLUMN "fin"."book_setting"."effective_from" IS '01-Apr-2026 (illustrative: the CA decides, G3)';

COMMENT ON COLUMN "fin"."book_setting"."effective_until" IS 'NULL = in force. A change closes this row and adds a new one: never edited';

COMMENT ON COLUMN "fin"."book_setting"."reason" IS 'why the setting changed (Ind AS 8: a change of accounting policy is disclosed)';

COMMENT ON COLUMN "fin"."book_setting"."approved_by_contact_id" IS 'the Accounts Manager (Rajan)';

COMMENT ON TABLE "fin"."line_role" IS 'S1 part 2 (rev 17): the FIXED list of line roles, shared by the code and the mapping. The posting code writes a role on
each line, never a ledger code; the mapping turns the role into a ledger, and may only pick a ledger of the role''s kind and type
(trigger account_determination_guard). A new role comes only with new code (a new rule version).
Seeded with the 12 roles SALES_INVOICE v1 writes (t24_schema_test.sql). TCS (R7) has no role yet: the app does not compute it.';

COMMENT ON COLUMN "fin"."line_role"."line_role_code" IS 'customer · revenue · output_cgst · cogs · stock …';

COMMENT ON COLUMN "fin"."line_role"."display_name" IS 'Revenue from the line · Output CGST · Cost of goods sold (R13)';

COMMENT ON COLUMN "fin"."line_role"."ledger_source" IS 'determination: fin.account_determination gives the ledger · party_account: the customer''s own ledger (debtor_account.ledger_account_code, from its category), as SAP takes it from the customer master';

COMMENT ON COLUMN "fin"."line_role"."required_kind" IS 'the ledger must be of this kind: income (revenue) · liability (output GST) · asset · expense';

COMMENT ON COLUMN "fin"."line_role"."required_account_type" IS 'and of exactly this account_type (NULL: a ledger with none): output_cgst → only a ledger typed output_cgst';

COMMENT ON TABLE "fin"."posting_rule" IS 'S1 part 2 (rev 17): the REGISTER of the posting code: one row per released version of the one function per document type.
The logic is CODE, tested against the CA''s answer keys; it is not data. This row lets every line name the version that wrote it
(the FK from journal_line) and tells the completeness check which roles a version can write.
BY HAND (out.sql): posting_rule_no_overlap EXCLUDE (one version of a rule in force on any day).
Not per workspace: the code is the same for every company. What differs per book (the ledgers) is in fin.account_determination.';

COMMENT ON COLUMN "fin"."posting_rule"."rule_code" IS 'SALES_INVOICE (T25 adds SALES_CREDIT_NOTE, T26 SALES_DEBIT_NOTE)';

COMMENT ON COLUMN "fin"."posting_rule"."version" IS '1. Any change to the logic is a new version; the old one stays for the entries it made';

COMMENT ON COLUMN "fin"."posting_rule"."document_type" IS 'the document it posts: sales_invoice';

COMMENT ON COLUMN "fin"."posting_rule"."display_name" IS 'Sales invoice: the customer, revenue, GST and the cost of goods sold';

COMMENT ON COLUMN "fin"."posting_rule"."effective_from" IS '01-Apr-2026. The version in force on the posting date is used: an old event replays under its old rule';

COMMENT ON COLUMN "fin"."posting_rule"."effective_until" IS 'NULL = in force';

COMMENT ON COLUMN "fin"."posting_rule"."code_ref" IS 'where the logic is: app/sales/src/sales/engine.ts postingFor() (later: the engine''s posting code)';

COMMENT ON COLUMN "fin"."posting_rule"."casebook_ref" IS 'the tests it passed before release: casebook.test.ts · expected_postings.json (the CA''s answer keys)';

COMMENT ON COLUMN "fin"."posting_rule"."change_note" IS 'what changed from the previous version';

COMMENT ON TABLE "fin"."posting_rule_case" IS 'S1 part 2 (rev 17): the cases inside a rule version: which branch of the code wrote a line (R1 local goods, R13 the cost …).
A line common to every case (the customer, GST, round-off) names none. 13 rows for SALES_INVOICE v1.';

COMMENT ON COLUMN "fin"."posting_rule_case"."case_code" IS 'R1 … R13: the CA''s cases, as the app''s Posting rules screen lists them';

COMMENT ON COLUMN "fin"."posting_rule_case"."display_name" IS 'Goods, domestic, local (place of supply = our branch''s state)';

COMMENT ON TABLE "fin"."posting_rule_role" IS 'S1 part 2 (rev 17): the roles a rule version can write (SALES_INVOICE v1: 12). A line''s role must be one of its rule''s (FK);
the completeness check (fin.account_determination_gaps) asks whether a book maps every one of them before it goes live.';

COMMENT ON TABLE "fin"."account_determination" IS 'S1 part 2 (rev 17): THE LEDGER MAPPING: configuration, owned by the accounting administrators (a maker and a checker).
Book + document type + line role + conditions → ledger, dated. The look-up (fin.determine_ledger, by hand) takes the approved rows
in force on the posting date whose conditions are NULL or equal to the line''s facts; the most specific wins; none →
ACCOUNT_NOT_DETERMINED, a tie → ACCOUNT_AMBIGUOUS: the exception queue, never a guess.
The customer line is not mapped here: its ledger is the customer account''s own (debtor_account, from its category).
BY HAND (out.sql): specificity GENERATED · account_determination_no_overlap EXCLUDE (two approved rows with the same book, role and
conditions never overlap in time) · trigger account_determination_guard: the role is mapped here (ROLE_NOT_MAPPABLE); the ledger is
postable (LEDGER_NOT_POSTABLE) and of the role''s kind and type (ROLE_LEDGER_TYPE_MISMATCH); a decided row is final, only its end
date may be set, once (DETERMINATION_IS_FINAL); no start or end in a closed year (DETERMINATION_BACKDATED); never ended before a
posted line that used it (DETERMINATION_IN_USE).
Corrections never look up again: a reversal copies its lines'' ledgers (REVERSAL_NOT_A_MIRROR); a note against an invoice mirrors
the invoice''s lines (T25 / T26). Only a brand-new line is looked up.
Seeded (t24_schema_test.sql): 19 rows for Aikyat''s primary book = the app''s ledgers today (catalogue.ts LEDGERS + engine.ts
caseOf); illustrative until the CA confirms the chart (G18).';

COMMENT ON COLUMN "fin"."account_determination"."book_id" IS 'the BOOK, not only the company: an Ind AS book and an Indian GAAP book may map a role to different ledgers';

COMMENT ON COLUMN "fin"."account_determination"."document_type" IS 'sales_invoice · NULL = every document (Output CGST is the same ledger for an invoice and its notes)';

COMMENT ON COLUMN "fin"."account_determination"."line_role_code" IS 'revenue';

COMMENT ON COLUMN "fin"."account_determination"."party_kind" IS 'condition: domestic | export | sez · NULL = any';

COMMENT ON COLUMN "fin"."account_determination"."supply_scope" IS 'condition: intra_state | inter_state (place of supply vs our branch''s state) · NULL = any';

COMMENT ON COLUMN "fin"."account_determination"."line_kind" IS 'condition: goods | service | charge | reimbursement · NULL = any';

COMMENT ON COLUMN "fin"."account_determination"."taxability" IS 'condition: taxable | nil_rated | exempt | non_gst · NULL = any';

COMMENT ON COLUMN "fin"."account_determination"."settlement_mode" IS 'condition: credit | cash | upi_card · NULL = any';

COMMENT ON COLUMN "fin"."account_determination"."specificity" IS 'GENERATED (by hand): how many of the 6 conditions are set. The most specific matching row wins; a tie stops (ACCOUNT_AMBIGUOUS)';

COMMENT ON COLUMN "fin"."account_determination"."ledger_account_code" IS '401010 Sale of Products: postable, of the role''s kind and type (trigger)';

COMMENT ON COLUMN "fin"."account_determination"."effective_from" IS '01-Apr-2026. The look-up uses the POSTING DATE';

COMMENT ON COLUMN "fin"."account_determination"."effective_until" IS 'NULL = in force. A change closes this row and adds a new one (replaces_…): nothing is edited';

COMMENT ON COLUMN "fin"."account_determination"."status" IS 'proposed (the maker) → approved | rejected (the checker). Only approved rows are used';

COMMENT ON COLUMN "fin"."account_determination"."reason" IS 'why: "R1, R2: goods sold in India". A change is a change of accounting policy (Ind AS 8)';

COMMENT ON COLUMN "fin"."account_determination"."replaces_account_determination_id" IS 'the row this one replaces (closed on this one''s start date)';

COMMENT ON COLUMN "fin"."account_determination"."made_by_contact_id" IS 'the maker: the Accounts Executive (Teja)';

COMMENT ON COLUMN "fin"."account_determination"."checked_by_contact_id" IS 'the checker: the Accounts Manager (Rajan); never the maker';

COMMENT ON TABLE "fin"."account_determination_history" IS 'S1 part 2 (rev 17): every step of a mapping row, append-only (as sales_invoice_history): who proposed it, who approved,
rejected or closed it, and why. A mapping change is a change of accounting policy: this is its audit trail.';

COMMENT ON COLUMN "fin"."account_determination_history"."operation" IS 'propose | approve | reject | close';

COMMENT ON COLUMN "fin"."account_determination_history"."row_snapshot" IS 'the row as it then stood';

COMMENT ON COLUMN "fin"."account_determination_history"."performer_contact_id" IS 'Teja (propose) · Rajan (approve, reject, close)';

COMMENT ON TABLE "inv"."stock_lot" IS 'Rev 15: one row per lot received. Where the cost of goods sold comes from: FIFO takes the oldest lots, each at its own
unit_cost; weighted average takes Σ(quantity_left × unit_cost) ÷ Σ quantity_left. A ROUGH STUB for the demo: the inventory
module (receipts, issues, batches, its own history) replaces it (T8 / S4, G3). Σ(quantity_left × unit_cost) = the balance of
106020 Finished Goods (the T9 reconciliation).';

COMMENT ON COLUMN "inv"."stock_lot"."branch_id" IS 'the branch holding it: KA-01';

COMMENT ON COLUMN "inv"."stock_lot"."godown_code" IS 'KA-FG (finished goods)';

COMMENT ON COLUMN "inv"."stock_lot"."item_code" IS 'FG-101 Glucose biscuit (the item master is in code until T8, G20)';

COMMENT ON COLUMN "inv"."stock_lot"."lot_no" IS 'the batch: G-2604';

COMMENT ON COLUMN "inv"."stock_lot"."received_on" IS 'FIFO order: the oldest goes out first. 14-Apr-2026 (illustrative)';

COMMENT ON COLUMN "inv"."stock_lot"."quantity_received" IS '300';

COMMENT ON COLUMN "inv"."stock_lot"."quantity_left" IS '300 → 0 after B4-01 (FIFO)';

COMMENT ON COLUMN "inv"."stock_lot"."unit_cost" IS '₹540.0000 (illustrative). Weighted average: rewritten to the average after each issue';

ALTER TABLE "pc"."operated_party" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."private_anchor" ("anchor_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact" ADD FOREIGN KEY ("contact_id") REFERENCES "pc"."private_anchor" ("anchor_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party_trade_name" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party_identifier" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."business_location" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party_standing" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party_standing" ADD FOREIGN KEY ("operated_party_id") REFERENCES "pc"."operated_party" ("operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."party_standing" ADD FOREIGN KEY ("trade_name_id") REFERENCES "pc"."party_trade_name" ("trade_name_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact_party_association" ADD FOREIGN KEY ("contact_id") REFERENCES "pc"."contact" ("contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact_party_association" ADD FOREIGN KEY ("party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact_point" ADD FOREIGN KEY ("contact_id") REFERENCES "pc"."contact" ("contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact_point" ADD FOREIGN KEY ("business_location_id") REFERENCES "pc"."business_location" ("business_location_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."record_history" ADD FOREIGN KEY ("performer_contact_id") REFERENCES "pc"."contact" ("contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "pc"."contact" ADD FOREIGN KEY ("accountable_party_id") REFERENCES "pc"."party" ("party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."ledger_account" ADD FOREIGN KEY ("parent_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_category" ADD FOREIGN KEY ("ledger_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("debtor_category_code") REFERENCES "fin"."debtor_category" ("debtor_category_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request_approval" ADD FOREIGN KEY ("request_id") REFERENCES "fin"."customer_request" ("request_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request_history" ADD FOREIGN KEY ("request_id") REFERENCES "fin"."customer_request" ("request_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "party_id") REFERENCES "pc"."party" ("workspace_id", "party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "handed_over_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "created_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "submitted_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request" ADD FOREIGN KEY ("workspace_id", "collection_owner_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request_approval" ADD FOREIGN KEY ("workspace_id", "approver_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."customer_request_history" ADD FOREIGN KEY ("workspace_id", "performer_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("opened_from_request_id") REFERENCES "fin"."customer_request" ("request_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("debtor_category_code") REFERENCES "fin"."debtor_category" ("debtor_category_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("ledger_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_tax_registration" ADD FOREIGN KEY ("debtor_account_id") REFERENCES "fin"."debtor_account" ("debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_location" ADD FOREIGN KEY ("debtor_account_id") REFERENCES "fin"."debtor_account" ("debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_location" ADD FOREIGN KEY ("debtor_tax_registration_id") REFERENCES "fin"."debtor_tax_registration" ("debtor_tax_registration_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_credit_limit" ADD FOREIGN KEY ("debtor_account_id") REFERENCES "fin"."debtor_account" ("debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_credit_limit" ADD FOREIGN KEY ("source_request_id") REFERENCES "fin"."customer_request" ("request_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account_history" ADD FOREIGN KEY ("debtor_account_id") REFERENCES "fin"."debtor_account" ("debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("workspace_id", "party_id") REFERENCES "pc"."party" ("workspace_id", "party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("workspace_id", "party_standing_id") REFERENCES "pc"."party_standing" ("workspace_id", "party_standing_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("workspace_id", "collection_owner_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_tax_registration" ADD FOREIGN KEY ("workspace_id", "party_identifier_id") REFERENCES "pc"."party_identifier" ("workspace_id", "party_identifier_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_location" ADD FOREIGN KEY ("workspace_id", "business_location_id") REFERENCES "pc"."business_location" ("workspace_id", "business_location_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_credit_limit" ADD FOREIGN KEY ("workspace_id", "approved_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account_history" ADD FOREIGN KEY ("workspace_id", "performer_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."party_bank_account" ADD FOREIGN KEY ("workspace_id", "party_id") REFERENCES "pc"."party" ("workspace_id", "party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."debtor_account" ADD FOREIGN KEY ("workspace_id", "party_id", "refund_bank_account_id") REFERENCES "fin"."party_bank_account" ("workspace_id", "party_id", "party_bank_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."branch" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."branch" ADD FOREIGN KEY ("workspace_id", "business_location_id") REFERENCES "pc"."business_location" ("workspace_id", "business_location_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."branch" ADD FOREIGN KEY ("gst_identifier_id") REFERENCES "pc"."party_identifier" ("party_identifier_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."fiscal_year" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."fiscal_year" ADD FOREIGN KEY ("workspace_id", "closed_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."document_sequence" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_entry" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_entry" ADD FOREIGN KEY ("workspace_id", "fiscal_year_id") REFERENCES "fin"."fiscal_year" ("workspace_id", "fiscal_year_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_entry" ADD FOREIGN KEY ("workspace_id", "branch_id") REFERENCES "fin"."branch" ("workspace_id", "branch_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_entry" ADD FOREIGN KEY ("workspace_id", "reverses_journal_entry_id") REFERENCES "fin"."journal_entry" ("workspace_id", "journal_entry_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_entry" ADD FOREIGN KEY ("workspace_id", "posted_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("workspace_id", "journal_entry_id") REFERENCES "fin"."journal_entry" ("workspace_id", "journal_entry_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("ledger_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("workspace_id", "debtor_account_id") REFERENCES "fin"."debtor_account" ("workspace_id", "debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("workspace_id", "branch_id") REFERENCES "fin"."branch" ("workspace_id", "branch_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "branch_id") REFERENCES "fin"."branch" ("workspace_id", "branch_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "debtor_account_id") REFERENCES "fin"."debtor_account" ("workspace_id", "debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "amends_sales_invoice_id") REFERENCES "fin"."sales_invoice" ("workspace_id", "sales_invoice_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "original_sales_invoice_id") REFERENCES "fin"."sales_invoice" ("workspace_id", "sales_invoice_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "submitted_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "decided_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice" ADD FOREIGN KEY ("workspace_id", "journal_entry_id") REFERENCES "fin"."journal_entry" ("workspace_id", "journal_entry_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("workspace_id", "sales_invoice_id") REFERENCES "fin"."sales_invoice" ("workspace_id", "sales_invoice_id") ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("workspace_id", "debtor_account_id") REFERENCES "fin"."debtor_account" ("workspace_id", "debtor_account_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("ledger_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("workspace_id", "stock_lot_id") REFERENCES "inv"."stock_lot" ("workspace_id", "stock_lot_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_history" ADD FOREIGN KEY ("workspace_id", "sales_invoice_id") REFERENCES "fin"."sales_invoice" ("workspace_id", "sales_invoice_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_history" ADD FOREIGN KEY ("workspace_id", "performer_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "inv"."stock_lot" ADD FOREIGN KEY ("workspace_id", "branch_id") REFERENCES "fin"."branch" ("workspace_id", "branch_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."book" ADD FOREIGN KEY ("workspace_id", "operated_party_id") REFERENCES "pc"."operated_party" ("workspace_id", "operated_party_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."book_setting" ADD FOREIGN KEY ("workspace_id", "book_id") REFERENCES "fin"."book" ("workspace_id", "book_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."book_setting" ADD FOREIGN KEY ("setting_code") REFERENCES "fin"."setting_definition" ("setting_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."book_setting" ADD FOREIGN KEY ("workspace_id", "approved_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."posting_rule_case" ADD FOREIGN KEY ("rule_code", "version") REFERENCES "fin"."posting_rule" ("rule_code", "version") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."posting_rule_role" ADD FOREIGN KEY ("rule_code", "version") REFERENCES "fin"."posting_rule" ("rule_code", "version") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."posting_rule_role" ADD FOREIGN KEY ("line_role_code") REFERENCES "fin"."line_role" ("line_role_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("workspace_id", "book_id") REFERENCES "fin"."book" ("workspace_id", "book_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("line_role_code") REFERENCES "fin"."line_role" ("line_role_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("ledger_account_code") REFERENCES "fin"."ledger_account" ("account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("workspace_id", "replaces_account_determination_id") REFERENCES "fin"."account_determination" ("workspace_id", "account_determination_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("workspace_id", "made_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination" ADD FOREIGN KEY ("workspace_id", "checked_by_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination_history" ADD FOREIGN KEY ("workspace_id", "account_determination_id") REFERENCES "fin"."account_determination" ("workspace_id", "account_determination_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."account_determination_history" ADD FOREIGN KEY ("workspace_id", "performer_contact_id") REFERENCES "pc"."contact" ("workspace_id", "contact_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("rule_code", "rule_version", "line_role_code") REFERENCES "fin"."posting_rule_role" ("rule_code", "version", "line_role_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("rule_code", "rule_version", "rule_case") REFERENCES "fin"."posting_rule_case" ("rule_code", "version", "case_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."sales_invoice_line" ADD FOREIGN KEY ("workspace_id", "account_determination_id", "line_role_code", "determined_ledger_code") REFERENCES "fin"."account_determination" ("workspace_id", "account_determination_id", "line_role_code", "ledger_account_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("rule_code", "rule_version", "line_role_code") REFERENCES "fin"."posting_rule_role" ("rule_code", "version", "line_role_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("rule_code", "rule_version", "rule_case") REFERENCES "fin"."posting_rule_case" ("rule_code", "version", "case_code") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fin"."journal_line" ADD FOREIGN KEY ("workspace_id", "account_determination_id", "line_role_code", "determined_ledger_code") REFERENCES "fin"."account_determination" ("workspace_id", "account_determination_id", "line_role_code", "ledger_account_code") DEFERRABLE INITIALLY IMMEDIATE;

-- ---------------------------------------------------------------- by hand (rev 14), as Manoj's 0005 does for purchase_invoice
-- Billing's invoice number is booked once per GSTIN (branch) per financial year, ignoring case and spaces. A rejected or amended
-- voucher frees it; a voucher and its amendments (one chain) may share it.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "fin"."sales_invoice" ADD CONSTRAINT "sales_invoice_never_twice"
  EXCLUDE USING gist (workspace_id WITH =, branch_id WITH =, invoice_key WITH =, invoice_financial_year WITH =,
                      original_sales_invoice_id WITH <>) WHERE (stage NOT IN ('rejected', 'amended'));

-- ---------------------------------------------------------------- by hand (rev 16), S1 part 1: the book's dated settings
-- One value per book and setting on any day (as his fiscal_year no-overlap EXCLUDE).
ALTER TABLE "fin"."book_setting" ADD CONSTRAINT "book_setting_no_overlap"
  EXCLUDE USING gist (workspace_id WITH =, book_id WITH =, setting_code WITH =,
                      daterange(effective_from, effective_until, '[)') WITH &&);

-- The value must be one the catalogue allows (a CHECK cannot read another table).
CREATE FUNCTION fin.book_setting_value_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fin.setting_definition d
                 WHERE d.setting_code = NEW.setting_code AND NEW.setting_value = ANY (d.allowed_values)) THEN
    RAISE EXCEPTION 'SETTING_VALUE_NOT_ALLOWED: % = %', NEW.setting_code, NEW.setting_value
      USING ERRCODE = 'check_violation', CONSTRAINT = 'book_setting_value_allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER book_setting_value_allowed BEFORE INSERT OR UPDATE ON fin.book_setting
  FOR EACH ROW EXECUTE FUNCTION fin.book_setting_value_allowed();

-- ---------------------------------------------------------------- by hand (rev 17), S1 part 2: posting rules and the ledger mapping
-- One version of a rule in force on any day: the posting date picks exactly one.
ALTER TABLE "fin"."posting_rule" ADD CONSTRAINT "posting_rule_no_overlap"
  EXCLUDE USING gist (rule_code WITH =, daterange(effective_from, effective_until, '[)') WITH &&);

-- Two approved mapping rows with the same book, role and conditions never overlap in time (a NULL condition = "any").
ALTER TABLE "fin"."account_determination" ADD CONSTRAINT "account_determination_no_overlap"
  EXCLUDE USING gist (workspace_id WITH =, book_id WITH =, line_role_code WITH =, (coalesce(document_type, '*')) WITH =,
                      (coalesce(party_kind, '*')) WITH =, (coalesce(supply_scope, '*')) WITH =, (coalesce(line_kind, '*')) WITH =,
                      (coalesce(taxability, '*')) WITH =, (coalesce(settlement_mode, '*')) WITH =,
                      daterange(effective_from, effective_until, '[)') WITH &&) WHERE (status = 'approved');

-- What a CHECK cannot say (it cannot read another table, or the row before the change).
CREATE FUNCTION fin.account_determination_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r fin.line_role; l fin.ledger_account; company uuid; d date;
  fail CONSTANT text := 'account_determination_guard';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Never edited: only the decision (proposed → approved / rejected) and, once approved, the end date (set once).
    IF ROW(NEW.workspace_id, NEW.book_id, NEW.document_type, NEW.line_role_code, NEW.party_kind, NEW.supply_scope, NEW.line_kind,
           NEW.taxability, NEW.settlement_mode, NEW.ledger_account_code, NEW.effective_from, NEW.reason,
           NEW.replaces_account_determination_id, NEW.made_by_contact_id, NEW.made_at)
       IS DISTINCT FROM
       ROW(OLD.workspace_id, OLD.book_id, OLD.document_type, OLD.line_role_code, OLD.party_kind, OLD.supply_scope, OLD.line_kind,
           OLD.taxability, OLD.settlement_mode, OLD.ledger_account_code, OLD.effective_from, OLD.reason,
           OLD.replaces_account_determination_id, OLD.made_by_contact_id, OLD.made_at)
       OR (OLD.status <> 'proposed' AND ROW(NEW.status, NEW.checked_by_contact_id, NEW.checked_at)
                                         IS DISTINCT FROM ROW(OLD.status, OLD.checked_by_contact_id, OLD.checked_at))
       OR (NEW.effective_until IS DISTINCT FROM OLD.effective_until AND (OLD.status <> 'approved' OR OLD.effective_until IS NOT NULL))
    THEN
      RAISE EXCEPTION 'DETERMINATION_IS_FINAL: a decided mapping row is never edited; close it and add a new one'
        USING ERRCODE = 'check_violation', CONSTRAINT = fail;
    END IF;
  END IF;

  SELECT * INTO r FROM fin.line_role WHERE line_role_code = NEW.line_role_code;
  IF FOUND AND r.ledger_source <> 'determination' THEN
    RAISE EXCEPTION 'ROLE_NOT_MAPPABLE: % takes its ledger from %, not from the mapping', NEW.line_role_code, r.ledger_source
      USING ERRCODE = 'check_violation', CONSTRAINT = fail;
  END IF;
  SELECT * INTO l FROM fin.ledger_account WHERE account_code = NEW.ledger_account_code;
  IF FOUND AND l.is_group THEN
    RAISE EXCEPTION 'LEDGER_NOT_POSTABLE: % % is a group', l.account_code, l.display_name
      USING ERRCODE = 'check_violation', CONSTRAINT = fail;
  END IF;
  IF l.account_code IS NOT NULL AND r.line_role_code IS NOT NULL
     AND (l.kind <> r.required_kind OR l.account_type IS DISTINCT FROM r.required_account_type) THEN
    RAISE EXCEPTION 'ROLE_LEDGER_TYPE_MISMATCH: role % needs a ledger of kind % and type %; % is % / %', r.line_role_code,
      r.required_kind, coalesce(r.required_account_type, '(none)'), l.account_code, l.kind, coalesce(l.account_type, '(none)')
      USING ERRCODE = 'check_violation', CONSTRAINT = fail;
  END IF;

  -- No start (when made or approved) and no end (when set) inside a closed year of the book's company.
  SELECT operated_party_id INTO company FROM fin.book WHERE workspace_id = NEW.workspace_id AND book_id = NEW.book_id;
  FOREACH d IN ARRAY ARRAY[
      CASE WHEN TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN NEW.effective_from END,
      CASE WHEN NEW.effective_until IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.effective_until IS NULL) THEN NEW.effective_until END] LOOP
    IF d IS NOT NULL AND EXISTS (SELECT 1 FROM fin.fiscal_year y WHERE y.workspace_id = NEW.workspace_id
                                   AND y.operated_party_id = company AND y.is_closed AND d BETWEEN y.start_date AND y.end_date) THEN
      RAISE EXCEPTION 'DETERMINATION_BACKDATED: % is in a closed year', d USING ERRCODE = 'check_violation', CONSTRAINT = fail;
    END IF;
  END LOOP;

  -- Never ended before a posted line that used it: history stays true.
  IF NEW.effective_until IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.effective_until IS NULL) AND EXISTS (
       SELECT 1 FROM fin.journal_line jl JOIN fin.journal_entry je
                  ON je.workspace_id = jl.workspace_id AND je.journal_entry_id = jl.journal_entry_id
        WHERE jl.workspace_id = NEW.workspace_id AND jl.account_determination_id = NEW.account_determination_id
          AND je.posting_date >= NEW.effective_until) THEN
    RAISE EXCEPTION 'DETERMINATION_IN_USE: lines posted on or after % used this row', NEW.effective_until
      USING ERRCODE = 'check_violation', CONSTRAINT = fail;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER account_determination_guard BEFORE INSERT OR UPDATE ON fin.account_determination
  FOR EACH ROW EXECUTE FUNCTION fin.account_determination_guard();

-- The look-up (the engine calls it for each line the code wrote, on the posting date): the approved rows in force whose
-- conditions are NULL or equal to the line's facts; the most specific wins. None, or a tie: the exception queue, never a guess.
CREATE FUNCTION fin.determine_ledger(p_workspace text, p_book uuid, p_document_type text, p_role text, p_on date,
    p_party_kind text DEFAULT NULL, p_supply_scope text DEFAULT NULL, p_line_kind text DEFAULT NULL,
    p_taxability text DEFAULT NULL, p_settlement_mode text DEFAULT NULL)
  RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE n integer; found_id uuid;
BEGIN
  WITH m AS (
    SELECT d.account_determination_id, d.specificity FROM fin.account_determination d
     WHERE d.workspace_id = p_workspace AND d.book_id = p_book AND d.line_role_code = p_role AND d.status = 'approved'
       AND d.effective_from <= p_on AND (d.effective_until IS NULL OR p_on < d.effective_until)
       AND (d.document_type IS NULL OR d.document_type = p_document_type)
       AND (d.party_kind IS NULL OR d.party_kind = p_party_kind)
       AND (d.supply_scope IS NULL OR d.supply_scope = p_supply_scope)
       AND (d.line_kind IS NULL OR d.line_kind = p_line_kind)
       AND (d.taxability IS NULL OR d.taxability = p_taxability)
       AND (d.settlement_mode IS NULL OR d.settlement_mode = p_settlement_mode))
  SELECT count(*), min(account_determination_id::text)::uuid INTO n, found_id
    FROM m WHERE specificity = (SELECT max(specificity) FROM m);
  IF n = 0 THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_DETERMINED: no mapping row for % (%) on %', p_role, p_document_type, p_on
      USING ERRCODE = 'P0001', CONSTRAINT = 'account_not_determined';
  ELSIF n > 1 THEN
    RAISE EXCEPTION 'ACCOUNT_AMBIGUOUS: % equally specific mapping rows for % (%) on %', n, p_role, p_document_type, p_on
      USING ERRCODE = 'P0001', CONSTRAINT = 'account_ambiguous';
  END IF;
  RETURN found_id;
END $$;

-- Completeness, before a book goes live or a rule version is released: every role the rule versions in force can write
-- (except the customer's, which is the account's own ledger) has at least one approved row for the book on that date.
-- (A row per role, not per combination of facts: a missing combination still stops at ACCOUNT_NOT_DETERMINED, never guessed.)
CREATE FUNCTION fin.account_determination_gaps(p_workspace text, p_book uuid, p_on date)
  RETURNS TABLE (rule_code text, rule_version integer, document_type text, line_role_code text) LANGUAGE sql STABLE AS $$
  SELECT r.rule_code, r.version, r.document_type, rr.line_role_code
    FROM fin.posting_rule r
    JOIN fin.posting_rule_role rr ON rr.rule_code = r.rule_code AND rr.version = r.version
    JOIN fin.line_role lr ON lr.line_role_code = rr.line_role_code AND lr.ledger_source = 'determination'
   WHERE r.effective_from <= p_on AND (r.effective_until IS NULL OR p_on < r.effective_until)
     AND NOT EXISTS (SELECT 1 FROM fin.account_determination d
                      WHERE d.workspace_id = p_workspace AND d.book_id = p_book AND d.line_role_code = rr.line_role_code
                        AND d.status = 'approved' AND (d.document_type IS NULL OR d.document_type = r.document_type)
                        AND d.effective_from <= p_on AND (d.effective_until IS NULL OR p_on < d.effective_until))
   ORDER BY 1, 2, 4 $$;
