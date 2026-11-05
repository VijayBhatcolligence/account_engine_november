-- 007 · Evidence: claim, proposal, record_history.
--
-- Model §7. A claim about the world and the workspace's decision to rely on
-- it are different records.
--
-- REFERENCES AND VALUES WITH NO GRAMMAR. The model names several fields
-- here as typed references or typed content and does not say how they are
-- written: subject_ref, asserted_by_ref, evidence_ref, target_ref,
-- resolution_ref, activity_ref, decision_ref, asserted_values,
-- proposed_values, decision_context. Each is one JSON object, refused when
-- it is not an object or is empty. Their grammar is not decided here.
--
-- record_history HAS NO FIELD TABLE IN THE CURRENT MODEL, only prose. Its
-- fields are the earlier model's (git show 7621949:model/logical-model.md),
-- translated: recorded_by_actor_id becomes performer_contact_id and is
-- optional, because the current model says "attributable performer Contact
-- when known". Two things come from the current model's prose: the
-- operations also include merge and redact, and the decision basis is kept.
--
-- NOTHING HERE WRITES HISTORY. There are no audit triggers. The first write
-- path records history, because only it knows the performer and the
-- decision.

-- ── claim ────────────────────────────────────────────────────────────────────

CREATE TABLE pc.claim (
  claim_id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id     text        NOT NULL,
  claim_kind       text        NOT NULL,
  subject_ref      jsonb       NOT NULL,
  asserted_values  jsonb       NOT NULL,
  asserted_by_ref  jsonb       NULL,
  formation_method text        NOT NULL,
  evidence_ref     jsonb       NULL,
  valid_from       date        NULL,
  valid_until      date        NULL,
  observed_at      timestamptz NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_pkey PRIMARY KEY (claim_id),
  CONSTRAINT claim_kind_not_blank CHECK (btrim(claim_kind) <> ''),
  CONSTRAINT claim_subject_ref_is_a_reference
    CHECK (jsonb_typeof(subject_ref) = 'object' AND subject_ref <> '{}'::jsonb),
  CONSTRAINT claim_asserted_values_is_an_object
    CHECK (jsonb_typeof(asserted_values) = 'object' AND asserted_values <> '{}'::jsonb),
  CONSTRAINT claim_asserted_by_ref_is_a_reference
    CHECK (jsonb_typeof(asserted_by_ref) = 'object' AND asserted_by_ref <> '{}'::jsonb),
  CONSTRAINT claim_formation_method_valid
    CHECK (formation_method IN ('extraction', 'direct_observation', 'attestation', 'federation', 'inference')),
  CONSTRAINT claim_evidence_ref_is_a_reference
    CHECK (jsonb_typeof(evidence_ref) = 'object' AND evidence_ref <> '{}'::jsonb),
  CONSTRAINT claim_validity_is_ordered CHECK (valid_from < valid_until),
  CONSTRAINT claim_workspace_identity_key UNIQUE (workspace_id, claim_id)
);
COMMENT ON TABLE pc.claim IS
  'One immutable attributable assertion or evidence item about a fact governed by this product. Claims coexist and may disagree; stronger evidence does not overwrite weaker or earlier evidence. A claim carries no acceptance status and no confidence score.';
COMMENT ON COLUMN pc.claim.observed_at IS
  'When the evidence was observed. recorded_at is when Aikyat recorded the claim. They are different clocks.';
COMMENT ON COLUMN pc.claim.valid_from IS
  'With valid_until: the period the assertion concerns, when stated. Half-open, and empty means not known.';

CREATE TRIGGER claim_is_immutable
  BEFORE UPDATE ON pc.claim
  FOR EACH ROW EXECUTE FUNCTION pc.refuse_change('claim_is_immutable');

SELECT pc.isolate_by_workspace('pc.claim');

-- ── proposal ─────────────────────────────────────────────────────────────────
--
-- outcome is NOT a status column of the banned kind. It is the decision
-- itself: what was decided about this candidate.

CREATE TABLE pc.proposal (
  proposal_id      uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id     text        NOT NULL,
  record_kind      text        NOT NULL,
  target_ref       jsonb       NULL,
  proposed_values  jsonb       NOT NULL,
  outcome          text        NOT NULL DEFAULT 'open',
  decision_context jsonb       NULL,
  resolution_ref   jsonb       NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_pkey PRIMARY KEY (proposal_id),
  CONSTRAINT proposal_record_kind_not_blank CHECK (btrim(record_kind) <> ''),
  CONSTRAINT proposal_target_ref_is_a_reference
    CHECK (jsonb_typeof(target_ref) = 'object' AND target_ref <> '{}'::jsonb),
  CONSTRAINT proposal_proposed_values_is_an_object
    CHECK (jsonb_typeof(proposed_values) = 'object' AND proposed_values <> '{}'::jsonb),
  CONSTRAINT proposal_outcome_valid
    CHECK (outcome IN ('open', 'accepted', 'rejected', 'superseded', 'expired')),
  CONSTRAINT proposal_decision_context_is_an_object
    CHECK (jsonb_typeof(decision_context) = 'object' AND decision_context <> '{}'::jsonb),
  CONSTRAINT proposal_resolution_ref_is_a_reference
    CHECK (jsonb_typeof(resolution_ref) = 'object' AND resolution_ref <> '{}'::jsonb),
  CONSTRAINT proposal_workspace_identity_key UNIQUE (workspace_id, proposal_id)
);
COMMENT ON TABLE pc.proposal IS
  'One candidate accepted-record creation, change, identity merge or disposition. Each proposal concerns one governed decision. Rejection remains available as memory, so the same weak inference does not silently return.';

CREATE TRIGGER proposal_clocks
  BEFORE UPDATE ON pc.proposal
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at_and_touch_updated_at();

SELECT pc.isolate_by_workspace('pc.proposal');

-- ── proposal.supporting_claim_refs ───────────────────────────────────────────

CREATE TABLE pc.proposal_supporting_claim (
  workspace_id text        NOT NULL,
  proposal_id  uuid        NOT NULL,
  claim_id     uuid        NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_supporting_claim_pkey PRIMARY KEY (workspace_id, proposal_id, claim_id),
  CONSTRAINT proposal_supporting_claim_proposal_fkey
    FOREIGN KEY (workspace_id, proposal_id)
    REFERENCES pc.proposal (workspace_id, proposal_id) ON DELETE CASCADE,
  CONSTRAINT proposal_supporting_claim_claim_fkey
    FOREIGN KEY (workspace_id, claim_id) REFERENCES pc.claim (workspace_id, claim_id)
);
COMMENT ON TABLE pc.proposal_supporting_claim IS
  'The members of proposal.supporting_claim_refs: the claims available to the decision. Not a model record; the physical form of a logical set.';

CREATE TRIGGER proposal_supporting_claim_clocks
  BEFORE UPDATE ON pc.proposal_supporting_claim
  FOR EACH ROW EXECUTE FUNCTION pc.keep_recorded_at();

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX proposal_supporting_claim_claim_id_idx ON pc.proposal_supporting_claim (workspace_id, claim_id);

SELECT pc.isolate_by_workspace('pc.proposal_supporting_claim');

-- ── record_history ───────────────────────────────────────────────────────────

CREATE TABLE pc.record_history (
  history_id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  workspace_id         text        NOT NULL,
  record_type          text        NOT NULL,
  record_id            text        NOT NULL,
  version_number       integer     NOT NULL,
  operation            text        NOT NULL,
  row_snapshot         jsonb       NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  performer_contact_id uuid        NULL,
  activity_ref         jsonb       NULL,
  decision_ref         jsonb       NULL,
  CONSTRAINT record_history_pkey PRIMARY KEY (history_id),
  CONSTRAINT record_history_performer_contact_fkey
    FOREIGN KEY (workspace_id, performer_contact_id) REFERENCES pc.contact (workspace_id, contact_id),
  CONSTRAINT record_history_record_type_not_blank CHECK (btrim(record_type) <> ''),
  CONSTRAINT record_history_record_id_not_blank CHECK (btrim(record_id) <> ''),
  CONSTRAINT record_history_version_number_is_positive CHECK (version_number > 0),
  CONSTRAINT record_history_operation_valid
    CHECK (operation IN ('create', 'change', 'merge', 'delete', 'redact')),
  CONSTRAINT record_history_row_snapshot_is_an_object
    CHECK (jsonb_typeof(row_snapshot) = 'object'),
  CONSTRAINT record_history_activity_ref_is_a_reference
    CHECK (jsonb_typeof(activity_ref) = 'object' AND activity_ref <> '{}'::jsonb),
  CONSTRAINT record_history_decision_ref_is_a_reference
    CHECK (jsonb_typeof(decision_ref) = 'object' AND decision_ref <> '{}'::jsonb),
  -- A monotonic sequence within one record.
  CONSTRAINT record_history_one_entry_per_version
    UNIQUE (workspace_id, record_type, record_id, version_number)
);
COMMENT ON TABLE pc.record_history IS
  'Internal append-only audit of accepted creates, changes, merges, and governed deletion or redaction. Not a general cross-product temporal API: products that must preserve what they used copy the values into their own records. Governed personal-data erasure may redact eligible values; that mechanism is deferred by the model (§11) and will have to lift the append-only rule deliberately.';
COMMENT ON COLUMN pc.record_history.record_id IS
  'The accepted record that changed. Text, because not every record is keyed by a uuid: a workspace capacity is keyed by its code.';
COMMENT ON COLUMN pc.record_history.row_snapshot IS
  'The complete row after the write, or the last accepted row for a delete. The prior state is the previous version''s snapshot.';

-- Only a Person or System Contact performs an Activity. A Destination never does.
CREATE TRIGGER record_history_performer_is_not_a_destination
  BEFORE INSERT ON pc.record_history
  FOR EACH ROW EXECUTE FUNCTION pc.require_contact_kind(
    'performer_contact_id', 'person,system', 'record_history_performer_is_not_a_destination');

CREATE TRIGGER record_history_is_append_only
  BEFORE UPDATE OR DELETE ON pc.record_history
  FOR EACH ROW EXECUTE FUNCTION pc.refuse_change('record_history_is_append_only');

-- To follow each reference from the other side. Leads with workspace_id,
-- as every index on a workspace-owned table does.
CREATE INDEX record_history_performer_contact_id_idx ON pc.record_history (workspace_id, performer_contact_id);

SELECT pc.isolate_by_workspace('pc.record_history');
