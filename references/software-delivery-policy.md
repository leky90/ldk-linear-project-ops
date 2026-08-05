# Software delivery completion policy

Apply this policy to every issue whose managed metadata includes
`software.change`. Local implementation and passing tests are not delivered work.

## Default authority

A fully specified software issue in `Ready` authorizes only the actions listed in
`workflow.softwareDelivery.agentActions`. When the binding omits the policy, the
default authorizes commit, push, opening a pull request, and marking it ready for
review on a dedicated issue branch. Merge and deploy still require explicit
authority.

Never treat `automation paused` as a prohibition on an explicitly requested
interactive execution. Never claim work unless the same run can begin it.

## State gates

- Child `Done`: acceptance criteria verified, every scoped change accounted, and
  the child result anchored to a commit.
- Parent `In Review`: aggregate acceptance verified, scoped changes accounted,
  commit and pushed branch present, pull request ready for review, and CI passed.
- Parent `Done`: every review gate still passes, manager acceptance occurred after
  the latest delivery change, the pull request is merged, and deployment is
  verified when the binding or acceptance criteria require it.

An approval that predates a later commit, force-push, material PR update, or deploy
is stale and cannot close the issue. Re-request acceptance against the latest
artifact.

## Deterministic validation

Create a transient evidence JSON matching
`schemas/software-delivery-evidence.schema.json`, then run the packaged validator
before a software state transition:

```sh
node scripts/validate-software-delivery.mjs evidence.json \
  --target child-done|in-review|done \
  --binding .linear-project-ops.json
```

Do not change the target state unless `valid` is `true`. Store only durable,
non-secret evidence in Linear: commit SHA, branch, PR URL/state, CI result, merge,
deployment evidence, and acceptance timestamp. Keep transient validation files
outside Git or under the ignored coordination directory.

## Measurement

Post-delivery value measurement is a separate outcome unless the current issue's
acceptance criteria explicitly require it. Create a measurement issue or manager
decision instead of leaving a completed implementation ambiguously blocked or
claiming that unknown metrics were accepted.
