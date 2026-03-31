# Reviews / Approvals Required Fields v1

## Purpose
This document explains what fields must exist for the Reviews / Approvals pipeline to sync successfully and what additional narrative sections improve review quality.

## Required Structured Properties for Valid Sync
- Title
- Status
- Risk
- Route Target
- Needs Approval
- Sync Status

Missing any of the fields above may block export validation and prevent the item from being processed.

## Recommended Narrative Sections for High-Quality Review Items
- Summary
- Full Context
- Proposed Action
- Why This Was Triggered
- Risk Assessment
- Suggested Route
- Affected Components
- Operator Notes
- Revised Instructions
- Final Outcome

The pipeline does not strictly require these narrative sections, but leaving them blank reduces how useful the review page is to operators and approvers.

## Operator Rule
- Ensure every real review item provides all of the required structured fields.
- Mark templates or examples with Sync Status = Ignore so they are excluded from the mirror/export pipeline.
- Fill the narrative sections whenever a review needs meaningful context, risk explanation, or discussion about the requested action.

