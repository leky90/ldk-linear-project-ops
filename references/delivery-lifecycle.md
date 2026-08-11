# Issue delivery lifecycle

## Two different completion gates

A role-phase Definition of Done proves that one owner may hand work to the next
role. It does not by itself prove that the Linear issue has delivered its real
outcome. An issue becomes `Done` only after its declared delivery mode has terminal
evidence.

Every new issue declares:

- `delivery.mode`: what real-world result closes the issue;
- `delivery.ownerRole`: who performs or verifies the terminal action;
- `delivery.target`: the recipient, channel, system, branch, environment, or other
  exact target when one exists;
- `delivery.verification`: observable checks required before `Done`.

Do not combine an approved plan and its later execution in one issue when they
have different owners, authorization, evidence, or delivery modes. For example,
an approved marketing plan is `artifact-review`; launching the campaign is a
separate `publish` issue.

## Delivery modes

| Mode | `Done` requires |
|---|---|
| `decision` | The authorized decision is recorded durably, including scope and effective consequence. |
| `artifact-review` | The canonical artifact is accepted by the required reviewer, with sources, assumptions, and limitations where relevant. |
| `publish` | The approved artifact or campaign is live at the declared target, with URL/status, measurement, and rollback or unpublish path when applicable. |
| `external-action` | The approved message, submission, outreach, purchase, filing, or other action actually occurred, with receipt/status and follow-up owner. |
| `software-merge` | The reviewed PR is merged into the declared integration branch, post-merge checks pass, durable evidence is linked, and disposable Git state is safely closed. |
| `production-release` | The exact build is deployed to the declared environment, production smoke checks pass, and rollback readiness is known. |
| `operations-change` | The authorized configuration, data, or operational change is applied, audited or smoke-tested, and recoverable. |

Typical non-software evidence includes:

- research or strategy: accepted canonical report, cited sources, assumptions, and
  limitations;
- marketing plan: approved channel, pricing, trial, creative, and measurement plan
  when launch is out of scope;
- campaign execution: live configuration, public or platform status, measurement,
  and rollback evidence;
- content or design: accepted final artifact, manifest, source/license provenance,
  and publish evidence only when publishing is in scope;
- sales or partnerships: approved proposal for planning work; sent/CRM/response
  evidence when outreach is in scope;
- legal or finance: authorized conclusion, or receipt/status when filing,
  registration, or payment is in scope;
- QA: the QA issue may finish with an accepted verdict/report, while the reviewed
  implementation issue remains open until its own delivery mode is complete.

## State transitions

Preferred workflow:

```text
Refinement → Ready → In Progress → In Review
                                      ├─ decision / artifact-review → Done
                                      └─ action mode → Ready to Deliver
                                                           ↓
                                                 Delivery Verification → Done
```

- `Ready to Deliver` means review and pre-delivery gates passed, but the terminal
  action has not yet been proven.
- `Delivery Verification` means the action occurred and its result, checks, and
  cleanup are being verified.
- Review changes return to `Ready` with the previous delivering role.
- A new commit, changed artifact, new P1/P2 finding, failed required check, or lost
  authorization invalidates prior approval and returns the issue to `In Review` or
  `Ready`, whichever matches the live owner.

The two preferred delivery states are optional custom Linear states. Resolve their
IDs from the consumer binding and live workflow. If either state is unavailable,
keep the issue in `In Review` and record `delivery.phase` as
`ready-to-deliver` or `delivery-verification` in the validated handoff/resource.
Never fabricate a status or use `Done` as a substitute.

## Authorization and evidence

Review acceptance authorizes only the reviewed deliverable. It does not imply
permission to publish, contact people, spend money, merge, deploy, file, or mutate
production. Perform an external or destructive action only when the user request,
issue contract, and repository/organization policy grant that authority.

Evidence must be durable and proportionate to the mode. Local files, an engineer
handoff, an unmerged PR, a draft campaign, or a proposed decision are not terminal
evidence. Historical legacy issues with already durable proof should be preserved;
reconciliation may record an inferred mode instead of reopening them solely because
the new metadata did not exist when they closed.
