# Linear and GitHub tracker routing

`ldk-linear-project-ops` and `ldk-github-project-ops` may be installed together and
may both be bound in one repository. Their native hierarchy, IDs, fields, views, and
status semantics remain independent.

Route each prompt before tracker reads or writes:

1. Explicit signals win. `linear.app`, `Linear`, and identifiers such as `ABC-123`
   route to Linear. `github.com`, `GitHub Project`, `gh project`, and identifiers
   such as `owner/repo#123` route to GitHub.
2. If only one valid repository binding exists, a generic project-operations prompt
   may use that tracker.
3. If both bindings exist and the prompt is generic, stop and ask the owner to name
   Linear or GitHub. Do not let both create-work skills run.
4. If both trackers are named, require an explicit source, destination, mapping, and
   write scope before any cross-tracker mutation. Otherwise remain read-only.
5. Never switch trackers because of stale conversation memory or similarly named
   projects.

Hooks provide advisory routing only. They are not background workers, so every skill
must preserve this boundary independently. When both plugins are bound, the GitHub
hook owns the single shared ambiguity notice; the Linear hook suppresses its duplicate.
